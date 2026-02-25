"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSpecificationStore } from "../hooks/useSpecificationStore";
import { useProjectContext } from "../components/ProjectContext";
import type { Specification, SpecificationStatus } from "../specifications";

// =============================================================================
// Display group types + config
// =============================================================================

type DisplayGroup = "pipeline" | "draft" | "done" | "failed";

const STATUS_ORDER: DisplayGroup[] = ["pipeline", "draft", "done", "failed"];

function toDisplayGroup(status: SpecificationStatus): DisplayGroup {
  if (status === "pipeline") return "pipeline";
  if (status === "draft") return "draft";
  if (status === "done") return "done";
  return "failed"; // failed + cancelled
}

const GROUP_CONFIG: Record<
  DisplayGroup,
  { label: string; color: string; border: string; bg: string; dot: string; text: string }
> = {
  pipeline: {
    label: "In Pipeline",
    color: "text-indigo-400",
    border: "border-l-indigo-500",
    bg: "bg-indigo-500/10",
    dot: "bg-indigo-500",
    text: "text-indigo-300",
  },
  draft: {
    label: "Draft",
    color: "text-zinc-400",
    border: "border-l-zinc-500",
    bg: "bg-zinc-500/10",
    dot: "bg-zinc-500",
    text: "text-zinc-400",
  },
  done: {
    label: "Done",
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
};

const STATUS_BADGE: Record<SpecificationStatus, { dot: string; label: string; bg: string; text: string }> = {
  draft:     { dot: "bg-zinc-500",                  label: "Draft",     bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  pipeline:  { dot: "bg-indigo-500 animate-pulse",  label: "Pipeline",  bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  done:      { dot: "bg-emerald-500",               label: "Done",      bg: "bg-emerald-500/10", text: "text-emerald-400" },
  failed:    { dot: "bg-red-500",                   label: "Failed",    bg: "bg-red-500/10",     text: "text-red-400" },
  cancelled: { dot: "bg-amber-500",                 label: "Cancelled", bg: "bg-amber-500/10",   text: "text-amber-400" },
};

// =============================================================================
// Helpers
// =============================================================================

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

function IconEye({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconTrash({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function IconDoc({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
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

function IconPipeline({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconEdit({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

// =============================================================================
// Stat card
// =============================================================================

function StatCard({
  label,
  value,
  icon,
  accentColor,
  delay,
}: {
  label: string;
  value: number;
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
      </div>
      <div className="text-[12px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

// =============================================================================
// Spec row
// =============================================================================

function SpecRow({
  spec,
  version,
  onView,
  onDelete,
  confirmingDelete,
  onCancelDelete,
  style,
}: {
  spec: Specification;
  version: number | null;
  onView: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onCancelDelete: () => void;
  style: React.CSSProperties;
}) {
  const group = toDisplayGroup(spec.status);
  const groupCfg = GROUP_CONFIG[group];
  const badge = STATUS_BADGE[spec.status];

  return (
    <div style={style} className="animate-fade-in-up">
      <div
        className={`group relative border-l-[3px] ${groupCfg.border} bg-white/[0.015] hover:bg-white/[0.04] border-b border-white/[0.04] transition-all duration-200 cursor-pointer`}
        onClick={onView}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Spec title + status badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-zinc-100 truncate">
                {spec.title}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${badge.bg} ${badge.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                {badge.label}
              </span>
            </div>
          </div>

          {/* Version badge */}
          <span className="text-[12px] text-zinc-500 font-mono tabular-nums shrink-0">
            {version != null ? (
              <span className="bg-white/[0.04] px-2 py-0.5 rounded">v{version}</span>
            ) : (
              <span className="text-zinc-600">&mdash;</span>
            )}
          </span>

          {/* Timestamp */}
          <span className="text-[11px] text-zinc-500 w-[60px] text-right shrink-0">
            {relativeTime(spec.updatedAt)}
          </span>

          {/* Hover action icons */}
          <div className="flex items-center gap-1 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shrink-0" onClick={(e) => e.stopPropagation()}>
            {confirmingDelete ? (
              <div className="flex gap-1">
                <button
                  onClick={onDelete}
                  className="rounded px-2 py-1 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={onCancelDelete}
                  className="rounded px-2 py-1 text-[11px] text-zinc-400 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={onView}
                  className="p-1.5 rounded-md hover:bg-white/[0.08] text-zinc-400 hover:text-violet-400 transition-colors"
                  title="View"
                >
                  <IconEye />
                </button>
                <button
                  onClick={() => onDelete()}
                  className="p-1.5 rounded-md hover:bg-white/[0.08] text-zinc-400 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <IconTrash />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TOC Sidebar
// =============================================================================

function TocSidebar({
  groups,
  activeGroup,
  onNavigate,
}: {
  groups: { group: DisplayGroup; count: number }[];
  activeGroup: DisplayGroup | null;
  onNavigate: (group: DisplayGroup) => void;
}) {
  return (
    <div className="w-[200px] shrink-0 hidden lg:block">
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
                    <span className={`w-2 h-2 rounded-full ${cfg.dot} ${group === "pipeline" && isActive ? "animate-pulse" : ""}`} />
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
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main page
// =============================================================================

export default function SpecificationsPage() {
  const router = useRouter();
  const { activeProjectId } = useProjectContext();
  const { specifications, loaded, getLatestVersion, deleteSpecification } = useSpecificationStore(activeProjectId);

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DisplayGroup>>(new Set());
  const [activeGroup, setActiveGroup] = useState<DisplayGroup | null>("pipeline");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    STATUS_ORDER.forEach((group) => {
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

  // Filter specs by search
  const filteredSpecs = useMemo(() => {
    if (!searchQuery.trim()) return specifications;
    const q = searchQuery.toLowerCase();
    return specifications.filter((s) => s.title.toLowerCase().includes(q));
  }, [searchQuery, specifications]);

  // Group specs
  const groupedSpecs = useMemo(() => {
    const map: Record<DisplayGroup, Specification[]> = {
      pipeline: [],
      draft: [],
      done: [],
      failed: [],
    };
    filteredSpecs.forEach((s) => map[toDisplayGroup(s.status)].push(s));
    return map;
  }, [filteredSpecs]);

  // Stats
  const stats = useMemo(() => {
    const total = specifications.length;
    const inPipeline = specifications.filter((s) => s.status === "pipeline").length;
    const done = specifications.filter((s) => s.status === "done").length;
    const drafts = specifications.filter((s) => s.status === "draft").length;
    return { total, inPipeline, done, drafts };
  }, [specifications]);

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

  const tocGroups = STATUS_ORDER.map((group) => ({
    group,
    count: groupedSpecs[group].length,
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
              <span className="text-zinc-300">Specifications</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Specifications</h1>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Project specifications and requirements
                </p>
              </div>
              <Link
                href="/specifications/new"
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors duration-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New Spec
              </Link>
            </div>
          </div>

          {!loaded ? (
            <div className="flex h-64 items-center justify-center text-zinc-500">Loading...</div>
          ) : specifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                <svg className="h-12 w-12 text-zinc-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-zinc-400 mt-4">No specifications yet</p>
                <Link
                  href="/specifications/new"
                  className="inline-block mt-4 text-[13px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Create your first specification
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <StatCard
                  label="Total Specs"
                  value={stats.total}
                  icon={<IconDoc />}
                  accentColor="text-indigo-400"
                  delay={100}
                />
                <StatCard
                  label="In Pipeline"
                  value={stats.inPipeline}
                  icon={<IconPipeline />}
                  accentColor="text-violet-400"
                  delay={180}
                />
                <StatCard
                  label="Done"
                  value={stats.done}
                  icon={<IconCheck />}
                  accentColor="text-emerald-400"
                  delay={260}
                />
                <StatCard
                  label="Drafts"
                  value={stats.drafts}
                  icon={<IconEdit />}
                  accentColor="text-amber-400"
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
                    placeholder="Search specifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 py-3 px-3 outline-none"
                  />
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-zinc-500 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-md mr-3 font-mono">
                    <span className="text-[11px]">&#8984;</span>K
                  </kbd>
                </div>
              </div>

              {/* Content area: list + TOC sidebar */}
              <div className="flex gap-6">
                {/* Main spec list */}
                <div className="flex-1 min-w-0">
                  {STATUS_ORDER.map((group) => {
                    const specs = groupedSpecs[group];
                    if (specs.length === 0) return null;
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
                          <span className={`w-2 h-2 rounded-full ${cfg.dot} ${group === "pipeline" ? "animate-pulse" : ""}`} />
                          <span className={`text-[13px] font-semibold ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            ({specs.length})
                          </span>
                        </button>

                        {/* Collapsible spec list */}
                        <div
                          className="overflow-hidden transition-all duration-300 ease-in-out"
                          style={{
                            maxHeight: isCollapsed ? 0 : specs.length * 200,
                            opacity: isCollapsed ? 0 : 1,
                          }}
                        >
                          <div className="backdrop-blur-xl bg-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
                            {specs.map((spec, idx) => (
                              <SpecRow
                                key={spec.id}
                                spec={spec}
                                version={getLatestVersion(spec.id)?.versionNumber ?? null}
                                onView={() => router.push(`/specifications/${spec.id}`)}
                                onDelete={
                                  confirmDelete === spec.id
                                    ? async () => { await deleteSpecification(spec.id); setConfirmDelete(null); }
                                    : () => setConfirmDelete(spec.id)
                                }
                                confirmingDelete={confirmDelete === spec.id}
                                onCancelDelete={() => setConfirmDelete(null)}
                                style={{ animationDelay: `${300 + idx * 60}ms` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty search state */}
                  {filteredSpecs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <IconSearch className="w-8 h-8 text-zinc-600 mb-3" />
                      <p className="text-zinc-400 text-[14px]">No specifications found</p>
                      <p className="text-zinc-600 text-[12px] mt-1">Try adjusting your search query</p>
                    </div>
                  )}
                </div>

                {/* Right TOC sidebar */}
                <TocSidebar
                  groups={tocGroups}
                  activeGroup={activeGroup}
                  onNavigate={navigateToGroup}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
