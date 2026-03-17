"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { KbdButton } from "../components/ui";
import { useSpecificationStore } from "../hooks/useSpecificationStore";
import { useProjectContext } from "../components/ProjectContext";
import type { Specification, SpecificationStatus } from "../specifications";

// ── Status grouping ─────────────────────────────────────────────────────────

type DisplayGroup = "pipeline" | "draft" | "done" | "failed";
const STATUS_ORDER: DisplayGroup[] = ["pipeline", "draft", "done", "failed"];

function toDisplayGroup(status: SpecificationStatus): DisplayGroup {
  if (status === "pipeline") return "pipeline";
  if (status === "draft") return "draft";
  if (status === "done") return "done";
  return "failed"; // failed + cancelled
}

const GROUP_CONFIG: Record<DisplayGroup, { label: string; dot: string }> = {
  pipeline: { label: "In Pipeline", dot: "bg-indigo-500" },
  draft: { label: "Draft", dot: "bg-zinc-500" },
  done: { label: "Done", dot: "bg-emerald-500" },
  failed: { label: "Failed", dot: "bg-red-500" },
};

const STATUS_BADGE: Record<SpecificationStatus, { dot: string; label: string; bg: string; text: string }> = {
  draft:     { dot: "bg-zinc-500",                 label: "Draft",     bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  pipeline:  { dot: "bg-indigo-500 animate-pulse",  label: "Pipeline",  bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  done:      { dot: "bg-emerald-500",               label: "Done",      bg: "bg-emerald-500/10", text: "text-emerald-400" },
  failed:    { dot: "bg-red-500",                   label: "Failed",    bg: "bg-red-500/10",     text: "text-red-400" },
  cancelled: { dot: "bg-amber-500",                 label: "Cancelled", bg: "bg-amber-500/10",   text: "text-amber-400" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Fuzzy search ────────────────────────────────────────────────────────────

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

type FilterTab = "all" | DisplayGroup;
const FILTER_TABS: FilterTab[] = ["all", ...STATUS_ORDER];

// ── Page ────────────────────────────────────────────────────────────────────

export default function SpecificationsPage() {
  const router = useRouter();
  const { activeProjectId } = useProjectContext();
  const { specifications, loaded, getLatestVersion, deleteSpecification } =
    useSpecificationStore(activeProjectId);

  // Required vimstyle state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Mouse interaction — prevent accidental hover-select on load
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // ── Filtered + grouped flat list ────────────────────────────────────────

  const filtered = useMemo(() => {
    let specs = query
      ? specifications.filter((s) => fuzzyMatch(s.title, query))
      : specifications;
    if (activeFilter !== "all") {
      specs = specs.filter((s) => toDisplayGroup(s.status) === activeFilter);
    }
    const result: Specification[] = [];
    for (const group of STATUS_ORDER) {
      result.push(...specs.filter((s) => toDisplayGroup(s.status) === group));
    }
    return result;
  }, [specifications, query, activeFilter]);

  // Tab counts (computed from search-filtered specs, ignoring status filter)
  const tabCounts = useMemo(() => {
    const specs = query
      ? specifications.filter((s) => fuzzyMatch(s.title, query))
      : specifications;
    const counts: Record<FilterTab, number> = { all: specs.length, pipeline: 0, draft: 0, done: 0, failed: 0 };
    for (const s of specs) counts[toDisplayGroup(s.status)]++;
    return counts;
  }, [specifications, query]);

  // Section boundaries (group → startIndex + count)
  const sections = useMemo(() => {
    const result: { group: DisplayGroup; startIndex: number; count: number }[] = [];
    let idx = 0;
    for (const group of STATUS_ORDER) {
      const count = filtered.filter((s) => toDisplayGroup(s.status) === group).length;
      if (count > 0) {
        result.push({ group, startIndex: idx, count });
        idx += count;
      }
    }
    return result;
  }, [filtered]);

  // ── Clamp / reset selection ─────────────────────────────────────────────

  useEffect(() => {
    setSelectedIndex(0);
  }, [activeFilter]);

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // ── Scroll into view ────────────────────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-spec-index="${selectedIndex}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Mouse tracking ──────────────────────────────────────────────────────

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

  // ── Keyboard handler ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // LAYER 1: Search focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (query) {
            setQuery("");
          } else {
            searchRef.current?.blur();
            setSearchFocused(false);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          searchRef.current?.blur();
          setSearchFocused(false);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
        return;
      }

      // LAYER 2: Delete confirmation active
      if (confirmDelete) {
        if (e.key === "Enter" || e.key === "d") {
          e.preventDefault();
          deleteSpecification(confirmDelete);
          setConfirmDelete(null);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setConfirmDelete(null);
        }
        return;
      }

      // LAYER 3: List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "/") {
        e.preventDefault();
        setSearchFocused(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveFilter((f) => {
          const i = FILTER_TABS.indexOf(f);
          return FILTER_TABS[Math.max(0, i - 1)];
        });
      } else if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        setActiveFilter((f) => {
          const i = FILTER_TABS.indexOf(f);
          return FILTER_TABS[Math.min(FILTER_TABS.length - 1, i + 1)];
        });
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
        const spec = filtered[selectedIndex];
        if (spec) router.push(`/specifications/${spec.id}`);
      } else if (e.key === "d") {
        e.preventDefault();
        const spec = filtered[selectedIndex];
        if (spec) setConfirmDelete(spec.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.back();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [searchFocused, query, filtered, selectedIndex, confirmDelete, deleteSpecification, router, activeFilter]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col text-zinc-100">
      {/* Scrollable area: header + tabs + search/list container */}
      <div className="flex-1 overflow-y-auto min-h-0">

      {/* 1. Header */}
      <div className="px-6 py-5 bg-zinc-950 border-b border-white/[0.06]">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Specifications</h1>
          <span className="text-sm text-zinc-500">
            {loaded ? `${specifications.length} spec${specifications.length !== 1 ? "s" : ""}` : "Loading\u2026"}
          </span>
        </div>
      </div>

      {/* 2. Filter tabs + New Spec button */}
      <div className="shrink-0 px-6 pb-4">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-xs text-zinc-600 flex items-center gap-1">
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&larr;</kbd>
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&rarr;</kbd>
            <span className="ml-0.5">filter</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 inline-flex gap-1">
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab;
              const label = tab === "all" ? "All" : GROUP_CONFIG[tab].label;
              const dot = tab !== "all" ? GROUP_CONFIG[tab].dot : null;
              const count = tabCounts[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white/[0.06] text-zinc-100"
                      : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-300"
                  }`}
                >
                  {dot && <span className={`h-2 w-2 rounded-full ${dot} ${tab === "pipeline" ? "animate-pulse" : ""}`} />}
                  {label}
                  <span className={`text-xs font-mono tabular-nums ${isActive ? "text-zinc-400" : "text-zinc-600"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <KbdButton shortcut="n" href="/specifications/new" active={!searchFocused && !confirmDelete}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Spec
          </KbdButton>
        </div>
      </div>

      {/* 3. Search + list container */}
      <div className="mx-5 mb-5 rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 overflow-hidden">
        {/* Search bar */}
        <div className="shrink-0 border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <svg className="h-5 w-5 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {!searchFocused && !query && (
              <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-xs font-medium text-violet-400">/</kbd>
            )}
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={"Filter specifications\u2026"}
              className="flex-1 bg-transparent text-base text-zinc-200 placeholder-zinc-600 outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div ref={listRef}>
        {!loaded ? (
          <div className="py-16 text-center text-sm text-zinc-600">Loading\u2026</div>
        ) : filtered.length === 0 ? (
          specifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <svg className="h-10 w-10 text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-base text-zinc-500">No specifications yet</p>
              <p className="text-sm text-zinc-600 mt-1.5">
                Press <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">n</kbd> to create one
              </p>
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-base text-zinc-500">No matching specifications</p>
              <p className="text-sm text-zinc-600 mt-1.5">Try a different search</p>
            </div>
          )
        ) : (
          sections.map(({ group, startIndex, count }) => {
            const cfg = GROUP_CONFIG[group];
            return (
              <div key={group}>
                {/* Sticky section header */}
                <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-white/[0.04] px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot} ${group === "pipeline" ? "animate-pulse" : ""}`} />
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{cfg.label}</span>
                    <span className="text-xs text-zinc-600 font-mono">({count})</span>
                  </div>
                </div>

                {/* Items */}
                {filtered.slice(startIndex, startIndex + count).map((spec, gi) => {
                  const idx = startIndex + gi;
                  const isSelected = idx === selectedIndex;
                  const isDeleting = confirmDelete === spec.id;
                  const badge = STATUS_BADGE[spec.status];
                  const version = getLatestVersion(spec.id);

                  return (
                    <div
                      key={spec.id}
                      data-spec-index={idx}
                      onClick={() => {
                        setSelectedIndex(idx);
                        if (!confirmDelete) router.push(`/specifications/${spec.id}`);
                      }}
                      onMouseMove={() => {
                        if (mouseActive && selectedIndex !== idx) setSelectedIndex(idx);
                      }}
                      className={`border-b border-white/[0.04] px-4 py-2.5 transition-colors cursor-pointer ${
                        isDeleting
                          ? "bg-red-500/[0.06] border-l-2 border-l-red-500/60"
                          : isSelected
                            ? "bg-violet-500/[0.08] border-l-2 border-l-violet-500"
                            : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Dot indicator */}
                        <div className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                          isDeleting ? "bg-red-400" : isSelected ? "bg-violet-400" : "bg-transparent"
                        }`} />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FuzzyText
                              text={spec.title}
                              query={query}
                              className="text-[15px] font-medium text-zinc-200 truncate"
                            />
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>
                              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                            {version && (
                              <span className="text-xs text-zinc-600 font-mono shrink-0">
                                v{version.versionNumber}
                              </span>
                            )}
                            {isSelected && !isDeleting && (
                              <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 shrink-0">Enter</kbd>
                            )}
                            {isDeleting && (
                              <span className="flex items-center gap-1.5 shrink-0">
                                <kbd className="rounded bg-red-500/15 border border-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">Enter to delete</kbd>
                                <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">Esc cancel</kbd>
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-500 mt-1 block">
                            {relativeTime(spec.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
        </div>
      </div>

      </div>{/* end scroll area */}

      {/* 5. Bottom hints */}
      <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-5 py-2 flex items-center gap-5 text-xs text-zinc-600">
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">j</kbd> <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">k</kbd> navigate</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&larr;</kbd> <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&rarr;</kbd> filter</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Enter</kbd> open</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">d</kbd> delete</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">/</kbd> search</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Esc</kbd> back</span>
      </div>
    </div>
  );
}
