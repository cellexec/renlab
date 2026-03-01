"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getSupabase } from "./lib/supabase";
import { useProjectContext } from "./components/ProjectContext";
import type { PipelineStatus, StepTimings } from "./pipelines";

// =============================================================================
// Types
// =============================================================================

type TabId = "dashboard" | "activity";
type ActivityFilter = "all" | "specs" | "pipelines" | "sessions";
type DrillDown = "success" | "scores" | "active" | "specs" | null;

type EventType =
  | "spec_created"
  | "spec_updated"
  | "pipeline_started"
  | "pipeline_succeeded"
  | "pipeline_failed"
  | "session_started";

interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  status: string | null;
  timestamp: string;
  link: string;
  category: "specs" | "pipelines" | "sessions";
}

interface RawPipelineRow {
  id: string;
  project_id: string;
  specification_id: string;
  status: PipelineStatus;
  review_score: number | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  iterations: number;
  step_timings: StepTimings | null;
}

interface RawSpecRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RunData {
  id: string;
  specificationId: string;
  specTitle: string;
  status: PipelineStatus;
  reviewScore: number | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  iterations: number;
  stepTimings: StepTimings | null;
}

interface SessionRow {
  client_id: string;
  label: string | null;
  agent_id: string | null;
  created_at: string;
}

// =============================================================================
// Constants
// =============================================================================

const ACTIVE_STATUSES: PipelineStatus[] = [
  "pending",
  "worktree",
  "coding",
  "reviewing",
  "merging",
];

const PIPELINE_STEPS: PipelineStatus[] = [
  "pending",
  "worktree",
  "coding",
  "reviewing",
  "merging",
];

const STEP_META: Record<
  string,
  { label: string; color: string; dotColor: string }
> = {
  pending: { label: "Pending", color: "text-zinc-400", dotColor: "bg-zinc-400" },
  worktree: { label: "Worktree", color: "text-amber-400", dotColor: "bg-amber-400" },
  coding: { label: "Coding", color: "text-indigo-400", dotColor: "bg-indigo-400" },
  reviewing: { label: "Reviewing", color: "text-violet-400", dotColor: "bg-violet-400" },
  merging: { label: "Merging", color: "text-cyan-400", dotColor: "bg-cyan-500" },
};

const EVENT_CONFIG: Record<
  EventType,
  { label: string; dot: string; iconColor: string; statusBg: string; statusText: string }
> = {
  spec_created: {
    label: "Spec Created",
    dot: "bg-violet-500",
    iconColor: "text-violet-400",
    statusBg: "bg-violet-500/10",
    statusText: "text-violet-300",
  },
  spec_updated: {
    label: "Spec Updated",
    dot: "bg-violet-400",
    iconColor: "text-violet-400",
    statusBg: "bg-violet-500/10",
    statusText: "text-violet-300",
  },
  pipeline_started: {
    label: "Pipeline Started",
    dot: "bg-indigo-500",
    iconColor: "text-indigo-400",
    statusBg: "bg-indigo-500/10",
    statusText: "text-indigo-300",
  },
  pipeline_succeeded: {
    label: "Pipeline Succeeded",
    dot: "bg-emerald-500",
    iconColor: "text-emerald-400",
    statusBg: "bg-emerald-500/10",
    statusText: "text-emerald-300",
  },
  pipeline_failed: {
    label: "Pipeline Failed",
    dot: "bg-red-500",
    iconColor: "text-red-400",
    statusBg: "bg-red-500/10",
    statusText: "text-red-300",
  },
  session_started: {
    label: "Session Started",
    dot: "bg-amber-500",
    iconColor: "text-amber-400",
    statusBg: "bg-amber-500/10",
    statusText: "text-amber-300",
  },
};

const PAGE_SIZE = 30;

// =============================================================================
// Icons
// =============================================================================

function IconSpec({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconPipeline({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconSession({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function IconArrowRight({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function IconTimeline({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function elapsedString(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
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

function dateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (startOfDate.getTime() === startOfToday.getTime()) return "Today";
  if (startOfDate.getTime() === startOfYesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pipelineEventType(status: string): EventType {
  if (status === "success") return "pipeline_succeeded";
  if (status === "failed" || status === "rejected") return "pipeline_failed";
  return "pipeline_started";
}

function pipelineStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Pending",
    worktree: "Worktree",
    coding: "Coding",
    reviewing: "Reviewing",
    merging: "Merging",
    success: "Success",
    failed: "Failed",
    cancelled: "Cancelled",
    rejected: "Rejected",
  };
  return map[status] ?? status;
}

function dateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// =============================================================================
// Tab Bar
// =============================================================================

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 inline-flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
            active === tab.id
              ? "bg-white/[0.06] text-zinc-100"
              : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Donut Chart (from v10)
// =============================================================================

function DonutChart({
  segments,
  total,
}: {
  segments: { count: number; color: string; label: string }[];
  total: number;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 78;
  const strokeWidth = 22;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-zinc-500 text-[14px]" dominantBaseline="middle">
          No data
        </text>
      </svg>
    );
  }

  const arcs: React.ReactNode[] = [];
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  for (const seg of segments) {
    if (seg.count === 0) continue;
    const fraction = seg.count / total;
    const dashLength = fraction * circumference;
    const gapLength = circumference - dashLength;
    arcs.push(
      <circle
        key={seg.label}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={seg.color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dashLength} ${gapLength}`}
        strokeDashoffset={-cumulativeOffset}
        strokeLinecap="butt"
        className="transition-all duration-1000 ease-out"
        style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
      />
    );
    cumulativeOffset += dashLength;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
      {arcs}
      <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-100 font-mono" style={{ fontSize: "36px", fontWeight: 700 }}>
        {total}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-500" style={{ fontSize: "12px", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        total runs
      </text>
    </svg>
  );
}

// =============================================================================
// Step Dots (from v10)
// =============================================================================

function StepDots({ currentStatus }: { currentStatus: PipelineStatus }) {
  const currentIdx = PIPELINE_STEPS.indexOf(currentStatus);
  return (
    <div className="flex items-center gap-1.5">
      {PIPELINE_STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        const meta = STEP_META[step];
        return (
          <div key={step} className="flex items-center gap-1.5">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                isActive
                  ? `${meta.dotColor} animate-pulse scale-125`
                  : isPast
                    ? `${meta.dotColor} opacity-60`
                    : "bg-white/[0.08]"
              }`}
              title={meta.label}
            />
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`w-3 h-[1.5px] rounded-full transition-all duration-300 ${isPast ? "bg-white/[0.15]" : "bg-white/[0.04]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Elapsed Timer (from v10)
// =============================================================================

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() => elapsedString(createdAt));
  useEffect(() => {
    const interval = setInterval(() => setElapsed(elapsedString(createdAt)), 1000);
    return () => clearInterval(interval);
  }, [createdAt]);
  return <span className="text-[15px] font-mono tabular-nums text-zinc-400">{elapsed}</span>;
}

// =============================================================================
// Stat Card (new)
// =============================================================================

function StatCard({
  label,
  value,
  subtitle,
  colorClass,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  value: string;
  subtitle: string;
  colorClass: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative backdrop-blur-xl border rounded-xl p-5 text-left transition-all duration-300 hover:bg-white/[0.05] cursor-pointer ${
        isActive
          ? "bg-white/[0.05] border-white/[0.12]"
          : "bg-white/[0.03] border-white/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-white/[0.04] ${colorClass}`}>{icon}</div>
        <svg className={`w-4 h-4 transition-transform duration-200 ${isActive ? "rotate-180 text-zinc-300" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
      <div className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${colorClass}`}>
        {value}
      </div>
      <div className="text-[12px] text-zinc-500 mt-0.5">{label}</div>
      <div className="text-[11px] text-zinc-600 mt-1">{subtitle}</div>
    </button>
  );
}

// =============================================================================
// Daily Runs Chart (SVG stacked bar — 14 days)
// =============================================================================

function DailyRunsChart({ runs }: { runs: RunData[] }) {
  const dailyData = useMemo(() => {
    const days: { date: string; success: number; failed: number; active: number; cancelled: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        success: 0,
        failed: 0,
        active: 0,
        cancelled: 0,
      });
    }
    for (const r of runs) {
      const dk = dateKey(r.createdAt);
      const rd = new Date(r.createdAt);
      const dayIdx = Math.floor((now.getTime() - new Date(rd.getFullYear(), rd.getMonth(), rd.getDate()).getTime()) / 86400000);
      if (dayIdx < 0 || dayIdx > 13) continue;
      const idx = 13 - dayIdx;
      if (r.status === "success") days[idx].success++;
      else if (r.status === "failed" || r.status === "rejected") days[idx].failed++;
      else if (r.status === "cancelled") days[idx].cancelled++;
      else days[idx].active++;
    }
    return days;
  }, [runs]);

  const maxVal = Math.max(1, ...dailyData.map((d) => d.success + d.failed + d.active + d.cancelled));
  const w = 420;
  const h = 160;
  const barW = 18;
  const gap = (w - dailyData.length * barW) / (dailyData.length + 1);

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} className="overflow-visible">
      {dailyData.map((day, i) => {
        const x = gap + i * (barW + gap);
        const total = day.success + day.failed + day.active + day.cancelled;
        const barH = (total / maxVal) * h;
        let y = h - barH;
        const segs = [
          { val: day.success, color: "#34d399" },
          { val: day.active, color: "#818cf8" },
          { val: day.failed, color: "#f87171" },
          { val: day.cancelled, color: "#71717a" },
        ];
        return (
          <g key={i}>
            {segs.map((seg, si) => {
              if (seg.val === 0) return null;
              const segH = (seg.val / maxVal) * h;
              const rect = <rect key={si} x={x} y={y} width={barW} height={segH} rx={2} fill={seg.color} />;
              y += segH;
              return rect;
            })}
            {total === 0 && (
              <rect x={x} y={h - 2} width={barW} height={2} rx={1} fill="rgba(255,255,255,0.06)" />
            )}
            <text x={x + barW / 2} y={h + 16} textAnchor="middle" className="fill-zinc-600" style={{ fontSize: "9px" }}>
              {day.date}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =============================================================================
// Success Rate Sparkline (SVG)
// =============================================================================

function SuccessRateSpark({ runs }: { runs: RunData[] }) {
  const dailyRates = useMemo(() => {
    const now = new Date();
    const rates: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const dayRuns = runs.filter((r) => {
        const t = new Date(r.createdAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });
      const completed = dayRuns.filter((r) => r.status === "success" || r.status === "failed" || r.status === "rejected");
      const successes = completed.filter((r) => r.status === "success");
      rates.push(completed.length > 0 ? (successes.length / completed.length) * 100 : -1);
    }
    return rates;
  }, [runs]);

  const w = 420;
  const h = 160;
  const padding = 16;
  const validRates = dailyRates.filter((r) => r >= 0);
  if (validRates.length < 2) {
    return (
      <div className="flex items-center justify-center h-[184px] text-zinc-600 text-[13px]">
        Not enough data for trend
      </div>
    );
  }

  const points: { x: number; y: number; rate: number }[] = [];
  const step = (w - 2 * padding) / 13;
  for (let i = 0; i < 14; i++) {
    if (dailyRates[i] < 0) continue;
    points.push({
      x: padding + i * step,
      y: padding + ((100 - dailyRates[i]) / 100) * (h - 2 * padding),
      rate: dailyRates[i],
    });
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h - padding} L ${points[0].x} ${h - padding} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((v) => {
        const y = padding + ((100 - v) / 100) * (h - 2 * padding);
        return (
          <g key={v}>
            <line x1={padding} y1={y} x2={w - padding} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <text x={4} y={y + 3} className="fill-zinc-600" style={{ fontSize: "9px" }}>{v}%</text>
          </g>
        );
      })}
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path d={linePath} fill="none" stroke="#34d399" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#34d399" />
      ))}
    </svg>
  );
}

// =============================================================================
// Score Histogram (SVG)
// =============================================================================

function ScoreHistogram({ runs }: { runs: RunData[] }) {
  const buckets = useMemo(() => {
    const b = Array.from({ length: 10 }, (_, i) => ({
      label: `${i * 10}-${i * 10 + 9}`,
      count: 0,
      idx: i,
    }));
    for (const r of runs) {
      if (r.reviewScore == null) continue;
      const idx = Math.min(9, Math.floor(r.reviewScore / 10));
      b[idx].count++;
    }
    return b;
  }, [runs]);

  const maxVal = Math.max(1, ...buckets.map((b) => b.count));
  const w = 420;
  const h = 160;
  const barW = 28;
  const gap = (w - buckets.length * barW) / (buckets.length + 1);

  const bucketColor = (idx: number) => {
    if (idx < 3) return "#f87171";
    if (idx < 5) return "#fb923c";
    if (idx < 7) return "#fbbf24";
    return "#34d399";
  };

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} className="overflow-visible">
      {buckets.map((bucket, i) => {
        const x = gap + i * (barW + gap);
        const barH = (bucket.count / maxVal) * h;
        return (
          <g key={i}>
            <rect x={x} y={h - barH} width={barW} height={Math.max(barH, 2)} rx={3} fill={bucketColor(i)} opacity={bucket.count > 0 ? 1 : 0.15} />
            {bucket.count > 0 && (
              <text x={x + barW / 2} y={h - barH - 4} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: "10px" }}>
                {bucket.count}
              </text>
            )}
            <text x={x + barW / 2} y={h + 14} textAnchor="middle" className="fill-zinc-600" style={{ fontSize: "8px" }}>
              {bucket.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =============================================================================
// Step Duration Bars (SVG horizontal)
// =============================================================================

function StepDurationBars({ runs }: { runs: RunData[] }) {
  const durations = useMemo(() => {
    const steps = ["worktree", "coding", "reviewing", "merging"] as const;
    const sums: Record<string, { total: number; count: number }> = {};
    for (const s of steps) sums[s] = { total: 0, count: 0 };

    for (const r of runs) {
      if (!r.stepTimings) continue;
      for (const s of steps) {
        const t = r.stepTimings[s];
        if (t && t.startedAt && t.endedAt) {
          sums[s].total += t.endedAt - t.startedAt;
          sums[s].count++;
        }
      }
    }

    return steps.map((s) => ({
      step: STEP_META[s]?.label ?? s,
      avgMs: sums[s].count > 0 ? sums[s].total / sums[s].count : 0,
      color: STEP_META[s]?.dotColor ?? "bg-zinc-400",
      hexColor: s === "worktree" ? "#fbbf24" : s === "coding" ? "#818cf8" : s === "reviewing" ? "#a78bfa" : "#06b6d4",
    }));
  }, [runs]);

  const maxMs = Math.max(1, ...durations.map((d) => d.avgMs));
  const w = 420;
  const h = 140;
  const barH = 20;
  const gap = (h - durations.length * barH) / (durations.length + 1);

  const formatDuration = (ms: number) => {
    if (ms === 0) return "N/A";
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {durations.map((d, i) => {
        const y = gap + i * (barH + gap);
        const barW2 = d.avgMs > 0 ? (d.avgMs / maxMs) * (w - 140) : 0;
        return (
          <g key={i}>
            <text x={0} y={y + barH / 2 + 4} className="fill-zinc-400" style={{ fontSize: "11px" }}>
              {d.step}
            </text>
            <rect x={72} y={y} width={Math.max(barW2, 2)} height={barH} rx={4} fill={d.hexColor} opacity={d.avgMs > 0 ? 0.8 : 0.15} />
            <text x={72 + barW2 + 8} y={y + barH / 2 + 4} className="fill-zinc-500" style={{ fontSize: "11px" }}>
              {formatDuration(d.avgMs)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =============================================================================
// Spec Completion Funnel (SVG)
// =============================================================================

function SpecFunnel({ specs }: { specs: RawSpecRow[] }) {
  const stages = useMemo(() => {
    const total = specs.length;
    const inPipeline = specs.filter((s) => s.status === "pipeline" || s.status === "done").length;
    const completed = specs.filter((s) => s.status === "done").length;
    return [
      { label: "Created", count: total, color: "#a78bfa" },
      { label: "In Pipeline", count: inPipeline, color: "#818cf8" },
      { label: "Completed", count: completed, color: "#34d399" },
    ];
  }, [specs]);

  if (stages[0].count === 0) {
    return (
      <div className="flex items-center justify-center h-[80px] text-zinc-600 text-[13px]">
        No specifications yet
      </div>
    );
  }

  const w = 800;
  const h = 80;
  const segW = (w - 60) / 3;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {stages.map((stage, i) => {
        const x = i * (segW + 30);
        const barW2 = stage.count > 0 ? Math.max((stage.count / stages[0].count) * segW, 24) : 24;
        const barH = 36;
        const y = (h - barH) / 2;
        return (
          <g key={i}>
            <rect x={x + (segW - barW2) / 2} y={y} width={barW2} height={barH} rx={6} fill={stage.color} opacity={0.8} />
            <text x={x + segW / 2} y={y - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: "11px" }}>
              {stage.label}
            </text>
            <text x={x + segW / 2} y={y + barH / 2 + 5} textAnchor="middle" className="fill-white font-mono" style={{ fontSize: "14px", fontWeight: 700 }}>
              {stage.count}
            </text>
            {i < stages.length - 1 && (
              <g>
                <line
                  x1={x + segW / 2 + barW2 / 2 + 4}
                  y1={h / 2}
                  x2={x + segW + 26}
                  y2={h / 2}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={2}
                  markerEnd=""
                />
                <text x={x + segW + 15} y={h / 2 + 4} textAnchor="middle" className="fill-zinc-600" style={{ fontSize: "14px" }}>
                  &rarr;
                </text>
                {stages[0].count > 0 && (
                  <text x={x + segW + 15} y={h / 2 + 20} textAnchor="middle" className="fill-zinc-600" style={{ fontSize: "9px" }}>
                    {Math.round((stages[i + 1].count / stages[i].count) * 100) || 0}%
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// =============================================================================
// Filter Sidebar (from v9 — used in Activity tab)
// =============================================================================

const FILTER_OPTIONS: { key: ActivityFilter; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All Activity", icon: <IconTimeline className="w-3.5 h-3.5" /> },
  { key: "specs", label: "Specs Only", icon: <IconSpec className="w-3.5 h-3.5" /> },
  { key: "pipelines", label: "Pipelines Only", icon: <IconPipeline className="w-3.5 h-3.5" /> },
  { key: "sessions", label: "Sessions Only", icon: <IconSession className="w-3.5 h-3.5" /> },
];

function FilterSidebar({
  filter,
  onFilter,
  counts,
}: {
  filter: ActivityFilter;
  onFilter: (f: ActivityFilter) => void;
  counts: { specs: number; pipelines: number; sessions: number; all: number };
}) {
  return (
    <div className="w-[200px] shrink-0">
      <div className="sticky top-6">
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Filter Activity
          </h3>
          <div className="flex flex-col gap-1">
            {FILTER_OPTIONS.map(({ key, label, icon }) => {
              const isActive = filter === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  onClick={() => onFilter(key)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all duration-200 ${
                    isActive
                      ? "bg-white/[0.06] border border-white/[0.08]"
                      : "hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={isActive ? "text-zinc-100" : "text-zinc-500"}>{icon}</span>
                    <span className={`text-[13px] ${isActive ? "text-zinc-100 font-medium" : "text-zinc-400"}`}>
                      {label}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${isActive ? "bg-violet-500/10 text-violet-300" : "text-zinc-500 bg-white/[0.03]"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] my-4" />

          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Summary</h3>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span className="text-zinc-400">Specs</span>
              <span className="ml-auto font-mono tabular-nums text-zinc-500">{counts.specs}</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-zinc-400">Pipelines</span>
              <span className="ml-auto font-mono tabular-nums text-zinc-500">{counts.pipelines}</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-zinc-400">Sessions</span>
              <span className="ml-auto font-mono tabular-nums text-zinc-500">{counts.sessions}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Timeline Event Card (from v9)
// =============================================================================

function TimelineEventCard({
  event,
  side,
  delay,
}: {
  event: TimelineEvent;
  side: "left" | "right";
  delay: number;
}) {
  const cfg = EVENT_CONFIG[event.type];
  return (
    <div
      className={`relative flex items-center gap-0 animate-fade-in-up ${side === "left" ? "flex-row-reverse" : "flex-row"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`hidden md:block w-8 h-[2px] bg-white/[0.06] shrink-0 ${side === "left" ? "ml-0" : "mr-0"}`} />
      <Link
        href={event.link}
        className={`group flex-1 max-w-[360px] backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.1] cursor-pointer ${side === "left" ? "text-right" : "text-left"}`}
      >
        <div className={`flex items-center gap-2 mb-2 ${side === "left" ? "flex-row-reverse" : ""}`}>
          <span className={`p-1.5 rounded-lg bg-white/[0.04] ${cfg.iconColor}`}>
            {event.category === "specs" ? <IconSpec className="w-3.5 h-3.5" /> : event.category === "pipelines" ? <IconPipeline className="w-3.5 h-3.5" /> : <IconSession className="w-3.5 h-3.5" />}
          </span>
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.iconColor}`}>{cfg.label}</span>
        </div>
        <p className="text-[13px] text-zinc-200 font-medium truncate group-hover:text-zinc-100 transition-colors">{event.title}</p>
        <div className={`flex items-center gap-2 mt-2 ${side === "left" ? "flex-row-reverse" : ""}`}>
          {event.status && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${cfg.statusBg} ${cfg.statusText}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {event.status}
            </span>
          )}
          <span className="text-[11px] text-zinc-500 font-mono tabular-nums">{relativeTime(event.timestamp)}</span>
          <IconArrowRight className={`w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ${side === "left" ? "rotate-180" : ""}`} />
        </div>
      </Link>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function DashboardPage() {
  const { activeProject, activeProjectId } = useProjectContext();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [drillDown, setDrillDown] = useState<DrillDown>(null);

  // Data stores
  const [runs, setRuns] = useState<RunData[]>([]);
  const [specs, setSpecs] = useState<RawSpecRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  // Activity tab state
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Mount animation
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // =========================================================================
  // Fetch all data
  // =========================================================================
  const fetchData = useCallback(async (projectId: string) => {
    const sb = getSupabase();
    const [runsResult, specsResult, sessionsResult] = await Promise.all([
      sb
        .from("pipeline_runs")
        .select("id, project_id, specification_id, status, review_score, error_message, created_at, finished_at, iterations, step_timings")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      sb
        .from("specifications")
        .select("id, title, status, created_at, updated_at")
        .eq("project_id", projectId),
      sb
        .from("sessions")
        .select("client_id, label, agent_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const specMap = new Map<string, string>();
    const specRows: RawSpecRow[] = [];
    if (specsResult.data) {
      for (const s of specsResult.data as RawSpecRow[]) {
        specRows.push(s);
        specMap.set(s.id, s.title);
      }
    }

    const runRows: RunData[] = [];
    if (runsResult.data) {
      for (const r of runsResult.data as RawPipelineRow[]) {
        runRows.push({
          id: r.id,
          specificationId: r.specification_id,
          specTitle: specMap.get(r.specification_id) ?? "Untitled",
          status: r.status,
          reviewScore: r.review_score,
          errorMessage: r.error_message,
          createdAt: r.created_at,
          finishedAt: r.finished_at,
          iterations: r.iterations ?? 1,
          stepTimings: r.step_timings,
        });
      }
    }

    const sessionRows: SessionRow[] = (sessionsResult.data ?? []) as SessionRow[];

    return { runs: runRows, specs: specRows, sessions: sessionRows };
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setRuns([]);
      setSpecs([]);
      setSessions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchData(activeProjectId).then((data) => {
      if (cancelled) return;
      setRuns(data.runs);
      setSpecs(data.specs);
      setSessions(data.sessions);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeProjectId, fetchData]);

  // Auto-refresh every 15s
  useEffect(() => {
    if (!activeProjectId) return;
    const interval = setInterval(() => {
      fetchData(activeProjectId).then((data) => {
        setRuns(data.runs);
        setSpecs(data.specs);
        setSessions(data.sessions);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [activeProjectId, fetchData]);

  // =========================================================================
  // Derived metrics (Dashboard tab)
  // =========================================================================

  const activeRuns = useMemo(() => runs.filter((r) => ACTIVE_STATUSES.includes(r.status)), [runs]);

  const failedCount = useMemo(() => runs.filter((r) => r.status === "failed" || r.status === "rejected").length, [runs]);
  const successCount = useMemo(() => runs.filter((r) => r.status === "success").length, [runs]);
  const cancelledCount = useMemo(() => runs.filter((r) => r.status === "cancelled").length, [runs]);
  const completedCount = successCount + failedCount;
  const successRate = completedCount > 0 ? Math.round((successCount / completedCount) * 100) : 0;

  const scoredRuns = useMemo(() => runs.filter((r) => r.reviewScore != null), [runs]);
  const avgScore = scoredRuns.length > 0 ? Math.round(scoredRuns.reduce((s, r) => s + r.reviewScore!, 0) / scoredRuns.length) : 0;

  const specCounts = useMemo(() => {
    const counts = { draft: 0, pipeline: 0, done: 0, failed: 0 };
    for (const s of specs) {
      if (s.status === "draft") counts.draft++;
      else if (s.status === "pipeline") counts.pipeline++;
      else if (s.status === "done") counts.done++;
      else counts.failed++;
    }
    return counts;
  }, [specs]);

  const specTotal = specs.length;
  const specCompletionPct = specTotal > 0 ? Math.round((specCounts.done / specTotal) * 100) : 0;

  const donutSegments = useMemo(() => [
    { count: successCount, color: "#34d399", label: "Success" },
    { count: activeRuns.length, color: "#818cf8", label: "Active" },
    { count: failedCount, color: "#f87171", label: "Failed" },
    { count: cancelledCount, color: "#71717a", label: "Cancelled" },
  ], [successCount, activeRuns.length, failedCount, cancelledCount]);

  const hasActiveIssues = runs.some((r) => r.status === "failed" || r.status === "rejected");

  // Drill-down data
  const failedRuns = useMemo(() => runs.filter((r) => r.status === "failed" || r.status === "rejected"), [runs]);
  const lowestScoredRuns = useMemo(() =>
    [...scoredRuns].sort((a, b) => a.reviewScore! - b.reviewScore!).slice(0, 5)
  , [scoredRuns]);

  // =========================================================================
  // Activity tab derived data
  // =========================================================================

  const allEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    for (const spec of specs) {
      events.push({
        id: `spec-created-${spec.id}`,
        type: "spec_created",
        title: spec.title || "Untitled Spec",
        status: spec.status,
        timestamp: spec.created_at,
        link: `/specifications/${spec.id}`,
        category: "specs",
      });
      if (spec.updated_at && new Date(spec.updated_at).getTime() - new Date(spec.created_at).getTime() > 60000) {
        events.push({
          id: `spec-updated-${spec.id}`,
          type: "spec_updated",
          title: spec.title || "Untitled Spec",
          status: spec.status,
          timestamp: spec.updated_at,
          link: `/specifications/${spec.id}`,
          category: "specs",
        });
      }
    }

    for (const run of runs) {
      events.push({
        id: `pipeline-${run.id}`,
        type: pipelineEventType(run.status),
        title: `Pipeline Run`,
        status: pipelineStatusLabel(run.status),
        timestamp: run.createdAt,
        link: `/pipelines/${run.id}`,
        category: "pipelines",
      });
    }

    for (const session of sessions) {
      events.push({
        id: `session-${session.client_id}`,
        type: "session_started",
        title: session.label || "Chat Session",
        status: null,
        timestamp: session.created_at,
        link: `/chat`,
        category: "sessions",
      });
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  }, [specs, runs, sessions]);

  const filteredEvents = useMemo(() => {
    if (activityFilter === "all") return allEvents;
    return allEvents.filter((e) => e.category === activityFilter);
  }, [allEvents, activityFilter]);

  const visibleEvents = useMemo(() => filteredEvents.slice(0, visibleCount), [filteredEvents, visibleCount]);

  const eventCounts = useMemo(() => {
    const s = allEvents.filter((e) => e.category === "specs").length;
    const p = allEvents.filter((e) => e.category === "pipelines").length;
    const se = allEvents.filter((e) => e.category === "sessions").length;
    return { specs: s, pipelines: p, sessions: se, all: allEvents.length };
  }, [allEvents]);

  const groupedByDate = useMemo(() => {
    const groups: { label: string; events: TimelineEvent[] }[] = [];
    let currentLabel = "";
    for (const event of visibleEvents) {
      const label = dateGroupLabel(event.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, events: [] });
      }
      groups[groups.length - 1].events.push(event);
    }
    return groups;
  }, [visibleEvents]);

  const hasMore = visibleCount < filteredEvents.length;
  const loadMore = useCallback(() => setVisibleCount((prev) => prev + PAGE_SIZE), []);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activityFilter]);

  // =========================================================================
  // Stat card config
  // =========================================================================

  const successRateColor = successRate >= 80 ? "text-emerald-400" : successRate >= 50 ? "text-amber-400" : completedCount === 0 ? "text-zinc-500" : "text-red-400";
  const avgScoreColor = avgScore >= 80 ? "text-emerald-400" : avgScore >= 50 ? "text-amber-400" : scoredRuns.length === 0 ? "text-zinc-500" : "text-red-400";
  const specColor = specCompletionPct >= 80 ? "text-emerald-400" : specCompletionPct >= 50 ? "text-amber-400" : "text-zinc-300";

  const toggleDrillDown = (key: DrillDown) => {
    setDrillDown((prev) => (prev === key ? null : key));
  };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Header */}
          <div className="mb-6 animate-fade-in-up" style={{ animationDelay: "0ms" }}>
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="text-zinc-300">Dashboard</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Dashboard</h1>
                <p className="mt-1 text-[13px] text-zinc-500">
                  {activeProject
                    ? `Overview for ${activeProject.title}`
                    : "Select a project to get started"}
                </p>
              </div>
              {!loading && activeProject && (
                <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                  <span className="inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-refreshing
                </div>
              )}
            </div>
          </div>

          {/* Tab bar */}
          {activeProject && (
            <div className="mb-6 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
              <TabBar active={tab} onChange={setTab} />
            </div>
          )}

          {/* No project prompt */}
          {!activeProject && (
            <div className="flex items-center gap-2 backdrop-blur-xl bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl px-5 py-4 mb-6 animate-fade-in-up" style={{ animationDelay: "80ms" }}>
              <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-[13px] text-amber-400">
                Select a project from the sidebar to view the dashboard.
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && activeProject && (
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-zinc-500">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-[14px]">Loading dashboard...</span>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* DASHBOARD TAB                                                      */}
          {/* ================================================================= */}
          {!loading && activeProject && tab === "dashboard" && (
            <>
              {/* 1. System Status Banner */}
              <div
                className={`w-full rounded-2xl px-6 py-5 mb-6 border animate-fade-in-up ${
                  hasActiveIssues
                    ? "backdrop-blur-xl bg-red-500/[0.04] border-red-500/[0.12]"
                    : "backdrop-blur-xl bg-emerald-500/[0.04] border-emerald-500/[0.1]"
                }`}
                style={{ animationDelay: "80ms" }}
              >
                <div className="flex items-center gap-4">
                  {hasActiveIssues ? (
                    <>
                      <div className="p-2.5 rounded-xl bg-red-500/[0.1]">
                        <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[20px] font-bold text-red-400 tracking-tight">
                          {failedCount} Issue{failedCount !== 1 ? "s" : ""} Detected
                        </p>
                        <p className="text-[13px] text-red-400/60 mt-0.5">
                          {failedCount} pipeline run{failedCount !== 1 ? "s" : ""} failed or rejected
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2.5 rounded-xl bg-emerald-500/[0.1]">
                        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[20px] font-bold text-emerald-400 tracking-tight">All Systems Operational</p>
                        <p className="text-[13px] text-emerald-400/60 mt-0.5">
                          {activeRuns.length > 0
                            ? `${activeRuns.length} pipeline${activeRuns.length !== 1 ? "s" : ""} actively running`
                            : "No active issues across all pipelines"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 2. Summary Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
                <StatCard
                  label="Success Rate"
                  value={completedCount > 0 ? `${successRate}%` : "--"}
                  subtitle={`${successCount}/${completedCount} completed`}
                  colorClass={successRateColor}
                  isActive={drillDown === "success"}
                  onClick={() => toggleDrillDown("success")}
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Avg Review Score"
                  value={scoredRuns.length > 0 ? `${avgScore}` : "--"}
                  subtitle={`${scoredRuns.length} scored`}
                  colorClass={avgScoreColor}
                  isActive={drillDown === "scores"}
                  onClick={() => toggleDrillDown("scores")}
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                  }
                />
                <StatCard
                  label="Active Pipelines"
                  value={`${activeRuns.length}`}
                  subtitle="running now"
                  colorClass="text-indigo-400"
                  isActive={drillDown === "active"}
                  onClick={() => toggleDrillDown("active")}
                  icon={<IconPipeline className="w-5 h-5" />}
                />
                <StatCard
                  label="Specs Completed"
                  value={specTotal > 0 ? `${specCompletionPct}%` : "--"}
                  subtitle={`${specCounts.done}/${specTotal} done`}
                  colorClass={specColor}
                  isActive={drillDown === "specs"}
                  onClick={() => toggleDrillDown("specs")}
                  icon={<IconSpec className="w-5 h-5" />}
                />
              </div>

              {/* 3. Drill-Down Panel */}
              {drillDown && (
                <div className="mb-6 backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 animate-fade-in-up">
                  {drillDown === "success" && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Failed Pipeline Runs</h3>
                      {failedRuns.length === 0 ? (
                        <p className="text-[13px] text-zinc-500">No failed runs</p>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-[240px] overflow-auto">
                          {failedRuns.slice(0, 10).map((r) => (
                            <Link key={r.id} href={`/pipelines/${r.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                              <span className="text-[13px] text-zinc-200 truncate flex-1">{r.specTitle}</span>
                              <span className="text-[11px] text-red-400 shrink-0">{pipelineStatusLabel(r.status)}</span>
                              <span className="text-[11px] text-zinc-600 font-mono shrink-0">{relativeTime(r.createdAt)}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {failedRuns.length > 0 && (
                        <p className="text-[11px] text-zinc-600 mt-3">
                          {failedRuns[0].errorMessage && (
                            <span className="text-red-400/60">Latest error: {failedRuns[0].errorMessage}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {drillDown === "scores" && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Lowest Scored Runs</h3>
                      {lowestScoredRuns.length === 0 ? (
                        <p className="text-[13px] text-zinc-500">No scored runs yet</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {lowestScoredRuns.map((r) => (
                            <Link key={r.id} href={`/pipelines/${r.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                              <span className={`text-[14px] font-bold font-mono tabular-nums w-8 ${r.reviewScore! >= 80 ? "text-emerald-400" : r.reviewScore! >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                {r.reviewScore}
                              </span>
                              <span className="text-[13px] text-zinc-200 truncate flex-1">{r.specTitle}</span>
                              <span className="text-[11px] text-zinc-500">{pipelineStatusLabel(r.status)}</span>
                              <span className="text-[11px] text-zinc-600 font-mono shrink-0">{relativeTime(r.createdAt)}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {drillDown === "active" && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Active Operations</h3>
                      {activeRuns.length === 0 ? (
                        <div className="flex flex-col items-center py-6 gap-2">
                          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                          </svg>
                          <p className="text-[14px] text-zinc-500">All quiet</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {activeRuns.map((run) => {
                            const meta = STEP_META[run.status] ?? STEP_META.pending;
                            return (
                              <Link key={run.id} href={`/pipelines/${run.id}`} className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                                <div className={`p-2 rounded-lg bg-white/[0.04] ${meta.color}`}>
                                  <IconPipeline className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-medium text-zinc-200 truncate">{run.specTitle}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className={`text-[12px] font-medium ${meta.color}`}>{meta.label}</span>
                                    <StepDots currentStatus={run.status} />
                                  </div>
                                </div>
                                <ElapsedTimer createdAt={run.createdAt} />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {drillDown === "specs" && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Specification Progress</h3>
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {([
                          { label: "Draft", count: specCounts.draft, color: "text-zinc-400" },
                          { label: "In Pipeline", count: specCounts.pipeline, color: "text-indigo-400" },
                          { label: "Done", count: specCounts.done, color: "text-emerald-400" },
                          { label: "Failed", count: specCounts.failed, color: "text-red-400" },
                        ] as const).map((s) => (
                          <div key={s.label} className="text-center p-3 rounded-lg bg-white/[0.02]">
                            <div className={`text-[18px] font-bold font-mono ${s.color}`}>{s.count}</div>
                            <div className="text-[11px] text-zinc-500">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <SpecFunnel specs={specs} />
                    </div>
                  )}
                </div>
              )}

              {/* 4. Pipeline Status + Spec Progress (2-col) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "180ms" }}>
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-6">Pipeline Status</h2>
                  <div className="flex items-center justify-center gap-8">
                    <DonutChart segments={donutSegments} total={runs.length} />
                    <div className="flex flex-col gap-3">
                      {donutSegments.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                          <div className="flex items-baseline gap-2">
                            <span className="text-[18px] font-bold font-mono tabular-nums text-zinc-100">{seg.count}</span>
                            <span className="text-[13px] text-zinc-500">{seg.label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "220ms" }}>
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-6">Specification Progress</h2>
                  {specTotal === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-zinc-600 text-[14px]">No specifications yet</div>
                  ) : (
                    <div className="flex flex-col justify-center h-[200px] gap-6">
                      <div className="w-full h-6 bg-white/[0.04] rounded-full overflow-hidden flex">
                        {specCounts.done > 0 && <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(specCounts.done / specTotal) * 100}%` }} />}
                        {specCounts.pipeline > 0 && <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(specCounts.pipeline / specTotal) * 100}%` }} />}
                        {specCounts.draft > 0 && <div className="h-full bg-zinc-500 transition-all duration-1000" style={{ width: `${(specCounts.draft / specTotal) * 100}%` }} />}
                        {specCounts.failed > 0 && <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${(specCounts.failed / specTotal) * 100}%` }} />}
                      </div>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        {[
                          { label: "Done", count: specCounts.done, color: "bg-emerald-500" },
                          { label: "In Pipeline", count: specCounts.pipeline, color: "bg-indigo-500" },
                          { label: "Draft", count: specCounts.draft, color: "bg-zinc-500" },
                          { label: "Failed", count: specCounts.failed, color: "bg-red-500" },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-3">
                            <span className={`w-3 h-3 rounded-full shrink-0 ${item.color}`} />
                            <div className="flex items-baseline gap-2">
                              <span className="text-[18px] font-bold font-mono tabular-nums text-zinc-100">{item.count}</span>
                              <span className="text-[13px] text-zinc-500">{item.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-[28px] font-bold font-mono tabular-nums ${specColor}`}>{specCompletionPct}%</span>
                        <span className="text-[13px] text-zinc-500">complete</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Active Operations */}
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-4 animate-fade-in-up" style={{ animationDelay: "260ms" }}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Active Operations</h2>
                  {activeRuns.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-indigo-400 font-medium">
                      <span className="inline-flex w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      {activeRuns.length} running
                    </span>
                  )}
                </div>
                {activeRuns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="p-4 rounded-2xl bg-white/[0.03]">
                      <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                      </svg>
                    </div>
                    <p className="text-[16px] font-medium text-zinc-500">All quiet</p>
                    <p className="text-[13px] text-zinc-600">No pipelines currently running</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 max-h-[320px] overflow-auto">
                    {activeRuns.map((run, i) => {
                      const meta = STEP_META[run.status] ?? STEP_META.pending;
                      return (
                        <Link
                          key={run.id}
                          href={`/pipelines/${run.id}`}
                          className="group flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-200 animate-fade-in-up"
                          style={{ animationDelay: `${300 + i * 60}ms` }}
                        >
                          <div className={`p-2.5 rounded-xl bg-white/[0.04] ${meta.color}`}>
                            <IconPipeline className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-zinc-200 truncate">{run.specTitle}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className={`text-[13px] font-medium ${meta.color}`}>{meta.label}</span>
                              <StepDots currentStatus={run.status} />
                            </div>
                          </div>
                          <ElapsedTimer createdAt={run.createdAt} />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 6. Pipeline Runs Over Time + Success Rate Trend (2-col) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Pipeline Runs (14 Days)</h2>
                  <DailyRunsChart runs={runs} />
                </div>
                <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "340ms" }}>
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Success Rate Trend</h2>
                  <SuccessRateSpark runs={runs} />
                </div>
              </div>

              {/* 7. Review Score Distribution + Step Duration Breakdown (2-col) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "380ms" }}>
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Review Score Distribution</h2>
                  <ScoreHistogram runs={runs} />
                </div>
                <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "420ms" }}>
                  <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Avg Step Duration</h2>
                  <StepDurationBars runs={runs} />
                </div>
              </div>

              {/* 8. Spec Completion Funnel */}
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: "460ms" }}>
                <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Spec Completion Funnel</h2>
                <SpecFunnel specs={specs} />
              </div>
            </>
          )}

          {/* ================================================================= */}
          {/* ACTIVITY TAB                                                       */}
          {/* ================================================================= */}
          {!loading && activeProject && tab === "activity" && (
            <>
              {allEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
                  <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                    <svg className="h-12 w-12 text-zinc-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-zinc-400 mt-4">No activity yet</p>
                    <p className="text-[12px] text-zinc-600 mt-1">Create a specification or start a session to see activity here</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-6">
                  <FilterSidebar filter={activityFilter} onFilter={setActivityFilter} counts={eventCounts} />
                  <div className="flex-1 min-w-0">
                    {filteredEvents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <p className="text-zinc-400 text-[14px]">No events match this filter</p>
                        <p className="text-zinc-600 text-[12px] mt-1">Try selecting a different activity type</p>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/[0.06] -translate-x-1/2" />
                        {groupedByDate.map((group, groupIdx) => (
                          <div key={group.label} className="mb-8">
                            <div className="relative flex items-center justify-center mb-6 animate-fade-in-up" style={{ animationDelay: `${100 + groupIdx * 40}ms` }}>
                              <div className="relative z-10 px-4 py-1.5 backdrop-blur-xl bg-zinc-950 border border-white/[0.06] rounded-full">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{group.label}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-4">
                              {group.events.map((event, eventIdx) => {
                                const side = eventIdx % 2 === 0 ? "left" : "right";
                                const baseDelay = 150 + groupIdx * 40 + eventIdx * 60;
                                return (
                                  <div key={event.id} className="relative">
                                    <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 items-center justify-center">
                                      <div className={`w-3 h-3 rounded-full ${EVENT_CONFIG[event.type].dot} ring-4 ring-zinc-950`} />
                                    </div>
                                    <div className="md:grid md:grid-cols-2 md:gap-0">
                                      {side === "left" ? (
                                        <>
                                          <div className="flex justify-end">
                                            <TimelineEventCard event={event} side="left" delay={baseDelay} />
                                          </div>
                                          <div className="hidden md:block" />
                                        </>
                                      ) : (
                                        <>
                                          <div className="hidden md:block" />
                                          <div className="flex justify-start">
                                            <TimelineEventCard event={event} side="right" delay={baseDelay} />
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {hasMore && (
                          <div className="flex justify-center mt-8 mb-4">
                            <button
                              onClick={loadMore}
                              className="px-5 py-2.5 text-[13px] font-medium backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-white/[0.1] text-zinc-300 transition-all duration-200"
                            >
                              Load more ({filteredEvents.length - visibleCount} remaining)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
