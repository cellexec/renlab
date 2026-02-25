"use client";

import type { Session } from "../hooks/useSessionStore";
import type { SubAgent } from "../agents";

interface SessionSidebarProps {
  sessions: Session[];
  activeClientId: string | null;
  getAgent: (id: string) => SubAgent | undefined;
  onSelect: (clientId: string) => void;
  onNewSession: () => void;
  onDelete: (clientId: string) => void;
  disabled?: boolean;
}

export function SessionSidebar({
  sessions,
  activeClientId,
  getAgent,
  onSelect,
  onNewSession,
  onDelete,
  disabled,
}: SessionSidebarProps) {
  return (
    <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="p-3">
        <button
          onClick={onNewSession}
          disabled={disabled}
          className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sessions.map((session) => {
          const isActive = session.clientId === activeClientId;
          const agent = getAgent(session.agentId);
          const agentColor = agent?.color ?? "bg-zinc-600";
          const preview =
            session.messages.find((m) => m.role === "user")?.content ?? "";
          const truncatedPreview =
            preview.length > 50 ? preview.slice(0, 50) + "..." : preview;

          return (
            <div
              key={session.clientId}
              role="button"
              tabIndex={0}
              onClick={() => !disabled && onSelect(session.clientId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !disabled) onSelect(session.clientId);
              }}
              className={`group relative mb-1 cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "border-l-2 border-blue-600 bg-zinc-800"
                  : "border-l-2 border-transparent hover:bg-zinc-800/50"
              } ${disabled ? "pointer-events-none opacity-60" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${agentColor}`}
                />
                <span className="truncate text-sm font-medium text-zinc-200">
                  {session.label}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 pl-[18px]">
                <span className="text-[10px] text-zinc-500">
                  {agent?.name ?? session.agentId}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {session.model}
                </span>
              </div>
              {truncatedPreview && (
                <p className="mt-1 truncate pl-[18px] text-xs text-zinc-500">
                  {truncatedPreview}
                </p>
              )}

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onDelete(session.clientId);
                }}
                className="absolute right-2 top-2 hidden rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300 group-hover:block"
                aria-label="Delete session"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

    </aside>
  );
}
