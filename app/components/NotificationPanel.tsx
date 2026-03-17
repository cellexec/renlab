"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNotificationContext } from "./NotificationContext";
import { useProjectContext } from "./ProjectContext";
import type { Notification } from "../notifications";

// ── Date grouping helpers ──────────────────────────────────────────────────

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (ts === today.getTime()) return "Today";
  if (ts === yesterday.getTime()) return "Yesterday";
  return "Older";
}

function groupByDate(items: Notification[]): { label: string; items: Notification[] }[] {
  const groups: { label: string; items: Notification[] }[] = [];
  let current: { label: string; items: Notification[] } | null = null;
  for (const n of items) {
    const label = dayLabel(n.createdAt);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(n);
  }
  return groups;
}

// ── Fuzzy search ──────────────────────────────────────────────────────────

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Type icon mapping ─────────────────────────────────────────────────────

function typeIcon(type: Notification["type"]): { icon: React.ReactNode; color: string } {
  switch (type) {
    case "pipeline_succeeded":
      return {
        color: "text-emerald-400",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "pipeline_failed":
      return {
        color: "text-red-400",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case "pipeline_stopped":
      return {
        color: "text-zinc-400",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
          </svg>
        ),
      };
    case "human_interaction_needed":
      return {
        color: "text-amber-400",
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        ),
      };
  }
}

// ── Time formatter ────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Panel component ───────────────────────────────────────────────────────

export function NotificationPanel() {
  const router = useRouter();
  const {
    notifications,
    panelOpen,
    closePanel,
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
  } = useNotificationContext();
  const { setActiveProjectId } = useProjectContext();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter notifications by search
  const filtered = useMemo(() => {
    if (!search) return notifications;
    return notifications.filter(
      (n) =>
        fuzzyMatch(n.title, search) ||
        (n.body && fuzzyMatch(n.body, search)) ||
        (n.metadata.specificationTitle && fuzzyMatch(n.metadata.specificationTitle, search)),
    );
  }, [notifications, search]);

  // Flat list for navigation
  const groups = useMemo(() => groupByDate(filtered), [filtered]);
  const flatList = useMemo(() => filtered, [filtered]);

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= flatList.length) {
      setSelectedIndex(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIndex]);

  // Reset state when panel opens
  useEffect(() => {
    if (panelOpen) {
      setSelectedIndex(0);
      setSearch("");
      setSearching(false);
    }
  }, [panelOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Open notification: switch project + navigate
  const openNotification = useCallback(
    (n: Notification) => {
      if (n.metadata.projectId) {
        setActiveProjectId(n.metadata.projectId);
      }
      if (n.link) {
        router.push(n.link);
      }
      if (!n.isRead) {
        markRead(n.id);
      }
      closePanel();
    },
    [setActiveProjectId, router, markRead, closePanel],
  );

  // Keyboard handler
  useEffect(() => {
    if (!panelOpen) return;

    const handler = (e: KeyboardEvent) => {
      // When in search mode, only handle Escape
      if (searching) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setSearching(false);
          setSearch("");
        }
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          closePanel();
          break;
        case "j":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case "k":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "g":
          e.preventDefault();
          setSelectedIndex(0);
          break;
        case "G":
          e.preventDefault();
          setSelectedIndex(Math.max(0, flatList.length - 1));
          break;
        case "Enter": {
          e.preventDefault();
          const n = flatList[selectedIndex];
          if (n) openNotification(n);
          break;
        }
        case "r":
          e.preventDefault();
          if (flatList[selectedIndex]) markRead(flatList[selectedIndex].id);
          break;
        case "R":
          e.preventDefault();
          markAllRead();
          break;
        case "d":
          e.preventDefault();
          if (flatList[selectedIndex]) dismiss(flatList[selectedIndex].id);
          break;
        case "D":
          e.preventDefault();
          dismissAll();
          break;
        case "/":
          e.preventDefault();
          setSearching(true);
          setTimeout(() => searchRef.current?.focus(), 0);
          break;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [panelOpen, searching, selectedIndex, flatList, openNotification, closePanel, markRead, markAllRead, dismiss, dismissAll]);

  if (!panelOpen) return null;

  // Build index map for selected tracking across groups
  let globalIndex = 0;

  return (
    <>
      <style>{`
        @keyframes dashOverlayIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        data-overlay-open
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        style={{ animation: "fadeIn 0.15s ease-out" }}
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
        style={{ animation: "dashOverlayIn 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span className="text-sm font-medium text-zinc-200">Notifications</span>
            {filtered.length > 0 && (
              <span className="text-[11px] text-zinc-500 ml-1">{filtered.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Kbd hints */}
            <div className="hidden md:flex items-center gap-1.5 text-[10px] text-zinc-600">
              <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">j/k</kbd>
              <span>nav</span>
              <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">Enter</kbd>
              <span>open</span>
              <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">r/R</kbd>
              <span>read</span>
              <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">d/D</kbd>
              <span>dismiss</span>
              <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">/</kbd>
              <span>search</span>
            </div>
            <button
              onClick={closePanel}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searching && (
          <div className="px-5 py-2 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearching(false);
                    setSearch("");
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    setSearching(false);
                    // Keep search results but refocus to list navigation
                  }
                }}
                placeholder="Filter notifications…"
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Notification list */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {flatList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <svg className="h-10 w-10 mb-3 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <p className="text-sm">{search ? "No matching notifications" : "No notifications"}</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 px-5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600 bg-zinc-950/90 backdrop-blur-sm border-b border-white/[0.04]">
                  {group.label}
                </div>
                {group.items.map((n) => {
                  const idx = globalIndex++;
                  const isSelected = idx === selectedIndex;
                  const { icon, color } = typeIcon(n.type);
                  return (
                    <div
                      key={n.id}
                      data-index={idx}
                      onClick={() => openNotification(n)}
                      className={`flex items-start gap-3 px-5 py-3 cursor-pointer transition-colors border-l-2 ${
                        isSelected
                          ? "bg-white/[0.04] border-l-violet-500"
                          : "border-l-transparent hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 ${color}`}>{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate ${n.isRead ? "text-zinc-400" : "text-zinc-100 font-medium"}`}>
                            {n.title}
                          </span>
                          {!n.isRead && (
                            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-violet-400" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-[12px] text-zinc-500 truncate mt-0.5">{n.body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-600">
                          <span>{timeAgo(n.createdAt)}</span>
                          {n.metadata.projectName && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span className="truncate">{n.metadata.projectName}</span>
                            </>
                          )}
                          {n.metadata.pipelineType && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span>{n.metadata.pipelineType}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Per-item kbd hints when selected */}
                      {isSelected && (
                        <div className="hidden md:flex items-center gap-1 shrink-0 self-center">
                          <kbd className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-mono text-zinc-600">Enter</kbd>
                          <kbd className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-mono text-zinc-600">r</kbd>
                          <kbd className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-mono text-zinc-600">d</kbd>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
