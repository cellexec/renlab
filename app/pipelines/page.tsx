"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "../components/ProjectContext";
import { usePipelineStore } from "../hooks/usePipelineStore";
import { useDesignPipelineStore } from "../hooks/useDesignPipelineStore";
import { useSpecificationStore } from "../hooks/useSpecificationStore";
import type { PipelineRun, PipelineStatus } from "../pipelines";
import type { DesignRun, DesignPipelineStatus } from "../design-pipelines";

// =============================================================================
// Types
// =============================================================================

interface UnifiedRun {
  id: string;
  type: "feature" | "design";
  specificationId: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  reviewScore: number | null;
  iterations: number;
  variantCount: number;
  isActive: boolean;
}

type DisplayGroup = "active" | "success" | "failed" | "cancelled";
type FilterTab = "all" | DisplayGroup;
type TypeFilter = "all" | "feature" | "design";
type ScoreFilter = "any" | "high" | "mid" | "low";

const ACTIVE_FEATURE: PipelineStatus[] = ["pending", "worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
const ACTIVE_DESIGN: DesignPipelineStatus[] = ["pending", "parent_worktree", "generating", "merging_variants", "installing", "dev_server", "awaiting_review", "finalizing", "merging_final"];

const FILTER_TABS: FilterTab[] = ["all", "active", "success", "failed", "cancelled"];
const GROUP_ORDER: DisplayGroup[] = ["active", "success", "failed", "cancelled"];

// Filter sheet options
interface FilterOption {
  id: string;
  section: string;
  label: string;
  dot?: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: "type:all",     section: "Type",  label: "All Types" },
  { id: "type:feature", section: "Type",  label: "Feature", dot: "bg-blue-500" },
  { id: "type:design",  section: "Type",  label: "Design",  dot: "bg-purple-500" },
  { id: "score:any",    section: "Score", label: "Any Score" },
  { id: "score:high",   section: "Score", label: "High (80-100%)", dot: "bg-emerald-500" },
  { id: "score:mid",    section: "Score", label: "Mid (50-79%)",   dot: "bg-amber-500" },
  { id: "score:low",    section: "Score", label: "Low (0-49%)",    dot: "bg-red-500" },
];

// =============================================================================
// Converters
// =============================================================================

function toUnified(run: PipelineRun): UnifiedRun {
  return { id: run.id, type: "feature", specificationId: run.specificationId, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt, reviewScore: run.reviewScore, iterations: run.iterations, variantCount: 0, isActive: ACTIVE_FEATURE.includes(run.status) };
}
function toUnifiedDesign(run: DesignRun): UnifiedRun {
  return { id: run.id, type: "design", specificationId: run.specificationId, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt, reviewScore: null, iterations: 0, variantCount: run.variantCount, isActive: ACTIVE_DESIGN.includes(run.status) };
}

function toDisplayGroup(status: string): DisplayGroup {
  if (ACTIVE_FEATURE.includes(status as PipelineStatus) || ACTIVE_DESIGN.includes(status as DesignPipelineStatus)) return "active";
  if (status === "success") return "success";
  if (status === "failed" || status === "rejected") return "failed";
  return "cancelled";
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${String(mins).padStart(2, "\u2007")}m ${String(rem).padStart(2, "0")}s`;
}

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// Fuzzy search
// =============================================================================

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

// =============================================================================
// Status visuals
// =============================================================================

const STATUS_BADGE: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  pending:          { dot: "bg-zinc-500",                 label: "Pending",          bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  worktree:         { dot: "bg-amber-500 animate-pulse",  label: "Worktree",         bg: "bg-amber-500/10",   text: "text-amber-400" },
  retrieving:       { dot: "bg-teal-500 animate-pulse",   label: "Retrieving",       bg: "bg-teal-500/10",    text: "text-teal-400" },
  coding:           { dot: "bg-indigo-500 animate-pulse",  label: "Coding",           bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  reviewing:        { dot: "bg-violet-500 animate-pulse",  label: "Reviewing",        bg: "bg-violet-500/10",  text: "text-violet-400" },
  merging:          { dot: "bg-cyan-500 animate-pulse",    label: "Merging",          bg: "bg-cyan-500/10",    text: "text-cyan-400" },
  updating:         { dot: "bg-rose-500 animate-pulse",    label: "Updating",         bg: "bg-rose-500/10",    text: "text-rose-400" },
  success:          { dot: "bg-emerald-500",               label: "Success",          bg: "bg-emerald-500/10", text: "text-emerald-400" },
  failed:           { dot: "bg-red-500",                   label: "Failed",           bg: "bg-red-500/10",     text: "text-red-400" },
  cancelled:        { dot: "bg-zinc-500",                  label: "Cancelled",        bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  rejected:         { dot: "bg-red-500",                   label: "Rejected",         bg: "bg-red-500/10",     text: "text-red-400" },
  parent_worktree:  { dot: "bg-amber-500 animate-pulse",  label: "Worktree",         bg: "bg-amber-500/10",   text: "text-amber-400" },
  generating:       { dot: "bg-indigo-500 animate-pulse",  label: "Generating",       bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  merging_variants: { dot: "bg-cyan-500 animate-pulse",    label: "Merging Variants", bg: "bg-cyan-500/10",    text: "text-cyan-400" },
  installing:       { dot: "bg-teal-500 animate-pulse",    label: "Installing",       bg: "bg-teal-500/10",    text: "text-teal-400" },
  dev_server:       { dot: "bg-blue-500 animate-pulse",    label: "Dev Server",       bg: "bg-blue-500/10",    text: "text-blue-400" },
  awaiting_review:  { dot: "bg-purple-500 animate-pulse",  label: "Awaiting Review",  bg: "bg-purple-500/10",  text: "text-purple-400" },
  finalizing:       { dot: "bg-violet-500 animate-pulse",  label: "Finalizing",       bg: "bg-violet-500/10",  text: "text-violet-400" },
  merging_final:    { dot: "bg-emerald-500 animate-pulse", label: "Final Merge",      bg: "bg-emerald-500/10", text: "text-emerald-400" },
};

const GROUP_CONFIG: Record<DisplayGroup, { label: string; dot: string; color: string }> = {
  active:    { label: "Active",    dot: "bg-indigo-500",  color: "text-indigo-400" },
  success:   { label: "Completed", dot: "bg-emerald-500", color: "text-emerald-400" },
  failed:    { label: "Failed",    dot: "bg-red-500",     color: "text-red-400" },
  cancelled: { label: "Cancelled", dot: "bg-zinc-500",    color: "text-zinc-400" },
};

// =============================================================================
// Detail panel
// =============================================================================

function DetailPanel({
  run,
  specTitle,
  onOpen,
  onCancel,
}: {
  run: UnifiedRun | null;
  specTitle: string;
  onOpen: () => void;
  onCancel: () => void;
}) {
  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <svg className="h-12 w-12 text-zinc-800 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="text-sm text-zinc-600">Select a pipeline run</p>
        <p className="text-xs text-zinc-700 mt-1">Use j/k to navigate</p>
      </div>
    );
  }

  const badge = STATUS_BADGE[run.status] ?? { dot: "bg-zinc-500", label: run.status, bg: "bg-zinc-500/10", text: "text-zinc-400" };
  const group = toDisplayGroup(run.status);

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-zinc-100 leading-snug">{specTitle}</h2>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${
            run.type === "design"
              ? "text-purple-400 bg-purple-500/10 border border-purple-500/15"
              : "text-blue-400 bg-blue-500/10 border border-blue-500/15"
          }`}>
            {run.type === "design" ? "Design" : "Feature"}
          </span>
        </div>
        <p className="text-[11px] text-zinc-600 font-mono truncate">{run.id}</p>
      </div>

      {/* Detail content - scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Status</span>
            <span className={`text-sm font-medium ${badge.text}`}>{badge.label}</span>
          </div>
          <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Group</span>
            <span className={`text-sm font-medium ${GROUP_CONFIG[group].color}`}>{GROUP_CONFIG[group].label}</span>
          </div>
          <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Duration</span>
            <span className="text-sm font-medium text-zinc-300 font-mono tabular-nums">
              {formatDuration(run.createdAt, run.finishedAt)}
            </span>
          </div>
          <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Started</span>
            <span className="text-sm font-medium text-zinc-300">
              {formatDate(run.createdAt)}
            </span>
          </div>
          {run.finishedAt && (
            <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Finished</span>
              <span className="text-sm font-medium text-zinc-300">
                {formatDate(run.finishedAt)}
              </span>
            </div>
          )}
          {run.type === "feature" && run.iterations > 0 && (
            <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Iterations</span>
              <span className="text-sm font-medium text-zinc-300 font-mono">{run.iterations}</span>
            </div>
          )}
          {run.type === "design" && run.variantCount > 0 && (
            <div className="rounded-lg px-3 py-2.5 border border-white/[0.06] bg-white/[0.02]">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Variants</span>
              <span className="text-sm font-medium text-zinc-300 font-mono">{run.variantCount}</span>
            </div>
          )}
        </div>

        {/* Review score */}
        <div className="rounded-lg px-4 py-3 border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Review Score</span>
            {run.reviewScore != null && (
              <span className={`text-sm font-bold font-mono tabular-nums ${
                run.reviewScore >= 80 ? "text-emerald-400" : run.reviewScore >= 50 ? "text-amber-400" : "text-red-400"
              }`}>
                {run.reviewScore}%
              </span>
            )}
          </div>
          {run.reviewScore != null ? (
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  run.reviewScore >= 80 ? "bg-emerald-500" : run.reviewScore >= 50 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${run.reviewScore}%` }}
              />
            </div>
          ) : (
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full w-0 rounded-full bg-zinc-700" />
            </div>
          )}
          {run.reviewScore == null && (
            <p className="text-[11px] text-zinc-700 mt-1.5">
              {run.isActive ? "Score pending..." : "No score available"}
            </p>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-lg px-4 py-3 border border-white/[0.06] bg-white/[0.02]">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-2">Timeline</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{relativeTime(run.createdAt)}</span>
            <div className="flex-1 h-px bg-zinc-800 relative">
              {run.isActive && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </div>
            <span className="text-xs text-zinc-500">
              {run.finishedAt ? relativeTime(run.finishedAt) : "now"}
            </span>
          </div>
        </div>
      </div>

      {/* Detail footer — actions */}
      <div className="shrink-0 border-t border-white/[0.06] px-5 py-3 flex items-center gap-2">
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium hover:bg-violet-500/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          Open Detail
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Enter</kbd>
        </button>
        {run.isActive && (
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel
            <kbd className="rounded bg-red-500/15 border border-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">c</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main page — Split Pane with Detail Preview
// =============================================================================

export default function PipelinesPage() {
  const router = useRouter();
  const { activeProject, activeProjectId } = useProjectContext();
  const { runs, loaded, cancelRun } = usePipelineStore(activeProjectId);
  const { runs: designRuns, loaded: designLoaded, cancelRun: cancelDesignRun } = useDesignPipelineStore(activeProjectId);
  const { specifications } = useSpecificationStore(activeProjectId);

  // Vimstyle state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("any");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterSheetIndex, setFilterSheetIndex] = useState(0);

  // Mouse handling
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Spec title map
  const specTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of specifications) m.set(s.id, s.title);
    return m;
  }, [specifications]);

  // Merge runs
  const allRuns = useMemo(() => {
    const unified: UnifiedRun[] = [
      ...runs.map(toUnified),
      ...designRuns.map(toUnifiedDesign),
    ];
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return unified;
  }, [runs, designRuns]);

  // Filter
  const filtered = useMemo(() => {
    let result = allRuns;
    if (activeFilter !== "all") {
      result = result.filter((r) => toDisplayGroup(r.status) === activeFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((r) => r.type === typeFilter);
    }
    if (scoreFilter !== "any") {
      result = result.filter((r) => {
        if (r.reviewScore == null) return false;
        if (scoreFilter === "high") return r.reviewScore >= 80;
        if (scoreFilter === "mid") return r.reviewScore >= 50 && r.reviewScore < 80;
        return r.reviewScore < 50;
      });
    }
    if (query.trim()) {
      result = result.filter((r) => {
        const title = specTitleMap.get(r.specificationId) ?? "";
        return fuzzyMatch(title, query) || fuzzyMatch(r.status, query) || fuzzyMatch(r.id, query);
      });
    }
    return result;
  }, [allRuns, activeFilter, typeFilter, scoreFilter, query, specTitleMap]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const base = query.trim()
      ? allRuns.filter((r) => {
          const title = specTitleMap.get(r.specificationId) ?? "";
          return fuzzyMatch(title, query) || fuzzyMatch(r.status, query) || fuzzyMatch(r.id, query);
        })
      : allRuns;
    const counts: Record<FilterTab, number> = { all: base.length, active: 0, success: 0, failed: 0, cancelled: 0 };
    for (const r of base) counts[toDisplayGroup(r.status)]++;
    return counts;
  }, [allRuns, query, specTitleMap]);

  // Grouped flat list
  const flatList = useMemo(() => {
    if (activeFilter !== "all") return filtered;
    const result: UnifiedRun[] = [];
    for (const group of GROUP_ORDER) {
      result.push(...filtered.filter((r) => toDisplayGroup(r.status) === group));
    }
    return result;
  }, [filtered, activeFilter]);

  // Section boundaries
  const sections = useMemo(() => {
    const result: { group: DisplayGroup; startIndex: number; count: number }[] = [];
    let idx = 0;
    if (activeFilter === "all") {
      for (const group of GROUP_ORDER) {
        const count = filtered.filter((r) => toDisplayGroup(r.status) === group).length;
        if (count > 0) {
          result.push({ group, startIndex: idx, count });
          idx += count;
        }
      }
    } else {
      if (filtered.length > 0) {
        result.push({ group: activeFilter as DisplayGroup, startIndex: 0, count: filtered.length });
      }
    }
    return result;
  }, [filtered, activeFilter]);

  // Selected run
  const selectedRun = flatList[selectedIndex] ?? null;

  // Clamp selection
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, flatList.length - 1)));
  }, [flatList.length]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [activeFilter]);

  // Scroll into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-item-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Mouse tracking
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

  // Cancel handler
  const handleCancel = useCallback((run: UnifiedRun) => {
    if (run.type === "design") cancelDesignRun(run.id);
    else cancelRun(run.id);
  }, [cancelRun, cancelDesignRun]);

  // Navigate handler
  const handleOpen = useCallback((run: UnifiedRun) => {
    router.push(run.type === "design" ? `/design-pipelines/${run.id}` : `/pipelines/${run.id}`);
  }, [router]);

  // Filter sheet: select option
  const handleFilterSelect = useCallback((optionId: string) => {
    const [group, value] = optionId.split(":");
    if (group === "type") setTypeFilter(value as TypeFilter);
    else if (group === "score") setScoreFilter(value as ScoreFilter);
  }, []);

  const isFilterOptionActive = useCallback((optionId: string) => {
    const [group, value] = optionId.split(":");
    if (group === "type") return typeFilter === value;
    if (group === "score") return scoreFilter === value;
    return false;
  }, [typeFilter, scoreFilter]);

  const hasActiveFilters = typeFilter !== "all" || scoreFilter !== "any";

  // Keyboard handler (capture phase)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // LAYER 1: Filter sheet open
      if (filterSheetOpen) {
        if (e.key === "Escape" || e.key === "f") {
          e.preventDefault();
          setFilterSheetOpen(false);
        } else if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFilterSheetIndex((i) => Math.min(i + 1, FILTER_OPTIONS.length - 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setFilterSheetIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopImmediatePropagation();
          handleFilterSelect(FILTER_OPTIONS[filterSheetIndex].id);
        } else if (e.key === "r") {
          e.preventDefault();
          setTypeFilter("all");
          setScoreFilter("any");
        }
        return;
      }

      // LAYER 2: Search focused
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
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
        return;
      }

      // LAYER 3: List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "f") {
        e.preventDefault();
        setFilterSheetIndex(0);
        setFilterSheetOpen(true);
      } else if (e.key === "/") {
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
        setMouseActive(false);
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setMouseActive(false);
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const run = flatList[selectedIndex];
        if (run) handleOpen(run);
      } else if (e.key === "c") {
        e.preventDefault();
        const run = flatList[selectedIndex];
        if (run?.isActive) handleCancel(run);
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.back();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filterSheetOpen, filterSheetIndex, handleFilterSelect, searchFocused, query, flatList, selectedIndex, handleOpen, handleCancel, router]);

  // Loading state
  if (!loaded || !designLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden text-zinc-100">
      {/* Header + filter tabs */}
      <div className="relative z-10 shrink-0 border-b border-white/[0.06] bg-zinc-950/50 backdrop-blur-sm px-5 pt-5 pb-3">
        <div className="flex items-baseline gap-2 mb-4">
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Pipelines</h1>
          <span className="text-sm text-zinc-500">
            {loaded && designLoaded ? `${allRuns.length} run${allRuns.length !== 1 ? "s" : ""}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 mb-1.5">
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&larr;</kbd>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&rarr;</kbd>
          <span className="text-xs text-zinc-600 ml-0.5">filter</span>
        </div>
        <div className="flex items-center gap-1">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab;
            const label = tab === "all" ? "All" : GROUP_CONFIG[tab as DisplayGroup].label;
            const dot = tab !== "all" ? GROUP_CONFIG[tab as DisplayGroup].dot : null;
            const count = tabCounts[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-white/[0.06] text-zinc-100 border border-white/[0.08]"
                    : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-400 border border-transparent"
                }`}
              >
                {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot} ${tab === "active" ? "animate-pulse" : ""}`} />}
                {label}
                <span className={`text-[10px] font-mono tabular-nums ${isActive ? "text-zinc-400" : "text-zinc-700"}`}>{count}</span>
              </button>
            );
          })}

          <div className="flex-1" />

          <button
            onClick={() => { setFilterSheetIndex(0); setFilterSheetOpen(true); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              hasActiveFilters
                ? "bg-violet-500/20 text-violet-200 border border-violet-400/30 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                : "bg-white/[0.06] text-zinc-300 border border-white/[0.1] hover:bg-white/[0.1] hover:text-zinc-100"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
            )}
            <kbd className="rounded bg-violet-500/20 border border-violet-500/25 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">f</kbd>
          </button>
          {hasActiveFilters && (
            <button
              onClick={() => { setTypeFilter("all"); setScoreFilter("any"); setActiveFilter("all"); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Split pane content — boxed panels with spacing */}
      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden p-5 gap-5">

        {/* LEFT PANEL: Pipeline list box */}
        <div className="w-[60%] shrink-0 flex flex-col min-h-0 rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 overflow-hidden">
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
                placeholder="Filter pipelines..."
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
              />
              {query && (
                <span className="text-[10px] text-zinc-600">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollPaddingTop: 28 }}>
            {flatList.length === 0 ? (
              allRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <svg className="h-10 w-10 text-zinc-800 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-sm text-zinc-500">No pipeline runs yet</p>
                  <p className="text-xs text-zinc-700 mt-1">Open a specification and click &ldquo;Send to Pipeline&rdquo;</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <p className="text-sm text-zinc-500">No matching runs</p>
                  <p className="text-xs text-zinc-700 mt-1">Try a different search or filter</p>
                </div>
              )
            ) : (
              sections.map(({ group, startIndex, count }) => {
                const cfg = GROUP_CONFIG[group];
                return (
                  <div key={group}>
                    {/* Section header */}
                    <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-white/[0.04] px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${cfg.dot} ${group === "active" ? "animate-pulse" : ""}`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-zinc-700 font-mono">({count})</span>
                      </div>
                    </div>

                    {/* Items */}
                    {flatList.slice(startIndex, startIndex + count).map((run, gi) => {
                      const idx = startIndex + gi;
                      const isSelected = idx === selectedIndex;
                      const specTitle = specTitleMap.get(run.specificationId) ?? "Untitled Spec";
                      const badge = STATUS_BADGE[run.status] ?? { dot: "bg-zinc-500", label: run.status, bg: "bg-zinc-500/10", text: "text-zinc-400" };

                      return (
                        <div
                          key={run.id}
                          data-item-index={idx}
                          onClick={() => setSelectedIndex(idx)}
                          onDoubleClick={() => handleOpen(run)}
                          onMouseMove={() => {
                            if (mouseActive && selectedIndex !== idx) setSelectedIndex(idx);
                          }}
                          className={`border-b border-white/[0.04] px-4 py-2.5 cursor-pointer transition-all duration-75 ${
                            isSelected
                              ? "bg-violet-500/[0.08] border-l-2 border-l-violet-500"
                              : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Selection dot */}
                            <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                              isSelected ? "bg-violet-400" : "bg-transparent"
                            }`} />

                            {/* Status dot */}
                            <span className={`h-2 w-2 shrink-0 rounded-full ${badge.dot}`} />

                            {/* Title + meta */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FuzzyText
                                  text={specTitle}
                                  query={query}
                                  className={`text-sm truncate ${isSelected ? "text-zinc-100" : "text-zinc-300"}`}
                                />
                                {isSelected && (
                                  <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 shrink-0">Enter</kbd>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-700 mt-0.5 block">{relativeTime(run.createdAt)}</span>
                            </div>

                            {/* Score — plain number, color-coded */}
                            {run.reviewScore != null && (
                              <span className={`text-xs font-mono tabular-nums font-medium shrink-0 w-8 text-right ${
                                run.reviewScore >= 80 ? "text-emerald-400" : run.reviewScore >= 50 ? "text-amber-400" : "text-red-400"
                              }`}>
                                {run.reviewScore}
                              </span>
                            )}

                            {/* Duration */}
                            <span className="text-[11px] text-zinc-600 font-mono tabular-nums shrink-0">
                              {formatDuration(run.createdAt, run.finishedAt)}
                            </span>
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

        {/* RIGHT PANEL: Detail preview box */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 overflow-hidden">
          <DetailPanel
            run={selectedRun}
            specTitle={selectedRun ? specTitleMap.get(selectedRun.specificationId) ?? "Untitled Spec" : ""}
            onOpen={() => selectedRun && handleOpen(selectedRun)}
            onCancel={() => selectedRun && handleCancel(selectedRun)}
          />
        </div>
      </div>

      {/* Bottom hints bar */}
      <div className="relative z-10 shrink-0 border-t border-white/[0.06] bg-zinc-950/50 backdrop-blur-sm px-5 py-2 flex items-center gap-5 text-xs text-zinc-600">
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">j</kbd>{" "}
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">k</kbd> navigate
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&larr;</kbd>{" "}
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&rarr;</kbd> filter
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Enter</kbd> open
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">c</kbd> cancel
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">/</kbd> search
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">f</kbd> filters
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Esc</kbd> back
        </span>
      </div>

      {/* Filter sheet overlay */}
      {filterSheetOpen && (
        <>
          <div data-overlay-open className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setFilterSheetOpen(false)} />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px]"
            style={{ animation: "dialogScaleIn 0.2s ease-out" }}
          >
            <style>{`@keyframes dialogScaleIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }`}</style>
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
              {/* Sheet header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                  </svg>
                  <span className="text-sm font-semibold text-zinc-200">Filters</span>
                </div>
                <button
                  onClick={() => { setTypeFilter("all"); setScoreFilter("any"); }}
                  className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                    hasActiveFilters ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-700"
                  }`}
                >
                  Reset
                  <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">r</kbd>
                </button>
              </div>

              {/* Options list */}
              <div className="px-2 py-2">
                {(() => {
                  let lastSection = "";
                  return FILTER_OPTIONS.map((opt, i) => {
                    const showSection = opt.section !== lastSection;
                    lastSection = opt.section;
                    const isSelected = i === filterSheetIndex;
                    const isActive = isFilterOptionActive(opt.id);
                    return (
                      <div key={opt.id}>
                        {showSection && (
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-3 py-1.5 mt-1 first:mt-0">
                            {opt.section}
                          </div>
                        )}
                        <div
                          onClick={() => { setFilterSheetIndex(i); handleFilterSelect(opt.id); }}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer transition-all duration-75 ${
                            isSelected
                              ? "bg-violet-500/[0.12] ring-1 ring-violet-500/30"
                              : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <div className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            isActive
                              ? "border-violet-400"
                              : isSelected ? "border-zinc-500" : "border-zinc-700"
                          }`}>
                            {isActive && <div className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
                          </div>
                          {opt.dot && <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} />}
                          <span className={`text-[13px] ${isActive ? "text-zinc-100 font-medium" : isSelected ? "text-zinc-200" : "text-zinc-400"}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <kbd className="ml-auto rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">Enter</kbd>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Sheet hints */}
              <div className="border-t border-white/[0.06] px-4 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
                <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd> <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd> navigate</span>
                <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> select</span>
                <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd> close</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
