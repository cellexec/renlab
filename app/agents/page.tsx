"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAgentStore } from "../hooks/useAgentStore";
import { AgentEditor } from "../components/AgentEditor";
import type { SubAgent } from "../agents";

// ── Fuzzy search ──────────────────────────────────────────────────────────────

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function fuzzyIndices(text: string, query: string): Set<number> | null {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const indices = new Set<number>();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return null;
    indices.add(idx);
    ti = idx + 1;
  }
  return indices;
}

function FuzzyText({ text, query, className, highlightClass }: {
  text: string; query: string; className?: string; highlightClass?: string;
}) {
  if (!query) return <span className={className}>{text}</span>;
  const indices = fuzzyIndices(text, query);
  if (!indices || indices.size === 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {Array.from(text).map((ch, i) =>
        indices.has(i) ? (
          <span key={i} className={highlightClass ?? "text-violet-300 font-semibold"}>{ch}</span>
        ) : (<span key={i}>{ch}</span>)
      )}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const router = useRouter();
  const { agents, loaded, addAgent, updateAgent, deleteAgent } = useAgentStore();

  // --- UI state ---
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState<SubAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SubAgent | null>(null);
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Filtered list ---
  const filtered = useMemo(() => {
    if (!query) return agents;
    return agents.filter((a) =>
      fuzzyMatch(a.name, query) || fuzzyMatch(a.description, query) || fuzzyMatch(a.model, query)
    );
  }, [agents, query]);

  // --- Reset selection on query change ---
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // --- Scroll into view ---
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-item-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedIndex]);

  // --- Mouse guard ---
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      if (!mouseActive && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) setMouseActive(true);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [mouseActive]);

  // --- Save handler ---
  const handleSave = (data: Omit<SubAgent, "id"> & { id?: string }) => {
    if (data.id) {
      const { id, ...rest } = data;
      updateAgent(id, rest);
    } else {
      addAgent(data);
    }
    setEditing(null);
    setCreating(false);
  };

  // --- Keyboard handler ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Layer 1: Delete confirm dialog
      if (confirmDelete) {
        if (e.key === "Enter") {
          e.preventDefault();
          deleteAgent(confirmDelete.id);
          setConfirmDelete(null);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setConfirmDelete(null);
          return;
        }
        return;
      }

      // Layer 2: Editor overlay
      if (creating || editing) return;

      // Layer 3: Search focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (query) { setQuery(""); } else { searchRef.current?.blur(); setSearchFocused(false); }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          searchRef.current?.blur();
          setSearchFocused(false);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        return;
      }

      // Layer 4: List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "/") {
        e.preventDefault();
        setSearchFocused(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const agent = filtered[selectedIndex];
        if (agent) setEditing(agent);
      } else if (e.key === "n") {
        e.preventDefault();
        setCreating(true);
      } else if (e.key === "d") {
        e.preventDefault();
        const agent = filtered[selectedIndex];
        if (agent) setConfirmDelete(agent);
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push("/");
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [searchFocused, query, filtered, selectedIndex, creating, editing, confirmDelete, deleteAgent, router]);

  if (!loaded) return null;

  const selectedId = filtered[selectedIndex]?.id;

  return (
    <div className="flex h-full flex-col text-zinc-100">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-zinc-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Agents</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} — create and manage agents for chat sessions
            </p>
          </div>
          <button
            tabIndex={-1}
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">n</kbd>
          </button>
        </div>
      </div>

      {/* Content area with boxed panel */}
      <div className="flex-1 min-h-0 overflow-hidden p-5">
        <div className="flex flex-col h-full rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 overflow-hidden">
          {/* Search bar */}
          <div className="shrink-0 border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              {!searchFocused && !query && (
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">/</kbd>
              )}
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Filter agents…"
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
              />
            </div>
          </div>

          {/* Agent list */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                {agents.length === 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <svg className="h-10 w-10 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
                    </svg>
                    <p className="text-sm text-zinc-600">No agents yet</p>
                    <p className="text-[12px] text-zinc-700">Press <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">n</kbd> to create one</p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600">No matching agents</p>
                )}
              </div>
            ) : (
              filtered.map((agent, i) => {
                const isSelected = agent.id === selectedId && !searchFocused;
                return (
                  <div
                    key={agent.id}
                    data-item-index={i}
                    onClick={() => setEditing(agent)}
                    onMouseMove={() => { if (mouseActive && selectedIndex !== i) setSelectedIndex(i); }}
                    className={`border-b border-white/[0.04] px-6 py-4 transition-all duration-100 cursor-pointer border-l-2 ${
                      isSelected
                        ? "bg-violet-500/[0.06] border-l-violet-500/60"
                        : "border-l-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-3 w-3 shrink-0 rounded-full ${agent.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <FuzzyText text={agent.name} query={query} className={`text-sm font-medium ${isSelected ? "text-zinc-100" : "text-zinc-300"}`} />
                          <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500 font-mono">
                            {agent.model}
                          </span>
                          {isSelected && (
                            <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">Enter to edit</kbd>
                          )}
                        </div>
                        {agent.description && (
                          <FuzzyText text={agent.description} query={query} className="text-[12px] text-zinc-500 block mt-1 truncate" highlightClass="text-violet-400 font-medium" />
                        )}
                        {agent.systemPrompt && (
                          <span className="text-[11px] text-zinc-700 block mt-0.5 truncate font-mono">{agent.systemPrompt.slice(0, 80)}{agent.systemPrompt.length > 80 ? "…" : ""}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom hints bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">j</kbd> <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">k</kbd> navigate</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd> edit</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">/</kbd> search</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">n</kbd> new</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">d</kbd> delete</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd> back</span>
      </div>

      {/* Editor overlay */}
      {(creating || editing) && (
        <AgentEditor
          agent={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <>
          <div data-overlay-open className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px]">
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Delete Agent</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                Delete <span className="text-zinc-300 font-medium">{confirmDelete.name}</span>? This cannot be undone.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { deleteAgent(confirmDelete.id); setConfirmDelete(null); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-400/20 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  <kbd className="rounded bg-red-500/25 px-1.5 py-0.5 text-[9px] font-medium text-red-400">Enter</kbd>
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
