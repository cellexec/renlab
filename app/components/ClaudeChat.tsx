"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Model } from "./ModelSelect";
import type { Message, ContentBlock } from "../hooks/useSessionStore";

interface ClaudeChatProps {
  model: Model;
  messages: Message[];
  sessionId: string | null;
  clientId: string;
  systemPrompt?: string;
  projectPath?: string;
  onMessagesChange: (messages: Message[]) => void;
  onAddMessage: (
    clientId: string,
    role: "user" | "assistant",
    content: string
  ) => Promise<string>;
  onSessionIdReceived: (id: string) => void;
  onStreamingChange: (streaming: boolean) => void;
  className?: string;
}

export function ClaudeChat({
  model,
  messages,
  sessionId,
  clientId,
  systemPrompt,
  projectPath,
  onMessagesChange,
  onAddMessage,
  onSessionIdReceived,
  onStreamingChange,
  className,
}: ClaudeChatProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);

  // Keep ref in sync with prop
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Propagate streaming state changes
  useEffect(() => {
    onStreamingChange(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    // Persist user message to DB
    const userMsgId = await onAddMessage(clientId, "user", text);
    const userOrdinal = messagesRef.current.length + 1;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: text,
      ordinal: userOrdinal,
    };

    const withUser = [...messagesRef.current, userMsg];
    messagesRef.current = withUser;
    onMessagesChange(withUser);

    // Optimistic assistant placeholder
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
    onMessagesChange(withAssistant);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          model,
          ...(sessionId ? { sessionId } : {}),
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(projectPath ? { projectPath } : {}),
          clientId,
          ordinal: assistantOrdinal,
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
              onSessionIdReceived(parsed.sessionId);
            }
            if (parsed.assistantMessageId) {
              const current = messagesRef.current;
              const updated = current.map((msg, idx) =>
                idx === current.length - 1 && msg.role === "assistant"
                  ? { ...msg, id: parsed.assistantMessageId }
                  : msg
              );
              messagesRef.current = updated;
              onMessagesChange(updated);
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
                    ? {
                        ...msg,
                        content: msg.content + parsed.text,
                        blocks,
                      }
                    : msg
                );
                messagesRef.current = updated;
                onMessagesChange(updated);
              }
            } else if (parsed.type === "tool_use") {
              const current = messagesRef.current;
              const last = current[current.length - 1];
              if (last?.role === "assistant") {
                const blocks: ContentBlock[] = [
                  ...(last.blocks ?? []),
                  {
                    type: "tool_use",
                    name: parsed.name,
                    detail: parsed.detail,
                  },
                ];
                const updated = current.map((msg, idx) =>
                  idx === current.length - 1
                    ? { ...msg, blocks }
                    : msg
                );
                messagesRef.current = updated;
                onMessagesChange(updated);
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
              onMessagesChange(updated);
            }
            if (parsed.error) {
              const current = messagesRef.current;
              const updated = current.map((msg, idx) =>
                idx === current.length - 1
                  ? { ...msg, content: `Error: ${parsed.error}` }
                  : msg
              );
              messagesRef.current = updated;
              onMessagesChange(updated);
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
      onMessagesChange(updated);
    } finally {
      setIsStreaming(false);
    }
  }, [
    input,
    isStreaming,
    model,
    sessionId,
    clientId,
    systemPrompt,
    onMessagesChange,
    onAddMessage,
    onSessionIdReceived,
  ]);

  return (
    <div
      className={`flex flex-1 flex-col overflow-hidden ${className ?? ""}`}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-zinc-600">
            Send a message to start chatting with Claude Code
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`max-w-2xl ${msg.role === "user" ? "ml-auto" : ""}`}
          >
            <div className="mb-1 text-xs text-zinc-500">
              {msg.role === "user" ? "You" : "Claude"}
            </div>
            <div
              className={`rounded-lg px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white whitespace-pre-wrap"
                  : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {msg.role === "assistant" && msg.blocks && msg.blocks.length > 0
                ? msg.blocks.map((block, bi) =>
                    block.type === "text" ? (
                      <span key={bi} className="whitespace-pre-wrap">
                        {block.text}
                      </span>
                    ) : (
                      <div
                        key={bi}
                        className="my-1.5 rounded border border-amber-700/40 bg-amber-950/20 px-2.5 py-1.5 font-mono text-xs text-amber-300"
                      >
                        [{block.name}]{block.detail}
                      </div>
                    )
                  )
                : (
                  <span className="whitespace-pre-wrap">
                    {msg.content || (isStreaming ? "..." : "")}
                  </span>
                )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 px-6 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Claude Code something..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
