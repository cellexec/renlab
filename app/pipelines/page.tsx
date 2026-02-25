"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectContext } from "../components/ProjectContext";
import { usePipelineStore } from "../hooks/usePipelineStore";
import { useSpecificationStore } from "../hooks/useSpecificationStore";
import type { PipelineRun, PipelineStatus } from "../pipelines";

type ScoreRange = "high" | "mid" | "low" | null;

// =============================================================================
// Display group types + config
// =============================================================================

type DisplayGroup = "active" | "success" | "failed" | "cancelled";

const ACTIVE_STATUSES: PipelineStatus[] = ["pending", "worktree", "coding", "reviewing", "merging"];

function toDisplayGroup(status: PipelineStatus): DisplayGroup {
  if (ACTIVE_STATUSES.includes(status)) return "active";
  if (status === "success") return "success";
  if (status === "failed" || status === "rejected") return "failed";
  return "cancelled";
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

const STATUS_BADGE: Record<PipelineStatus, { dot: string; label: string; bg: string; text: string }> = {
  pending:   { dot: "bg-zinc-500",                label: "Pending",   bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  worktree:  { dot: "bg-amber-500 animate-pulse", label: "Worktree",  bg: "bg-amber-500/10",   text: "text-amber-400" },
  coding:    { dot: "bg-indigo-500 animate-pulse", label: "Coding",    bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  reviewing: { dot: "bg-violet-500 animate-pulse", label: "Reviewing", bg: "bg-violet-500/10",  text: "text-violet-400" },
  merging:   { dot: "bg-cyan-500 animate-pulse",   label: "Merging",   bg: "bg-cyan-500/10",    text: "text-cyan-400" },
  success:   { dot: "bg-emerald-500",              label: "Success",   bg: "bg-emerald-500/10", text: "text-emerald-400" },
  failed:    { dot: "bg-red-500",                  label: "Failed",    bg: "bg-red-500/10",     text: "text-red-400" },
  cancelled: { dot: "bg-zinc-500",                 label: "Cancelled", bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  rejected:  { dot: "bg-red-500",                  label: "Rejected",  bg: "bg-red-500/10",     text: "text-red-400" },
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
// Animated counter hook
// =============================================================================

function useAnimatedNumber(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startValue.current = value;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startValue.current + (target - startValue.current) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
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

function IconActivity({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconClock({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconPulse({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-9h5" />
    </svg>
  );
}

// =============================================================================
// Stat card
// =============================================================================

function StatCard({
  label,
  value,
  suffix,
  icon,
  accentColor,
  delay,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  accentColor: string;
  delay: number;
}) {
  const animatedValue = useAnimatedNumber(value, 1400);

  return (
    <div
      className="group relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 overflow-hidden transition-all duration-300 hover:bg-white/[0.05] animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-white/[0.04] ${accentColor}`}>
          {icon}
        </div>
      </div>

      <div className="text-2xl font-bold text-zinc-100 tabular-nums tracking-tight">
        {animatedValue}
        {suffix && <span className="text-lg text-zinc-400 ml-0.5">{suffix}</span>}
      </div>
      <div className="text-[12px] text-zinc-500 mt-0.5">{label}</div>
    </div>
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
  run: PipelineRun;
  specTitle: string;
  onClick: () => void;
  onCancel: () => void;
  style: React.CSSProperties;
}) {
  const group = toDisplayGroup(run.status);
  const groupCfg = GROUP_CONFIG[group];
  const badge = STATUS_BADGE[run.status];
  const isActive = ACTIVE_STATUSES.includes(run.status);

  return (
    <div style={style} className="animate-fade-in-up">
      <div
        className={`group relative border-l-[3px] ${groupCfg.border} bg-white/[0.015] hover:bg-white/[0.04] border-b border-white/[0.04] transition-all duration-200 cursor-pointer`}
        onClick={onClick}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Status + iterations badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                {badge.label}
              </span>
              {run.iterations > 1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400">
                  <IconRepeat className="w-3 h-3" />
                  {run.iterations}&times;
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
          {isActive && (
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

function TocSidebar({
  groups,
  activeGroup,
  onNavigate,
  scoreFilter,
  onScoreFilter,
}: {
  groups: { group: DisplayGroup; count: number }[];
  activeGroup: DisplayGroup | null;
  onNavigate: (group: DisplayGroup) => void;
  scoreFilter: ScoreRange;
  onScoreFilter: (range: ScoreRange) => void;
}) {
  return (
    <div className="w-[200px] shrink-0">
      <div className="sticky top-6">
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Status Groups
          </h3>
          <div className="flex flex-col gap-1">
            {groups.map(({ group, count }) => {
              const cfg = GROUP_CONFIG[group];
              const isActive = activeGroup === group;
              return (
                <button
                  key={group}
                  onClick={() => onNavigate(group)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all duration-200 ${
                    isActive
                      ? "bg-white/[0.06] border border-white/[0.08]"
                      : "hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot} ${group === "active" && isActive ? "animate-pulse" : ""}`} />
                    <span className={`text-[13px] ${isActive ? "text-zinc-100 font-medium" : "text-zinc-400"}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                      isActive
                        ? `${cfg.bg} ${cfg.text}`
                        : "text-zinc-500 bg-white/[0.03]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] my-4" />

          <div className="space-y-1">
            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Review Score
            </h3>
            {SCORE_RANGES.map(({ key, label, color, bg, text }) => {
              const isSelected = scoreFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => onScoreFilter(isSelected ? null : key)}
                  className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
                    isSelected
                      ? `${bg} border border-white/[0.08]`
                      : "hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className={`w-4 h-1.5 rounded-full ${color}`} />
                  <span className={`text-[11px] ${isSelected ? text + " font-medium" : "text-zinc-500"}`}>
                    {label}
                  </span>
                </button>
              );
            })}
            {scoreFilter && (
              <button
                onClick={() => onScoreFilter(null)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mt-1 px-2.5"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main page
// =============================================================================

export default function PipelinesPage() {
  const router = useRouter();
  const { activeProject } = useProjectContext();
  const { runs, loaded, cancelRun } = usePipelineStore(activeProject?.id ?? null);
  const { specifications } = useSpecificationStore(activeProject?.id ?? null);

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DisplayGroup>>(new Set());
  const [activeGroup, setActiveGroup] = useState<DisplayGroup | null>("active");
  const [scoreFilter, setScoreFilter] = useState<ScoreRange>(null);
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // IntersectionObserver for active TOC group
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observers: IntersectionObserver[] = [];
    GROUP_ORDER.forEach((group) => {
      const el = groupRefs.current[group];
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveGroup(group);
          }
        },
        { root, threshold: 0.1, rootMargin: "-80px 0px -60% 0px" }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [mounted, loaded]);

  // Filter runs by search + score range
  const filteredRuns = useMemo(() => {
    let result = runs;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const title = specTitleMap.get(r.specificationId) ?? "";
        return (
          r.id.toLowerCase().includes(q) ||
          title.toLowerCase().includes(q) ||
          (r.worktreeBranch?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    if (scoreFilter) {
      result = result.filter((r) => matchesScoreRange(r.reviewScore, scoreFilter));
    }

    return result;
  }, [searchQuery, runs, specTitleMap, scoreFilter]);

  // Group runs
  const groupedRuns = useMemo(() => {
    const map: Record<DisplayGroup, PipelineRun[]> = {
      active: [],
      success: [],
      failed: [],
      cancelled: [],
    };
    filteredRuns.forEach((r) => map[toDisplayGroup(r.status)].push(r));
    return map;
  }, [filteredRuns]);

  // Stats
  const stats = useMemo(() => {
    const total = runs.length;
    const successCount = runs.filter((r) => r.status === "success").length;
    const failedCount = runs.filter((r) => r.status === "failed" || r.status === "rejected").length;
    const successRate = successCount + failedCount > 0
      ? Math.round((successCount / (successCount + failedCount)) * 100)
      : 0;
    const withDuration = runs.filter((r) => r.finishedAt);
    const avgDurationMs =
      withDuration.length > 0
        ? withDuration.reduce((s, r) => s + (new Date(r.finishedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / withDuration.length
        : 0;
    const avgDurationMin = Math.round(avgDurationMs / 60000);
    const activeNow = runs.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
    return { total, successRate, avgDurationMin, activeNow };
  }, [runs]);

  const toggleGroup = useCallback((group: DisplayGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const navigateToGroup = useCallback((group: DisplayGroup) => {
    const el = groupRefs.current[group];
    if (el) {
      setActiveGroup(group);
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        next.delete(group);
        return next;
      });
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const tocGroups = GROUP_ORDER.map((group) => ({
    group,
    count: groupedRuns[group].length,
  }));

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div ref={scrollRef} className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="text-zinc-300">Pipelines</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Pipeline Runs</h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              {activeProject ? activeProject.title : "No project selected"}
            </p>
          </div>

          {!activeProject && (
            <div className="flex items-center gap-2 backdrop-blur-xl bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl px-4 py-3 mb-5 animate-fade-in-up stagger-2">
              <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-[12px] text-amber-400">
                Select a project from the sidebar to view pipeline runs.
              </p>
            </div>
          )}

          {!loaded ? (
            <div className="flex h-64 items-center justify-center text-zinc-500">Loading...</div>
          ) : runs.length === 0 ? (
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
              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <StatCard
                  label="Total Runs"
                  value={stats.total}
                  icon={<IconActivity />}
                  accentColor="text-indigo-400"
                  delay={100}
                />
                <StatCard
                  label="Success Rate"
                  value={stats.successRate}
                  suffix="%"
                  icon={<IconCheck />}
                  accentColor="text-emerald-400"
                  delay={180}
                />
                <StatCard
                  label="Avg Duration"
                  value={stats.avgDurationMin}
                  suffix="m"
                  icon={<IconClock />}
                  accentColor="text-amber-400"
                  delay={260}
                />
                <StatCard
                  label="Active Now"
                  value={stats.activeNow}
                  icon={<IconPulse />}
                  accentColor="text-violet-400"
                  delay={340}
                />
              </div>

              {/* Search bar */}
              <div className="mb-5 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
                <div className="search-glow relative flex items-center backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl transition-all duration-300">
                  <IconSearch className="w-4 h-4 text-zinc-500 ml-4 shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search by run ID, spec title, or branch..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 py-3 px-3 outline-none"
                  />
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-zinc-500 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-md mr-3 font-mono">
                    <span className="text-[11px]">&#8984;</span>K
                  </kbd>
                </div>
              </div>

              {/* Active score filter chip */}
              {scoreFilter && (
                <div className="mb-4 flex items-center gap-2 animate-fade-in-up">
                  <span className="text-[11px] text-zinc-500">Filtering by score:</span>
                  <button
                    onClick={() => setScoreFilter(null)}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                      SCORE_RANGES.find((s) => s.key === scoreFilter)!.bg
                    } ${SCORE_RANGES.find((s) => s.key === scoreFilter)!.text}`}
                  >
                    {SCORE_RANGES.find((s) => s.key === scoreFilter)!.label}
                    <IconX className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Content area: list + TOC sidebar */}
              <div className="flex gap-6">
                {/* Main pipeline list */}
                <div className="flex-1 min-w-0">
                  {GROUP_ORDER.map((group) => {
                    const groupRuns = groupedRuns[group];
                    if (groupRuns.length === 0) return null;
                    const cfg = GROUP_CONFIG[group];
                    const isCollapsed = collapsedGroups.has(group);

                    return (
                      <div
                        key={group}
                        ref={(el) => { groupRefs.current[group] = el; }}
                        className="mb-4"
                      >
                        {/* Group header */}
                        <button
                          onClick={() => toggleGroup(group)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors duration-200 mb-1 group"
                        >
                          <IconChevron open={!isCollapsed} className="w-3.5 h-3.5 text-zinc-500" />
                          <span className={`w-2 h-2 rounded-full ${cfg.dot} ${group === "active" ? "animate-pulse" : ""}`} />
                          <span className={`text-[13px] font-semibold ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            ({groupRuns.length})
                          </span>
                        </button>

                        {/* Collapsible run list */}
                        <div
                          className="overflow-hidden transition-all duration-300 ease-in-out"
                          style={{
                            maxHeight: isCollapsed ? 0 : groupRuns.length * 200,
                            opacity: isCollapsed ? 0 : 1,
                          }}
                        >
                          <div className="backdrop-blur-xl bg-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
                            {groupRuns.map((run, idx) => (
                              <PipelineRow
                                key={run.id}
                                run={run}
                                specTitle={specTitleMap.get(run.specificationId) ?? "Untitled Spec"}
                                onClick={() => router.push(`/pipelines/${run.id}`)}
                                onCancel={() => cancelRun(run.id)}
                                style={{ animationDelay: `${300 + idx * 60}ms` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty search state */}
                  {filteredRuns.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <IconSearch className="w-8 h-8 text-zinc-600 mb-3" />
                      <p className="text-zinc-400 text-[14px]">No pipeline runs found</p>
                      <p className="text-zinc-600 text-[12px] mt-1">Try adjusting your search query</p>
                    </div>
                  )}
                </div>

                {/* Right TOC sidebar */}
                <TocSidebar
                  groups={tocGroups}
                  activeGroup={activeGroup}
                  onNavigate={navigateToGroup}
                  scoreFilter={scoreFilter}
                  onScoreFilter={setScoreFilter}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
