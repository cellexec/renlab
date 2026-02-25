import { stream } from "claude-agent-sdk";
import { randomUUID } from "crypto";
import { getSupabase } from "../../lib/supabase";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; detail: string };

function formatToolDetail(
  name: string,
  input: Record<string, unknown>
): string {
  if (input.file_path) return ` ${input.file_path}`;
  if (name === "Bash" && input.command)
    return ` $ ${String(input.command).slice(0, 120)}`;
  if (input.description) return ` ${String(input.description).slice(0, 120)}`;
  if (input.pattern) return ` ${input.pattern}`;
  if (input.query) return ` ${String(input.query).slice(0, 120)}`;
  if (input.prompt) return ` ${String(input.prompt).slice(0, 120)}`;
  return "";
}

export async function POST(req: Request) {
  const {
    prompt: userPrompt,
    model = "sonnet",
    sessionId: incomingSessionId,
    systemPrompt,
    clientId,
    ordinal,
    allowedTools,
    projectPath,
  } = await req.json();

  const isResume = !!incomingSessionId;
  const sessionId = incomingSessionId || randomUUID();

  // Insert empty assistant message row for streaming
  let assistantMessageId: string | null = null;
  if (clientId && ordinal != null) {
    const { data } = await getSupabase()
      .from("messages")
      .insert({
        session_client_id: clientId,
        role: "assistant",
        content: "",
        ordinal,
      })
      .select("id")
      .single();
    assistantMessageId = data?.id ?? null;
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Send sessionId + assistantMessageId to client immediately
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ sessionId, assistantMessageId })}\n\n`
        )
      );

      const blocks: ContentBlock[] = [];
      let currentToolName: string | null = null;
      let toolInputJson = "";
      let lastFlush = 0;

      function serializeContent(): string {
        return JSON.stringify(blocks);
      }

      function flushDb() {
        if (!assistantMessageId) return;
        const now = Date.now();
        if (now - lastFlush > 500) {
          lastFlush = now;
          getSupabase()
            .from("messages")
            .update({ content: serializeContent() })
            .eq("id", assistantMessageId)
            .then(() => {});
        }
      }

      try {
        const messages = stream(userPrompt, {
          model,
          ...(isResume ? { resume: sessionId } : { sessionId }),
          ...(systemPrompt ? { appendSystemPrompt: systemPrompt } : {}),
          ...(allowedTools ? { allowedTools } : {}),
          ...(projectPath ? { cwd: projectPath } : {}),
        });

        for await (const msg of messages) {
          if (msg.type !== "stream_event") continue;
          const { event } = msg;

          if (event.type === "content_block_start") {
            if (
              event.content_block?.type === "tool_use" &&
              event.content_block.name
            ) {
              currentToolName = event.content_block.name;
              toolInputJson = "";
            } else {
              currentToolName = null;
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta" && event.delta.text) {
              const text = event.delta.text;
              // Append to last text block or create new one
              const last = blocks[blocks.length - 1];
              if (last && last.type === "text") {
                last.text += text;
              } else {
                blocks.push({ type: "text", text });
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text_delta", text })}\n\n`
                )
              );
              flushDb();
            } else if (event.delta?.type === "input_json_delta") {
              const partial =
                (event.delta as Record<string, string>).partial_json ??
                event.delta.text ??
                "";
              toolInputJson += partial;
            }
          } else if (event.type === "content_block_stop") {
            if (currentToolName) {
              let detail = "";
              try {
                const input = JSON.parse(toolInputJson) as Record<
                  string,
                  unknown
                >;
                detail = formatToolDetail(currentToolName, input);
              } catch {}
              blocks.push({
                type: "tool_use",
                name: currentToolName,
                detail,
              });
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "tool_use", name: currentToolName, detail })}\n\n`
                )
              );
              flushDb();
              currentToolName = null;
              toolInputJson = "";
            }
          }
        }

        // Final update with complete content
        if (assistantMessageId) {
          await getSupabase()
            .from("messages")
            .update({ content: serializeContent() })
            .eq("id", assistantMessageId);
        }

        // Update session_id on sessions row for new sessions
        if (clientId) {
          await getSupabase()
            .from("sessions")
            .update({ session_id: sessionId })
            .eq("client_id", clientId);
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        // Update message with error text
        if (assistantMessageId) {
          await getSupabase()
            .from("messages")
            .update({ content: `Error: ${message}` })
            .eq("id", assistantMessageId);
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
