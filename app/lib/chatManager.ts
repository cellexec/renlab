import { stream } from "node-claude-sdk";
import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { hasKnowledgeBase, getArchitectureOverview } from "./knowledgeManager";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatSSEEvent =
  | { type: "init"; sessionId: string; assistantMessageId: string | null }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; detail: string }
  | { type: "ask_user_question"; questions: unknown[] }
  | { type: "error"; error: string }
  | { type: "done" };

interface ChatStreamState {
  status: "streaming" | "done" | "error";
  events: ChatSSEEvent[];
  clients: Set<(event: ChatSSEEvent) => void>;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; detail: string }
  | { type: "ask_user_question"; questions: unknown[] };

// ── HMR-safe singleton ───────────────────────────────────────────────────────

const GLOBAL_KEY = Symbol.for("__chatStreams__");
const g = globalThis as unknown as Record<symbol, Map<string, ChatStreamState>>;
function getStreams(): Map<string, ChatStreamState> {
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function broadcast(clientId: string, event: ChatSSEEvent) {
  const state = getStreams().get(clientId);
  if (!state) return;
  state.events.push(event);
  for (const cb of state.clients) {
    try { cb(event); } catch {}
  }
}

function formatToolDetail(name: string, input: Record<string, unknown>): string {
  if (input.file_path) return ` ${input.file_path}`;
  if (name === "Bash" && input.command) return ` $ ${String(input.command).slice(0, 120)}`;
  if (input.description) return ` ${String(input.description).slice(0, 120)}`;
  if (input.pattern) return ` ${input.pattern}`;
  if (input.query) return ` ${String(input.query).slice(0, 120)}`;
  if (input.prompt) return ` ${String(input.prompt).slice(0, 120)}`;
  return "";
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ChatStreamParams {
  prompt: string;
  model: string;
  sessionId: string;
  isResume: boolean;
  systemPrompt?: string;
  allowedTools?: string[];
  projectPath?: string;
  clientId: string;
  assistantMessageId: string | null;
}

export function startChatStream(params: ChatStreamParams) {
  const streams = getStreams();

  const state: ChatStreamState = {
    status: "streaming",
    events: [],
    clients: new Set(),
  };
  streams.set(params.clientId, state);

  // Fire and forget
  runChatStream(params, state).catch(() => {});
}

export function getChatStreamState(clientId: string): { status: string; events: ChatSSEEvent[] } | null {
  const state = getStreams().get(clientId);
  if (!state) return null;
  return { status: state.status, events: state.events };
}

export function getBufferedChatEvents(clientId: string): ChatSSEEvent[] {
  return getStreams().get(clientId)?.events ?? [];
}

export function addChatClient(clientId: string, callback: (event: ChatSSEEvent) => void): () => void {
  const streams = getStreams();
  let state = streams.get(clientId);
  if (!state) {
    // Create a placeholder so late-connecting clients can at least subscribe
    state = { status: "done", events: [], clients: new Set() };
    streams.set(clientId, state);
  }
  state.clients.add(callback);
  return () => { state!.clients.delete(callback); };
}

// ── Stream runner ────────────────────────────────────────────────────────────

async function runChatStream(params: ChatStreamParams, state: ChatStreamState) {
  const { prompt, model, sessionId, isResume, systemPrompt, allowedTools, projectPath, clientId, assistantMessageId } = params;

  const blocks: ContentBlock[] = [];
  let currentToolName: string | null = null;
  let toolInputJson = "";
  let lastFlush = 0;
  let activeSessionId = sessionId;

  function serializeContent(): string {
    return JSON.stringify(blocks);
  }

  function flushDb() {
    if (!assistantMessageId || blocks.length === 0) return;
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
    // Inject project knowledge
    let finalSystemPrompt = systemPrompt || "";
    if (projectPath) {
      try {
        const hasKb = await hasKnowledgeBase(projectPath);
        if (hasKb) {
          const overview = await getArchitectureOverview(projectPath);
          if (overview) {
            const knowledgeBlock = `\n<project-knowledge>\n${overview}\n</project-knowledge>\nUse this knowledge to write better specifications grounded in the project's actual architecture.`;
            finalSystemPrompt = finalSystemPrompt ? `${finalSystemPrompt}\n${knowledgeBlock}` : knowledgeBlock;
          }
        }
      } catch {}
    }

    // Create the stream (with resume fallback)
    function createStream(useResume: boolean, sid: string) {
      return stream(prompt, {
        model,
        ...(useResume ? { resume: sid } : { sessionId: sid }),
        ...(finalSystemPrompt ? { appendSystemPrompt: finalSystemPrompt } : {}),
        ...(allowedTools ? { allowedTools } : {}),
        ...(projectPath ? { cwd: projectPath } : {}),
      });
    }

    let messages;
    if (isResume) {
      try {
        const iter = createStream(true, sessionId);
        const first = await (async function() { for await (const m of iter) return m; })();
        if (!first) throw new Error("Empty stream");
        messages = (async function* () {
          yield first;
          for await (const m of iter) yield m;
        })();
      } catch {
        // Resume failed — fresh session
        activeSessionId = randomUUID();
        messages = createStream(false, activeSessionId);
        broadcast(clientId, { type: "init", sessionId: activeSessionId, assistantMessageId });
      }
    } else {
      messages = createStream(false, sessionId);
    }

    // Process the stream
    for await (const msg of messages) {
      if (msg.type !== "stream_event") continue;
      const { event } = msg;

      if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use" && event.content_block.name) {
          currentToolName = event.content_block.name;
          toolInputJson = "";
        } else {
          currentToolName = null;
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          const text = event.delta.text;
          const last = blocks[blocks.length - 1];
          if (last && last.type === "text") {
            last.text += text;
          } else {
            blocks.push({ type: "text", text });
          }
          broadcast(clientId, { type: "text_delta", text });
          flushDb();
        } else if (event.delta?.type === "input_json_delta") {
          const partial = (event.delta as Record<string, string>).partial_json ?? event.delta.text ?? "";
          toolInputJson += partial;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolName) {
          let detail = "";
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = JSON.parse(toolInputJson) as Record<string, unknown>;
            detail = formatToolDetail(currentToolName, parsedInput);
          } catch {}

          if (currentToolName === "AskUserQuestion" && Array.isArray(parsedInput.questions)) {
            const block = { type: "ask_user_question" as const, questions: parsedInput.questions };
            blocks.push(block);
            broadcast(clientId, block);
          } else {
            blocks.push({ type: "tool_use", name: currentToolName, detail });
            broadcast(clientId, { type: "tool_use", name: currentToolName, detail });
          }
          flushDb();
          currentToolName = null;
          toolInputJson = "";
        }
      }
    }

    // Final DB update (only if we have content)
    if (assistantMessageId && blocks.length > 0) {
      await getSupabase().from("messages").update({ content: serializeContent() }).eq("id", assistantMessageId);
    }
    if (clientId) {
      await getSupabase().from("sessions").update({ session_id: activeSessionId }).eq("client_id", clientId);
    }

    state.status = "done";
    broadcast(clientId, { type: "done" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (assistantMessageId) {
      await getSupabase().from("messages").update({ content: `Error: ${message}` }).eq("id", assistantMessageId);
    }

    state.status = "error";
    broadcast(clientId, { type: "error", error: message });
  }

  // Clean up after 5 minutes
  setTimeout(() => { getStreams().delete(clientId); }, 5 * 60 * 1000);
}
