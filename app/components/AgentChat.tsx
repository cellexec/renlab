"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAgentStore } from "../hooks/useAgentStore";
import { useSessionStore } from "../hooks/useSessionStore";
import { useProjectContext } from "./ProjectContext";
import type { Message, ContentBlock } from "../hooks/useSessionStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseSpecBlocks, hasSpecBlocks } from "../lib/parseSpecBlocks";

/** Get the plain text content from a message, joining text blocks if available */
function getMessageText(msg: Message): string {
  if (msg.blocks && msg.blocks.length > 0) {
    return msg.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  return msg.content;
}

/** Extract spec block content from a message, falling back to the full message */
function extractSpecContent(text: string): string {
  if (hasSpecBlocks(text)) {
    const parsed = parseSpecBlocks(text);
    const specSegments = parsed.segments.filter((s) => s.type === "spec");
    if (specSegments.length > 0) {
      return specSegments.map((s) => s.content).join("\n\n");
    }
  }
  return text;
}

interface AgentChatProps {
  agentName: string;
  /** Current specification content — injected as context in each prompt */
  context?: string;
  /** Callback when user clicks "Apply to Editor" on a spec block */
  onApplySpec?: (content: string) => void;
  /** Message to auto-send once the chat session is ready */
  initialMessage?: string;
  className?: string;
}

export function AgentChat({ agentName, context, onApplySpec, initialMessage, className }: AgentChatProps) {
  const { agents, loaded: agentsLoaded } = useAgentStore();
  const { activeProject } = useProjectContext();
  const {
    sessions,
    loaded: sessionsLoaded,
    createSession,
    updateMessages,
    setSessionId,
    addMessage,
  } = useSessionStore();

  const [clientId, setClientId] = useState<string | null>(null);
  const [sessionId, setLocalSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const initializedRef = useRef(false);
  const initialMessageSentRef = useRef(false);
  const contextRef = useRef(context);

  // Keep context ref in sync
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  /** Resize textarea to fit content, capped at ~8 lines */
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    // Cap at ~8 lines: text-sm line-height is ~20px, 8 * 20 = 160, plus py-2 padding (8+8)
    const maxHeight = 176;
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  // Auto-resize textarea when input changes (handles paste, deletions, etc.)
  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const agent = agents.find((a) => a.name === agentName);
  const session = sessions.find((s) => s.clientId === clientId);
  const messages = session?.messages ?? [];

  // Keep ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  // Auto-create session once agent is available
  useEffect(() => {
    if (!agentsLoaded || !sessionsLoaded || initializedRef.current || !agent) return;
    initializedRef.current = true;

    createSession(agent.id, agent.name, agent.model).then((cid) => {
      setClientId(cid);
    });
  }, [agentsLoaded, sessionsLoaded, agent, createSession]);

  const handleSessionIdReceived = useCallback(
    (id: string) => {
      setLocalSessionId(id);
      if (clientId) setSessionId(clientId, id);
    },
    [clientId, setSessionId]
  );

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming || !clientId || !agent) return;

    if (!overrideText) setInput("");
    setIsStreaming(true);

    // Reset textarea to single-line height
    if (!overrideText && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }

    // Store the user's visible message
    const userMsgId = await addMessage(clientId, "user", text);
    const userOrdinal = messagesRef.current.length + 1;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: text,
      ordinal: userOrdinal,
    };

    const withUser = [...messagesRef.current, userMsg];
    messagesRef.current = withUser;
    updateMessages(clientId, withUser);

    const assistantOrdinal = userOrdinal + 1;
    const placeholderMsg: Message = {
      id: "",
      role: "assistant",
      content: "",
      blocks: [],
      ordinal: assistantOrdinal,
    };
    const withAssistant = [...withUser, placeholderMsg];
    messagesRef.current = withAssistant;
    updateMessages(clientId, withAssistant);

    // Build the enriched prompt with context injection
    let enrichedPrompt = text;
    const currentContext = contextRef.current;
    if (currentContext) {
      enrichedPrompt = `<current-specification>\n${currentContext}\n</current-specification>\n\n${text}`;
    }

    // Build system prompt — in spec mode, append instructions to write specs
    let systemPrompt = agent.systemPrompt || "";
    if (onApplySpec) {
      const specInstructions = [
        "You are a specification writing assistant. Your ONLY job is to produce and revise technical specifications in Markdown.",
        "CRITICAL RULES:",
        "- NEVER modify, edit, or write any source code files. You do NOT have permission to change the codebase.",
        "- You may use the Read tool to inspect existing code for context, but NEVER attempt to Edit, Write, or execute anything.",
        "- Always respond by producing a complete specification wrapped in a ````spec fenced code block (4 backticks, so inner ``` code blocks don't break the fence).",
        "- The user's current specification is provided in <current-specification> tags. Build on it or revise it.",
        "- The user can apply your spec to the editor with one click — that is the ONLY way changes should happen.",
        "- Focus entirely on specification content: requirements, architecture, data models, API designs, user flows, implementation plans.",
        "- Even if the user asks you to 'just do it' or 'make the change', respond with a spec — never attempt implementation.",
      ].join("\n");
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${specInstructions}`
        : specInstructions;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: enrichedPrompt,
          model: agent.model,
          ...(sessionId ? { sessionId } : {}),
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(activeProject?.path ? { projectPath: activeProject.path } : {}),
          clientId,
          ordinal: assistantOrdinal,
          ...(onApplySpec ? { allowedTools: ["Read", "Glob", "Grep"] } : {}),
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const data = line.replace(/^data: /, "");
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.sessionId) {
              handleSessionIdReceived(parsed.sessionId);
            }
            if (parsed.assistantMessageId) {
              const current = messagesRef.current;
              const updated = current.map((msg, idx) =>
                idx === current.length - 1 && msg.role === "assistant"
                  ? { ...msg, id: parsed.assistantMessageId }
                  : msg
              );
              messagesRef.current = updated;
              updateMessages(clientId, updated);
            }
            if (parsed.type === "text_delta") {
              const current = messagesRef.current;
              const last = current[current.length - 1];
              if (last?.role === "assistant") {
                const blocks = [...(last.blocks ?? [])];
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock && lastBlock.type === "text") {
                  blocks[blocks.length - 1] = {
                    ...lastBlock,
                    text: lastBlock.text + parsed.text,
                  };
                } else {
                  blocks.push({ type: "text", text: parsed.text });
                }
                const updated = current.map((msg, idx) =>
                  idx === current.length - 1
                    ? { ...msg, content: msg.content + parsed.text, blocks }
                    : msg
                );
                messagesRef.current = updated;
                updateMessages(clientId, updated);
              }
            } else if (parsed.type === "tool_use") {
              const current = messagesRef.current;
              const last = current[current.length - 1];
              if (last?.role === "assistant") {
                const blocks: ContentBlock[] = [
                  ...(last.blocks ?? []),
                  { type: "tool_use", name: parsed.name, detail: parsed.detail },
                ];
                const updated = current.map((msg, idx) =>
                  idx === current.length - 1
                    ? { ...msg, blocks }
                    : msg
                );
                messagesRef.current = updated;
                updateMessages(clientId, updated);
              }
            } else if (parsed.text && !parsed.type) {
              // Legacy: plain { text } events without .type
              const current = messagesRef.current;
              const updated = current.map((msg, idx) =>
                idx === current.length - 1 && msg.role === "assistant"
                  ? { ...msg, content: msg.content + parsed.text }
                  : msg
              );
              messagesRef.current = updated;
              updateMessages(clientId, updated);
            }
            if (parsed.error) {
              const current = messagesRef.current;
              const updated = current.map((msg, idx) =>
                idx === current.length - 1
                  ? { ...msg, content: `Error: ${parsed.error}` }
                  : msg
              );
              messagesRef.current = updated;
              updateMessages(clientId, updated);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      const current = messagesRef.current;
      const updated = [...current];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        content: `Error: ${err}`,
      };
      messagesRef.current = updated;
      updateMessages(clientId, updated);
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, clientId, agent, sessionId, addMessage, updateMessages, handleSessionIdReceived]);

  // Auto-send initial message once session is ready
  useEffect(() => {
    if (!initialMessage || initialMessageSentRef.current || !clientId || !agent) return;
    initialMessageSentRef.current = true;
    send(initialMessage);
  }, [initialMessage, clientId, agent, send]);

  if (!agentsLoaded || !sessionsLoaded) {
    return (
      <div className={`flex items-center justify-center text-sm text-zinc-500 ${className ?? ""}`}>
        Loading...
      </div>
    );
  }

  if (!agent) {
    return (
      <div className={`flex items-center justify-center text-sm text-zinc-500 ${className ?? ""}`}>
        Agent &quot;{agentName}&quot; not found
      </div>
    );
  }

  // Determine if a message is the last assistant message and still streaming
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  const emptyStateText = context
    ? "Ask the agent to review your specification"
    : "Describe your project and the agent will help you write a specification";

  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-700 px-4 py-3">
        <div className={`h-2.5 w-2.5 rounded-full ${agent.color}`} />
        <span className="text-sm font-medium text-zinc-200">{agent.name}</span>
        <span className="text-xs text-zinc-500">{agent.model}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-zinc-600 text-center max-w-48">
              {emptyStateText}
            </p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isStreamingThis = isStreaming && i === lastAssistantIdx;
          // In spec mode: always render as markdown, show "Apply to Editor" when done
          // Outside spec mode: use spec block parsing for mixed content
          const isSpecMode = !!onApplySpec;
          const msgText = msg.role === "assistant" ? getMessageText(msg) : "";
          const showSpecBlocks = !isSpecMode && msg.role === "assistant" && !isStreamingThis && hasSpecBlocks(msgText);
          const showApplyButton = isSpecMode && msg.role === "assistant" && !isStreamingThis && !!msgText;

          return (
            <div key={msg.id || i}>
              <div className="mb-1 text-[10px] text-zinc-500">
                {msg.role === "user" ? "You" : agent.name}
              </div>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600/20 text-zinc-200"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {msg.role === "assistant" && msg.content ? (
                  showSpecBlocks ? (
                    <SpecBlockMessage content={msgText} onApplySpec={onApplySpec!} />
                  ) : msg.blocks && msg.blocks.length > 0 ? (
                    <>
                    {msg.blocks.map((block, bi) =>
                      block.type === "text" ? (
                        <div key={bi} className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <div
                          key={bi}
                          className="my-1.5 rounded border border-amber-700/40 bg-amber-950/20 px-2.5 py-1.5 font-mono text-xs text-amber-300"
                        >
                          [{block.name}]{block.detail}
                        </div>
                      )
                    )}
                    {isStreamingThis && msg.blocks[msg.blocks.length - 1]?.type === "tool_use" && (
                      <div className="my-1.5 flex items-center gap-2 text-xs text-zinc-500">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Thinking...
                      </div>
                    )}
                  </>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content || (isStreaming ? "..." : "")}</span>
                )}
              </div>
              {showApplyButton && (
                <button
                  onClick={() => {
                    const specContent = extractSpecContent(getMessageText(msg));
                    onApplySpec!(specContent);
                  }}
                  className="mt-1.5 rounded px-2.5 py-1 text-[11px] font-medium text-cyan-300 bg-cyan-600/20 border border-cyan-600/30 transition-colors hover:bg-cyan-600/30"
                >
                  Apply to Editor
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-700 px-3 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Ask ${agent.name}...`}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500 resize-none overflow-hidden"
            disabled={isStreaming || !clientId}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim() || !clientId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

/** Renders an assistant message with parsed spec blocks and "Apply to Editor" buttons */
function SpecBlockMessage({
  content,
  onApplySpec,
}: {
  content: string;
  onApplySpec: (content: string) => void;
}) {
  const parsed = parseSpecBlocks(content);

  return (
    <div className="space-y-3">
      {parsed.segments.map((seg, i) =>
        seg.type === "text" ? (
          <div key={i} className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
          </div>
        ) : (
          <div key={i} className="rounded-lg border border-cyan-700/40 bg-cyan-950/20 overflow-hidden">
            <div className="flex items-center justify-between border-b border-cyan-700/30 px-3 py-1.5">
              <span className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider">Specification</span>
              <button
                onClick={() => onApplySpec(seg.content)}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-cyan-300 bg-cyan-600/20 border border-cyan-600/30 transition-colors hover:bg-cyan-600/30"
              >
                Apply to Editor
              </button>
            </div>
            <div className="px-3 py-2 max-h-48 overflow-y-auto">
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">{seg.content}</pre>
            </div>
          </div>
        )
      )}
    </div>
  );
}
