"use client";

import { useEffect, useRef, type ReactNode } from "react";

// =============================================================================
// LogTerminal
// =============================================================================
//
// Terminal-style log viewer with a traffic-light header. Extracted from the
// LogViewer component and the StepLogViewer in PipelinePageShell.
//
// Usage:
//   <LogTerminal title="dev server output" lineCount={logs.length}>
//     {logs.map((entry, i) => (
//       <LogTerminal.Line key={i} timestamp={entry.timestamp} variant={entry.stream === "stderr" ? "error" : "default"}>
//         {entry.text}
//       </LogTerminal.Line>
//     ))}
//   </LogTerminal>

const MONO = "var(--font-geist-mono), ui-monospace, monospace";

// -- Root container ---------------------------------------------------------

export interface LogTerminalProps {
  /** Title shown in the terminal chrome bar. */
  title?: string;
  /** Number of lines (shown as metadata on the right of the header). */
  lineCount?: number;
  /** Action buttons rendered on the right side of the header (e.g. Clear). */
  headerRight?: ReactNode;
  /** Auto-scroll to bottom on new content. Default true. */
  autoScroll?: boolean;
  /** Extra className for the root container. */
  className?: string;
  /** The log line children. */
  children?: ReactNode;
  /** Empty state message when there are no children. */
  emptyMessage?: string;
  /** A dependency value to trigger auto-scroll (typically the child count). */
  scrollDep?: number;
}

export function LogTerminal({
  title,
  lineCount,
  headerRight,
  autoScroll = true,
  className = "",
  children,
  emptyMessage = "No output yet.",
  scrollDep = 0,
}: LogTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (autoScroll && stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollDep, autoScroll]);

  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <div className={`flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] ${className}`}>
      {/* Terminal chrome header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          {title && (
            <span className="ml-2 text-[11px] text-zinc-600" style={{ fontFamily: MONO }}>
              {title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {headerRight}
          {lineCount != null && (
            <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
              {lineCount} lines
            </span>
          )}
        </div>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ fontFamily: MONO }}
        className="flex-1 overflow-y-auto p-4 text-[13px] leading-5"
      >
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// -- Log line ---------------------------------------------------------------

export type LogLineVariant = "default" | "error" | "tool" | "tool-done" | "thinking";

export interface LogLineProps {
  /** Unix timestamp in ms. */
  timestamp?: number;
  /** Visual variant for color-coding. */
  variant?: LogLineVariant;
  /** Extra className for the line. */
  className?: string;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<LogLineVariant, string> = {
  default:     "text-zinc-300",
  error:       "text-red-400",
  tool:        "text-amber-400/80",
  "tool-done": "text-amber-400/80",
  thinking:    "text-zinc-500",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LogLine({ timestamp, variant = "default", className = "", children }: LogLineProps) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {timestamp != null && (
        <span className="shrink-0 select-none text-zinc-600">{formatTime(timestamp)}</span>
      )}
      <span className={`whitespace-pre-wrap ${VARIANT_CLASSES[variant]}`}>{children}</span>
    </div>
  );
}

// Attach Line as a static property so consumers can use <LogTerminal.Line />
LogTerminal.Line = LogLine;
