"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectContext } from "../components/ProjectContext";
import { usePipelineStore } from "../hooks/usePipelineStore";
import { useDesignPipelineStore } from "../hooks/useDesignPipelineStore";
import { useSpecificationStore } from "../hooks/useSpecificationStore";
import type { PipelineRun, PipelineStatus } from "../pipelines";
import type { DesignRun, DesignPipelineStatus } from "../design-pipelines";

type ScoreRange = "high" | "mid" | "low" | null;
type PipelineTypeFilter = "all" | "feature" | "design";

// =============================================================================
// Unified run type — normalises feature & design runs into one shape
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

// =============================================================================
// Display group types + config
// =============================================================================

type DisplayGroup = "active" | "success" | "failed" | "cancelled";

const ACTIVE_FEATURE_STATUSES: PipelineStatus[] = ["pending", "worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
const ACTIVE_DESIGN_STATUSES: DesignPipelineStatus[] = ["pending", "parent_worktree", "generating", "merging_variants", "installing", "dev_server", "awaiting_review", "finalizing", "merging_final"];

function toDisplayGroup(status: string): DisplayGroup {
  if (ACTIVE_FEATURE_STATUSES.includes(status as PipelineStatus) || ACTIVE_DESIGN_STATUSES.includes(status as DesignPipelineStatus)) return "active";
  if (status === "success") return "success";
  if (status === "failed" || status === "rejected") return "failed";
  return "cancelled";
}

function toUnifiedRun(run: PipelineRun): UnifiedRun {
  return {
    id: run.id,
    type: "feature",
    specificationId: run.specificationId,
    status: run.status,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    reviewScore: run.reviewScore,
    iterations: run.iterations,
    variantCount: 0,
    isActive: ACTIVE_FEATURE_STATUSES.includes(run.status),
  };
}

function toUnifiedDesignRun(run: DesignRun): UnifiedRun {
  return {
    id: run.id,
    type: "design",
    specificationId: run.specificationId,
    status: run.status,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    reviewScore: null,
    iterations: 0,
    variantCount: run.variantCount,
    isActive: ACTIVE_DESIGN_STATUSES.includes(run.status),
  };
}

const GROUP_CONFIG: Record<
  DisplayGroup,
  { label: string; color: string; border: string; bg: string; dot: string; text: string }
> = {
  active: {
    label: "Active",
    color: "text-indigo-400",
    border: "border-l-indigo-500",
    bg: "bg-indigo-500/10",
    dot: "bg-indigo-500",
    text: "text-indigo-300",
  },
  success: {
    label: "Completed",
    color: "text-emerald-400",
    border: "border-l-emerald-500",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    text: "text-emerald-300",
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    border: "border-l-red-500",
    bg: "bg-red-500/10",
    dot: "bg-red-500",
    text: "text-red-300",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-zinc-400",
    border: "border-l-zinc-500",
    bg: "bg-zinc-500/10",
    dot: "bg-zinc-500",
    text: "text-zinc-400",
  },
};

const GROUP_ORDER: DisplayGroup[] = ["active", "success", "failed", "cancelled"];

const STATUS_BADGE: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  // Feature pipeline statuses
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
  // Design pipeline statuses
  parent_worktree:  { dot: "bg-amber-500 animate-pulse",  label: "Worktree",         bg: "bg-amber-500/10",   text: "text-amber-400" },
  generating:       { dot: "bg-indigo-500 animate-pulse",  label: "Generating",       bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  merging_variants: { dot: "bg-cyan-500 animate-pulse",    label: "Merging Variants", bg: "bg-cyan-500/10",    text: "text-cyan-400" },
  installing:       { dot: "bg-teal-500 animate-pulse",    label: "Installing",       bg: "bg-teal-500/10",    text: "text-teal-400" },
  dev_server:       { dot: "bg-blue-500 animate-pulse",    label: "Dev Server",       bg: "bg-blue-500/10",    text: "text-blue-400" },
  awaiting_review:  { dot: "bg-purple-500 animate-pulse",  label: "Awaiting Review",  bg: "bg-purple-500/10",  text: "text-purple-400" },
  finalizing:       { dot: "bg-violet-500 animate-pulse",  label: "Finalizing",       bg: "bg-violet-500/10",  text: "text-violet-400" },
  merging_final:    { dot: "bg-emerald-500 animate-pulse", label: "Final Merge",      bg: "bg-emerald-500/10", text: "text-emerald-400" },
};

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

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

// =============================================================================
// Icons
// =============================================================================

function IconSearch({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconChevron({ open, className = "w-4 h-4" }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`${className} transition-transform duration-300 ${open ? "rotate-90" : "rotate-0"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconRepeat({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 1l4 4-4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11V9a4 4 0 014-4h14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 23l-4-4 4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function IconX({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}


// =============================================================================
// Pipeline row
// =============================================================================

function PipelineRow({
  run,
  specTitle,
  onClick,
  onCancel,
  style,
}: {
  run: UnifiedRun;
  specTitle: string;
  onClick: () => void;
  onCancel: () => void;
  style: React.CSSProperties;
}) {
  const group = toDisplayGroup(run.status);
  const groupCfg = GROUP_CONFIG[group];
  const badge = STATUS_BADGE[run.status] ?? { dot: "bg-zinc-500", label: run.status, bg: "bg-zinc-500/10", text: "text-zinc-400" };

  return (
    <div style={style} className="animate-fade-in-up">
      <div
        className={`group relative border-l-[3px] ${groupCfg.border} bg-white/[0.015] hover:bg-white/[0.04] border-b border-white/[0.04] transition-all duration-200 cursor-pointer`}
        onClick={onClick}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Status + type tag + extra badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                {badge.label}
              </span>
              {/* Pipeline type tag */}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                run.type === "design"
                  ? "text-purple-400/80 bg-purple-500/10 border border-purple-500/15"
                  : "text-blue-400/80 bg-blue-500/10 border border-blue-500/15"
              }`}>
                {run.type}
              </span>
              {run.iterations > 1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400">
                  <IconRepeat className="w-3 h-3" />
                  {run.iterations}&times;
                </span>
              )}
              {run.type === "design" && run.variantCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400">
                  {run.variantCount} variant{run.variantCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <Link
              href={`/specifications/${run.specificationId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-300 mt-0.5 truncate max-w-full transition-colors group/spec"
            >
              <svg className="w-3 h-3 shrink-0 text-violet-500 group-hover/spec:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="truncate">{specTitle}</span>
            </Link>
          </div>

          {/* Duration */}
          <span className="text-[12px] text-zinc-400 font-mono tabular-nums w-[72px] text-right shrink-0">
            {formatDuration(run.createdAt, run.finishedAt)}
          </span>

          {/* Review score */}
          <div className="hidden md:flex items-center gap-2 w-[120px] shrink-0">
            {run.reviewScore != null ? (
              <>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      run.reviewScore >= 80
                        ? "bg-emerald-500"
                        : run.reviewScore >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${run.reviewScore}%` }}
                  />
                </div>
                <span className="text-[11px] text-zinc-500 font-mono tabular-nums w-[28px] text-right">
                  {run.reviewScore}%
                </span>
              </>
            ) : (
              <span className="text-[11px] text-zinc-600 ml-auto">&mdash;</span>
            )}
          </div>

          {/* Timestamp */}
          <span className="text-[11px] text-zinc-500 w-[52px] text-right shrink-0">
            {relativeTime(run.createdAt)}
          </span>

          {/* Cancel button for active runs */}
          {run.isActive && (
            <div className="flex items-center gap-1 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="p-1.5 rounded-md hover:bg-white/[0.08] text-zinc-400 hover:text-red-400 transition-colors"
                title="Cancel"
              >
                <IconX />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TOC Sidebar
// =============================================================================

const SCORE_RANGES: { key: ScoreRange; label: string; color: string; bg: string; text: string }[] = [
  { key: "high", label: "80-100%", color: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  { key: "mid",  label: "50-79%",  color: "bg-amber-500",   bg: "bg-amber-500/10",   text: "text-amber-300" },
  { key: "low",  label: "0-49%",   color: "bg-red-500",     bg: "bg-red-500/10",     text: "text-red-300" },
];

function matchesScoreRange(score: number | null, range: ScoreRange): boolean {
  if (range === null || score == null) return range === null;
  if (range === "high") return score >= 80;
  if (range === "mid") return score >= 50 && score < 80;
  return score < 50;
}

const TYPE_FILTER_OPTIONS: { key: PipelineTypeFilter; label: string; color: string; bg: string; text: string }[] = [
  { key: "all",     label: "All",     color: "bg-zinc-400",   bg: "bg-zinc-500/10",   text: "text-zinc-300" },
  { key: "feature", label: "Feature", color: "bg-blue-500",   bg: "bg-blue-500/10",   text: "text-blue-300" },
  { key: "design",  label: "Design",  color: "bg-purple-500", bg: "bg-purple-500/10", text: "text-purple-300" },
];


// =============================================================================
// Main page
// =============================================================================

export default function PipelinesPage() {
  const router = useRouter();
  const { activeProject } = useProjectContext();
  const { runs, loaded, cancelRun } = usePipelineStore(activeProject?.id ?? null);
  const { runs: designRuns, loaded: designLoaded, cancelRun: cancelDesignRun } = useDesignPipelineStore(activeProject?.id ?? null);
  const { specifications } = useSpecificationStore(activeProject?.id ?? null);

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DisplayGroup>>(new Set());
  const [scoreFilter, setScoreFilter] = useState<ScoreRange>(null);
  const [typeFilter, setTypeFilter] = useState<PipelineTypeFilter>("all");
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Spec title lookup
  const specTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of specifications) {
      m.set(s.id, s.title);
    }
    return m;
  }, [specifications]);

  // Mount animation
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Merge feature + design runs into unified list, sorted by createdAt desc
  const allUnifiedRuns = useMemo(() => {
    const unified: UnifiedRun[] = [
      ...runs.map(toUnifiedRun),
      ...designRuns.map(toUnifiedDesignRun),
    ];
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return unified;
  }, [runs, designRuns]);

  // Filter runs by search + score range + type
  const filteredRuns = useMemo(() => {
    let result = allUnifiedRuns;

    if (typeFilter !== "all") {
      result = result.filter((r) => r.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const title = specTitleMap.get(r.specificationId) ?? "";
        return r.id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
      });
    }

    if (scoreFilter) {
      result = result.filter((r) => matchesScoreRange(r.reviewScore, scoreFilter));
    }

    return result;
  }, [searchQuery, allUnifiedRuns, specTitleMap, scoreFilter, typeFilter]);

  // Group runs
  const groupedRuns = useMemo(() => {
    const map: Record<DisplayGroup, UnifiedRun[]> = {
      active: [],
      success: [],
      failed: [],
      cancelled: [],
    };
    filteredRuns.forEach((r) => map[toDisplayGroup(r.status)].push(r));
    return map;
  }, [filteredRuns]);

  const toggleGroup = useCallback((group: DisplayGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const hasActiveFilters = scoreFilter !== null || typeFilter !== "all" || searchQuery.trim() !== "";

  return (
    <div className={`h-full flex flex-col bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      {/* Sticky top: header + filters + search */}
      <div className="shrink-0 bg-zinc-950 border-b border-white/[0.06] px-6 pt-5 pb-4 z-10">
        {/* Breadcrumb + header */}
        <div className="mb-4 animate-fade-in-up stagger-1">
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-1">
            <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
            <span>/</span>
            <span className="text-zinc-300">Pipelines</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Pipeline Runs</h1>
        </div>

        {!activeProject && (
          <div className="flex items-center gap-2 backdrop-blur-xl bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl px-4 py-3 mb-4 animate-fade-in-up stagger-2">
            <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-[12px] text-amber-400">
              Select a project from the sidebar to view pipeline runs.
            </p>
          </div>
        )}

        {/* Filter bar + search */}
        {loaded && designLoaded && allUnifiedRuns.length > 0 && (
          <div className="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            {/* Status group pills */}
            <div className="flex items-center gap-1">
              {GROUP_ORDER.map((group) => {
                const cfg = GROUP_CONFIG[group];
                const count = groupedRuns[group].length;
                return (
                  <button
                    key={group}
                    onClick={() => toggleGroup(group)}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
                      !collapsedGroups.has(group)
                        ? `${cfg.bg} ${cfg.text} border border-white/[0.08]`
                        : "text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.03] border border-transparent"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${group === "active" && !collapsedGroups.has(group) ? "animate-pulse" : ""}`} />
                    {cfg.label}
                    <span className="font-mono tabular-nums opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Separator */}
            <div className="w-px h-5 bg-white/[0.08]" />

            {/* Type filter pills */}
            <div className="flex items-center gap-1">
              {TYPE_FILTER_OPTIONS.map(({ key, label, color, bg, text }) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-all duration-200 ${
                    typeFilter === key
                      ? `${bg} ${text} border border-white/[0.08]`
                      : "text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                  {label}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="w-px h-5 bg-white/[0.08]" />

            {/* Score filter pills */}
            <div className="flex items-center gap-1">
              {SCORE_RANGES.map(({ key, label, color, bg, text }) => (
                <button
                  key={key}
                  onClick={() => setScoreFilter(scoreFilter === key ? null : key)}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-all duration-200 ${
                    scoreFilter === key
                      ? `${bg} ${text} border border-white/[0.08]`
                      : "text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className={`w-3 h-1.5 rounded-full ${color}`} />
                  {label}
                </button>
              ))}
            </div>

            {/* Search — pushed to the right */}
            <div className="ml-auto flex-shrink-0 w-[260px]">
              <div className="search-glow relative flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg transition-all duration-300">
                <IconSearch className="w-3.5 h-3.5 text-zinc-500 ml-3 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-[12px] text-zinc-200 placeholder:text-zinc-600 py-2 px-2 outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-zinc-500 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded mr-2 font-mono">
                  <span className="text-[11px]">&#8984;</span>K
                </kbd>
              </div>
            </div>

            {/* Clear all filters */}
            {hasActiveFilters && (
              <button
                onClick={() => { setSearchQuery(""); setScoreFilter(null); setTypeFilter("all"); }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scrollable pipeline list */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {!loaded || !designLoaded ? (
          <div className="flex h-64 items-center justify-center text-zinc-500">Loading...</div>
        ) : allUnifiedRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
              <svg className="h-12 w-12 text-zinc-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-sm text-zinc-400 mt-4">No pipeline runs yet</p>
              <p className="text-[12px] text-zinc-600 mt-1">Open a specification and click &ldquo;Send to Pipeline&rdquo; to start</p>
            </div>
          </div>
        ) : (
          <>
            {GROUP_ORDER.map((group) => {
              const groupRuns = groupedRuns[group];
              if (groupRuns.length === 0 || collapsedGroups.has(group)) return null;
              const cfg = GROUP_CONFIG[group];

              return (
                <div key={group} className="mb-4">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot} ${group === "active" ? "animate-pulse" : ""}`} />
                    <span className={`text-[13px] font-semibold ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      ({groupRuns.length})
                    </span>
                  </div>

                  {/* Run list */}
                  <div className="backdrop-blur-xl bg-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
                    {groupRuns.map((run, idx) => (
                      <PipelineRow
                        key={run.id}
                        run={run}
                        specTitle={specTitleMap.get(run.specificationId) ?? "Untitled Spec"}
                        onClick={() => router.push(run.type === "design" ? `/design-pipelines/${run.id}` : `/pipelines/${run.id}`)}
                        onCancel={() => run.type === "design" ? cancelDesignRun(run.id) : cancelRun(run.id)}
                        style={{ animationDelay: `${300 + idx * 60}ms` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Empty search state */}
            {filteredRuns.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <IconSearch className="w-8 h-8 text-zinc-600 mb-3" />
                <p className="text-zinc-400 text-[14px]">No pipeline runs found</p>
                <p className="text-zinc-600 text-[12px] mt-1">Try adjusting your search or filters</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
