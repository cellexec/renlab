"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "../lib/devServerManager";

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogViewer({ logs, onClear }: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Track if user has scrolled away from bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stickToBottom.current = atBottom;
  };

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      {/* Terminal chrome header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-xs text-zinc-600">dev server output</span>
        </div>
        <button
          onClick={onClear}
          className="rounded px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
        className="flex-1 overflow-y-auto p-4 text-[13px] leading-5"
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            No output yet. Start the dev server to see logs.
          </div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 select-none text-zinc-600">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className={
                  entry.stream === "stderr" ? "text-red-400" : "text-zinc-300"
                }
              >
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
