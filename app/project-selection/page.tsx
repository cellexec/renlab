"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "../components/ProjectContext";

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

function fuzzyScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  let ti = 0;
  let prevMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return -Infinity;
    if (idx === prevMatch + 1) score += 5;
    if (idx === 0 || lower[idx - 1] === " " || lower[idx - 1] === "-" || lower[idx - 1] === "/") score += 3;
    score -= (idx - ti);
    prevMatch = idx;
    ti = idx + 1;
  }
  return score;
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
  text: string;
  query: string;
  className?: string;
  highlightClass?: string;
}) {
  if (!query) return <span className={className}>{text}</span>;
  const indices = fuzzyIndices(text, query);
  if (!indices || indices.size === 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {Array.from(text).map((ch, i) =>
        indices.has(i) ? (
          <span key={i} className={highlightClass ?? "text-violet-300 font-semibold"}>{ch}</span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </span>
  );
}

export default function ProjectSelectionPage() {
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [userMoved, setUserMoved] = useState(false);
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return projects;
    return projects
      .filter((p) => fuzzyMatch(p.title, query) || fuzzyMatch(p.path, query))
      .sort((a, b) => {
        const sa = Math.max(fuzzyScore(a.title, query), fuzzyScore(a.path, query));
        const sb = Math.max(fuzzyScore(b.title, query), fuzzyScore(b.path, query));
        return sb - sa;
      });
  }, [projects, query]);

  // Sync selection to active project until user navigates
  useEffect(() => {
    if (userMoved) return;
    if (!activeProjectId || filtered.length === 0) return;
    const idx = filtered.findIndex((p) => p.id === activeProjectId);
    if (idx >= 0) setSelectedIndex(idx);
  }, [activeProjectId, filtered, userMoved]);

  // Reset to top when search query changes
  useEffect(() => {
    setSelectedIndex(0);
    setUserMoved(false);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Only activate mouse selection after the cursor actually moves
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      if (!mouseActive && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        setMouseActive(true);
      }
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [mouseActive]);

  const moveSelection = (updater: (i: number) => number) => {
    setSelectedIndex(updater);
    setUserMoved(true);
  };

  const selectAndGo = (id: string) => {
    setActiveProjectId(id);
    router.push("/");
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // When search is focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (query) {
            setQuery("");
          } else {
            searchRef.current?.blur();
            setSearchFocused(false);
          }
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          moveSelection((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveSelection((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          searchRef.current?.blur();
          setSearchFocused(false);
        }
        return;
      }

      // List navigation mode
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        e.preventDefault();
        router.back();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearchFocused(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        moveSelection((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        moveSelection((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const project = filtered[selectedIndex];
        if (project) selectAndGo(project.id);
      } else if (e.key === "i") {
        e.preventDefault();
        router.push("/projects/import-monorepo");
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFocused, query, filtered, selectedIndex, router]);

  const selectedId = filtered[selectedIndex]?.id;

  return (
    <div className="flex h-full flex-col text-zinc-100">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-zinc-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Switch Project</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            tabIndex={-1}
            onClick={() => router.push("/projects/import-monorepo")}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Import
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">i</kbd>
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
                placeholder="Filter projects…"
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
              />
            </div>
          </div>

          {/* Project list */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-600">No matching projects</div>
        ) : (
          filtered.map((p, i) => {
            const isSelected = p.id === selectedId && !searchFocused;
            const isActive = p.id === activeProjectId;
            return (
              <div
                key={p.id}
                onClick={() => selectAndGo(p.id)}
                onMouseMove={() => { if (mouseActive && selectedIndex !== i) { setSelectedIndex(i); setUserMoved(true); } }}
                className={`border-b border-white/[0.04] px-4 py-3 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-violet-500/[0.04] border-l-2 border-l-violet-500/60"
                    : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center gap-4 max-w-xl">
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${isSelected ? "bg-violet-400" : "bg-transparent"}`} />
                  <svg className={`h-4 w-4 shrink-0 ${isActive ? "text-violet-400" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FuzzyText text={p.title} query={query} className="text-[13px] font-medium text-zinc-200" />
                      {isActive && (
                        <span className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">ACTIVE</span>
                      )}
                      {isSelected && (
                        <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Enter to select</kbd>
                      )}
                    </div>
                    <FuzzyText text={p.path} query={query} className="text-[11px] text-zinc-500 font-mono truncate block mt-0.5" highlightClass="text-violet-400 font-medium" />
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
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd> select</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">/</kbd> search</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">i</kbd> import</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd> back</span>
      </div>
    </div>
  );
}
