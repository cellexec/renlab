import { randomUUID } from "crypto";
import { getSupabase } from "../../lib/supabase";
import { startChatStream } from "../../lib/chatManager";

export const dynamic = "force-dynamic";

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

  // Start the stream in the background (fire and forget)
  startChatStream({
    prompt: userPrompt,
    model,
    sessionId,
    isResume,
    systemPrompt,
    allowedTools,
    projectPath,
    clientId,
    assistantMessageId,
  });

  return Response.json({ sessionId, assistantMessageId });
}
