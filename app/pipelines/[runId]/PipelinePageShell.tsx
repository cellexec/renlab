"use client";

import { useState, useEffect, useRef, useMemo, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePipelineLogs } from "../../hooks/usePipelineLogs";
import { formatStepDuration, getStepTimingKey } from "../../components/PipelineSteps";
import { getSupabase } from "../../lib/supabase";
import type { PipelineRun, PipelineStep, PipelineLogEntry, StepTimings } from "../../pipelines";

const ALL_STEPS: PipelineStep[] = ["worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
const BASE_STEPS: PipelineStep[] = ["worktree", "coding", "reviewing", "merging"];
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

const STEP_LABELS: Record<PipelineStep, string> = {
  worktree: "Worktree",
  retrieving: "Retrieving",
  coding: "Coding",
  reviewing: "Reviewing",
  merging: "Merging",
  updating: "Updating",
};

const STEP_ICONS: Record<PipelineStep, string> = {
  worktree: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  retrieving: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  coding: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  reviewing: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  merging: "M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9",
  updating: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
};

type FocusPanel = "steps" | "logs";
type NavMode = "section" | "step" | "log" | "search";

// =============================================================================
// Semi-Circle Score Gauge (from v7)
// =============================================================================

function SemiCircleGauge({ score, threshold, animated }: { score: number; threshold: number; animated: boolean }) {
  const width = 320;
  const height = 180;
  const cx = width / 2;
  const cy = 160;
  const radius = 120;
  const strokeW = 14;
  const semiCircumference = Math.PI * radius;
  const scoreRatio = Math.min(score / 100, 1);
  const scoreArc = semiCircumference * scoreRatio;
  const scoreOffset = semiCircumference - scoreArc;
  const passed = score >= threshold;
  const scoreColor = passed ? "#10b981" : "#ef4444";
  const scoreGlowColor = passed ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)";
  const scoreGlowSoft = passed ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)";

  const thresholdRatio = threshold / 100;
  const thresholdAngle = Math.PI * (1 - thresholdRatio);
  const thresholdX = cx + radius * Math.cos(thresholdAngle);
  const thresholdY = cy - radius * Math.sin(thresholdAngle);

  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[320px] overflow-visible" preserveAspectRatio="xMidYMax meet">
        <defs>
          <filter id="score-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="score-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="gauge-track-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.07)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>

        {/* Track */}
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="url(#gauge-track-grad)" strokeWidth={strokeW} strokeLinecap="round" />

        {/* Tick marks */}
        {ticks.map((tick) => {
          const ratio = tick / 100;
          const angle = Math.PI * (1 - ratio);
          const innerR = radius - strokeW / 2 - 6;
          const outerR = radius - strokeW / 2 - 2;
          return (
            <g key={tick}>
              <line x1={cx + innerR * Math.cos(angle)} y1={cy - innerR * Math.sin(angle)} x2={cx + outerR * Math.cos(angle)} y2={cy - outerR * Math.sin(angle)} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" />
              <text x={cx + (radius + 18) * Math.cos(angle)} y={cy - (radius + 18) * Math.sin(angle) + 3} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily={MONO}>{tick}</text>
            </g>
          );
        })}

        {/* Soft outer glow */}
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreGlowSoft} strokeWidth={strokeW + 20} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />

        {/* Score glow */}
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreGlowColor} strokeWidth={strokeW + 8} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} filter="url(#score-glow-soft)" style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />

        {/* Score arc */}
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreColor} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} filter="url(#score-glow)" style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />

        {/* Threshold marker */}
        <circle cx={thresholdX} cy={thresholdY} r="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <text x={thresholdX + (thresholdX > cx ? 12 : -12)} y={thresholdY + 4} textAnchor={thresholdX > cx ? "start" : "end"} fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily={MONO}>{threshold}</text>
      </svg>

      {/* Center score value */}
      <div className="absolute" style={{ bottom: "8px", left: "50%", transform: "translateX(-50%)" }}>
        <div className="flex flex-col items-center">
          <span className="text-3xl md:text-5xl font-bold tabular-nums tracking-tighter" style={{ color: scoreColor, fontFamily: MONO, textShadow: `0 0 30px ${scoreGlowColor}` }}>{score}</span>
          <span className="text-[11px] text-zinc-500 -mt-1">/ 100</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Timing Widget
// =============================================================================

function TimingWidget({ run, isActive }: { run: PipelineRun | null; isActive: boolean }) {
  const items = [
    { label: "Created", value: run ? formatTimestamp(run.createdAt) : "...", done: true },
    { label: "Finished", value: run?.finishedAt ? formatTimestamp(run.finishedAt) : isActive ? "In progress" : "...", done: !!run?.finishedAt },
    { label: "Duration", value: run ? totalDuration(run.createdAt, run.finishedAt) : "...", done: !!run?.finishedAt },
  ];

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-5 font-medium">Timing</div>
      <div className="flex flex-col gap-0">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center w-3 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${item.done ? "border-emerald-500/60 bg-emerald-500/20" : isActive && i === 1 ? "border-amber-400/60 bg-amber-400/20 animate-pulse" : "border-zinc-700 bg-zinc-800"}`} />
              {i < items.length - 1 && (
                <div className={`w-px flex-1 min-h-[28px] ${item.done ? "bg-emerald-500/20" : "bg-zinc-800"}`} />
              )}
            </div>
            <div className="pb-4 -mt-0.5">
              <div className="text-[10px] text-zinc-600 mb-0.5">{item.label}</div>
              <div className="text-sm text-zinc-300 tabular-nums" style={{ fontFamily: MONO }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Config Widget
// =============================================================================

function ConfigWidget({
  run, totalIterations, totalAttempts, specInfo, specInfoLoading,
}: {
  run: PipelineRun | null; totalIterations: number; totalAttempts: number;
  specInfo: { title: string; versionNumber: number } | null; specInfoLoading: boolean;
}) {
  const rows = [
    {
      icon: <svg className="h-3.5 w-3.5 text-cyan-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>,
      label: "Branch", value: run?.worktreeBranch ?? "...", valueClass: "text-cyan-400/80",
    },
    {
      icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" /></svg>,
      label: "Iterations", value: `${totalIterations} / ${totalAttempts}`, valueClass: "text-zinc-300",
    },
    {
      icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
      label: "Specification",
      value: specInfo ? `${specInfo.title} v${specInfo.versionNumber}` : specInfoLoading ? "..." : "Unknown",
      valueClass: "text-violet-400/80",
      href: run && specInfo ? `/specifications/${run.specificationId}` : undefined,
    },
  ];

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-5 font-medium">Configuration</div>
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.04] shrink-0">{row.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-zinc-600 mb-0.5">{row.label}</div>
              {row.href ? (
                <Link href={row.href} className={`text-sm truncate block hover:brightness-125 transition-all ${row.valueClass}`} style={{ fontFamily: MONO }} title={row.value}>{row.value}</Link>
              ) : (
                <div className={`text-sm truncate tabular-nums ${row.valueClass}`} style={{ fontFamily: MONO }}>{row.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Status Widget
// =============================================================================

function StatusWidget({ status }: { status: string }) {
  const config: Record<string, { color: string; glow: string; bg: string; animBg: string; label: string }> = {
    success: { color: "text-emerald-400", glow: "shadow-[0_0_40px_rgba(16,185,129,0.15)]", bg: "bg-emerald-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.06) 0%, transparent 70%)", label: "Success" },
    failed: { color: "text-red-400", glow: "shadow-[0_0_40px_rgba(239,68,68,0.15)]", bg: "bg-red-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(239,68,68,0.06) 0%, transparent 70%)", label: "Failed" },
    cancelled: { color: "text-zinc-400", glow: "", bg: "bg-zinc-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(161,161,170,0.04) 0%, transparent 70%)", label: "Cancelled" },
    rejected: { color: "text-amber-400", glow: "shadow-[0_0_40px_rgba(251,191,36,0.12)]", bg: "bg-amber-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 70%)", label: "Rejected" },
  };
  const c = config[status] ?? { color: "text-amber-400", glow: "shadow-[0_0_40px_rgba(251,191,36,0.1)]", bg: "bg-amber-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 70%)", label: status.charAt(0).toUpperCase() + status.slice(1) };
  const isRunning = !["success", "failed", "cancelled", "rejected"].includes(status);

  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] ${c.bg} p-6 ${c.glow} relative overflow-hidden`}>
      {isRunning && <div className="absolute inset-0 animate-pulse" style={{ background: c.animBg }} />}
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-4 font-medium relative z-10">Status</div>
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="relative">
          {status === "success" ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
          ) : status === "failed" ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
          ) : status === "cancelled" ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-500/10 border border-zinc-500/20">
              <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </div>
          ) : status === "rejected" ? (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <svg className="h-7 w-7 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            </div>
          )}
        </div>
        <span className={`text-lg font-semibold tracking-tight ${c.color}`}>{c.label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Review Issues Table
// =============================================================================

function ReviewIssuesTable({ summary, issues }: { summary?: string; issues: string[] }) {
  const [expanded, setExpanded] = useState(false);

  const getSeverity = (issue: string): { label: string; color: string; bg: string } => {
    const lower = issue.toLowerCase();
    if (lower.includes("critical") || lower.includes("security") || lower.includes("crash"))
      return { label: "critical", color: "text-red-400", bg: "bg-red-500/15 border-red-500/20" };
    if (lower.includes("missing") || lower.includes("error") || lower.includes("fail") || lower.includes("wrong"))
      return { label: "major", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/20" };
    return { label: "minor", color: "text-zinc-400", bg: "bg-zinc-500/15 border-zinc-500/20" };
  };

  return (
    <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.02] overflow-hidden">
      {/* Header — clickable to toggle */}
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-white/[0.02]">
        <svg className="w-4 h-4 text-amber-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <span className="text-xs font-medium text-amber-400/80">Review Issues</span>
        <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO }}>{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
        {summary && <span className="text-[11px] text-zinc-600 truncate flex-1 text-left ml-2">{summary}</span>}
        <svg className={`w-4 h-4 text-zinc-600 shrink-0 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>

      {/* Collapsible content */}
      <div className="grid transition-[grid-template-rows] duration-200" style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          {/* Summary */}
          {summary && (
            <div className="border-t border-amber-500/[0.06] px-5 py-3">
              <p className="text-xs text-zinc-400 leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Table header */}
          <div className="grid grid-cols-[48px_1fr_90px] items-center gap-4 border-t border-white/[0.04] px-5 py-2" style={{ fontFamily: MONO }}>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">#</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">Description</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 text-right">Severity</span>
          </div>

          {/* Table rows */}
          {issues.map((issue, i) => {
            const severity = getSeverity(issue);
            const isEven = i % 2 === 0;
            return (
              <div key={i} className={`grid grid-cols-[48px_1fr_90px] items-center gap-4 px-5 py-2.5 ${isEven ? "bg-white/[0.01]" : "bg-transparent"} transition-colors hover:bg-white/[0.03]`}>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-[11px] font-medium text-amber-400 tabular-nums" style={{ fontFamily: MONO }}>{i + 1}</span>
                <span className="text-[12px] text-zinc-300 leading-relaxed">{issue}</span>
                <div className="flex justify-end">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${severity.bg} ${severity.color}`}>{severity.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Kbd Helper
// =============================================================================

function Kbd({ children, variant = "static" }: { children: React.ReactNode; variant?: "static" | "dynamic" | "amber" }) {
  const colors = {
    static: "bg-violet-500/15 border-violet-500/20 text-violet-400",
    dynamic: "bg-cyan-500/15 border-cyan-500/20 text-cyan-400",
    amber: "bg-amber-500/15 border-amber-500/20 text-amber-400",
  };
  return (
    <kbd className={`rounded border px-1 py-0.5 text-[9px] font-medium ${colors[variant]}`}>{children}</kbd>
  );
}

// =============================================================================
// Log Viewer Panel
// =============================================================================

function LogViewerPanel({
  logs,
  step,
  selectedIteration,
  isFocused,
  selectedLogIdx,
  searchQuery,
  stepTimings: timings,
}: {
  logs: PipelineLogEntry[];
  step: PipelineStep;
  selectedIteration?: number;
  isFocused: boolean;
  selectedLogIdx: number;
  searchQuery: string;
  stepTimings: StepTimings;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (l.step !== step) return false;
      if (selectedIteration != null && (step === "coding" || step === "reviewing")) return (l.iteration ?? 1) === selectedIteration;
      return true;
    });
  }, [logs, step, selectedIteration]);

  const displayLogs = useMemo(() => {
    if (!searchQuery) return filtered;
    return filtered.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [filtered, searchQuery]);

  const timingKey = getStepTimingKey(step, timings, selectedIteration);
  const timing = timings[timingKey];

  // Scroll selected line into view
  useEffect(() => {
    if (isFocused && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedLogIdx, isFocused]);

  // Auto-scroll to bottom when not focused
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useEffect(() => {
    if (isFocused) return;
    if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [displayLogs.length, isFocused]);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Collapse completed tool-start entries
  const completedTools = useMemo(() => {
    const set = new Set<string>();
    for (const e of displayLogs) { if (e.toolCallId?.endsWith("-end")) set.add(e.toolCallId.replace("-end", "")); }
    return set;
  }, [displayLogs]);

  return (
    <>
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 text-[11px] text-zinc-600" style={{ fontFamily: MONO }}>
            {step}{selectedIteration != null ? ` (iteration ${selectedIteration})` : ""}{timing ? ` — ${formatStepDuration(timing.startedAt, timing.endedAt)}` : ""}
          </span>
          {isFocused && (
            <span className="text-[9px] bg-amber-500/15 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
              LOG FOCUS
            </span>
          )}
          {searchQuery && (
            <span className="text-[9px] bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-medium">
              /{searchQuery}
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
          {displayLogs.length}{searchQuery ? `/${filtered.length}` : ""} lines
        </span>
      </div>

      {/* Log content */}
      <div ref={scrollRef} onScroll={handleScroll} style={{ fontFamily: MONO }} className="flex-1 overflow-y-auto p-4 text-[13px] leading-5">
        {displayLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            {searchQuery ? `No matches for "${searchQuery}"` : "No output for this step yet."}
          </div>
        ) : (() => {
          return displayLogs.map((entry, i) => {
            if (entry.toolCallId?.endsWith("-start") && completedTools.has(entry.toolCallId.replace("-start", ""))) return null;
            const isThinking = !!entry.toolCallId?.startsWith("thinking-");
            if (isThinking && i < displayLogs.length - 1) return null;
            const isToolStart = !isThinking && !!entry.toolCallId?.endsWith("-start");
            const isToolEnd = !isThinking && !!entry.toolCallId?.endsWith("-end");
            const isToolUse = isToolStart || isToolEnd || (entry.stream === "stdout" && /^\[(?:Read|Write|Edit|Bash|Glob|Grep|Task)\]/.test(entry.text));
            const isSelectedLine = isFocused && i === selectedLogIdx;

            return (
              <div
                key={i}
                ref={isSelectedLine ? selectedRef : undefined}
                className={`flex gap-3 transition-colors duration-100 -mx-2 px-2 rounded ${isSelectedLine ? "bg-amber-500/[0.08] border-l-2 border-l-amber-400" : "border-l-2 border-l-transparent"}`}
              >
                <span className="shrink-0 select-none text-zinc-600">{formatTime(entry.timestamp)}</span>
                {isThinking ? (
                  <span className="flex items-center gap-2 text-zinc-500 whitespace-pre-wrap">
                    <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    {entry.text}
                  </span>
                ) : isToolStart ? (
                  <span className="flex items-center gap-2 text-amber-400/80 whitespace-pre-wrap">
                    <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    {highlightSearch(entry.text, searchQuery)}
                  </span>
                ) : isToolEnd ? (
                  <span className="flex items-center gap-2 text-amber-400/80 whitespace-pre-wrap">
                    <svg className="h-3.5 w-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    {highlightSearch(entry.text, searchQuery)}
                  </span>
                ) : (
                  <span className={entry.stream === "stderr" ? "text-red-400 whitespace-pre-wrap" : isToolUse ? "text-amber-400/80 whitespace-pre-wrap" : "text-zinc-300 whitespace-pre-wrap"}>
                    {highlightSearch(entry.text, searchQuery)}
                  </span>
                )}
              </div>
            );
          });
        })()}
      </div>
    </>
  );
}

function highlightSearch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-cyan-500/30 text-cyan-300 rounded px-0.5">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// =============================================================================
// Bottom Hints Bar
// =============================================================================

function HintsBar({ mode, focusPanel, searchQuery }: { mode: NavMode; focusPanel: FocusPanel; searchQuery: string }) {
  const hints: { key: string; label: string; type: "static" | "dynamic" }[] = [];

  if (mode === "search") {
    hints.push(
      { key: "type", label: "filter logs", type: "dynamic" },
      { key: "Esc", label: "clear & exit", type: "static" },
      { key: "Enter", label: "confirm", type: "static" },
    );
  } else if (focusPanel === "steps") {
    hints.push(
      { key: "j/k", label: "navigate steps", type: "static" },
      { key: "Enter", label: "select step", type: "static" },
      { key: "Tab", label: "focus logs", type: "dynamic" },
      { key: "1-6", label: "jump to step", type: "dynamic" },
      { key: "/", label: "search logs", type: "dynamic" },
      { key: "Esc", label: "back", type: "static" },
    );
  } else {
    hints.push(
      { key: "j/k", label: "scroll logs", type: "static" },
      { key: "Tab", label: "focus steps", type: "dynamic" },
      { key: "/", label: "filter logs", type: "dynamic" },
      { key: "g", label: "top", type: "static" },
      { key: "G", label: "bottom", type: "static" },
      { key: "Esc", label: "back to steps", type: "static" },
    );
  }

  return (
    <div className="shrink-0 flex items-center gap-1 border-t border-white/[0.06] bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
      {/* Mode indicator */}
      <div className={`flex items-center gap-1.5 mr-3 px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider ${
        mode === "search"
          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
          : focusPanel === "logs"
          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          : "bg-violet-500/10 text-violet-400 border border-violet-500/20"
      }`}>
        {mode === "search" ? "SEARCH" : focusPanel === "logs" ? "LOG" : "STEP"}
      </div>

      {searchQuery && mode === "search" && (
        <span className="text-[11px] text-cyan-400 mr-3" style={{ fontFamily: MONO }}>/{searchQuery}</span>
      )}

      {hints.map((hint, i) => (
        <div key={i} className="flex items-center gap-1 mr-3">
          <kbd className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
            hint.type === "static"
              ? "bg-violet-500/15 border border-violet-500/20 text-violet-400"
              : "bg-cyan-500/15 border border-cyan-500/20 text-cyan-400"
          }`}>
            {hint.key}
          </kbd>
          <span className="text-[10px] text-zinc-600">{hint.label}</span>
        </div>
      ))}

      {/* Right-aligned action hints */}
      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1"><Kbd variant="amber">c</Kbd> <span className="text-[10px] text-zinc-600">cancel</span></span>
        <span className="flex items-center gap-1"><Kbd variant="amber">f</Kbd> <span className="text-[10px] text-zinc-600">force merge</span></span>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function extractReviewDetails(logs: PipelineLogEntry[], iteration: number): { summary?: string; issues?: string[]; score?: number } {
  let summary: string | undefined;
  let issues: string[] | undefined;
  let score: number | undefined;
  const reviewLogs = logs.filter((l) => l.step === "reviewing" && l.stream === "stdout" && (l.iteration ?? 1) === iteration);
  for (const log of reviewLogs) {
    if (log.text.startsWith("Summary: ")) summary = log.text.replace("Summary: ", "");
    if (log.text.startsWith("Issues:")) {
      issues = log.text.replace("Issues:\n", "").split("\n").map((l) => l.replace(/^\s+-\s*/, "").trim()).filter(Boolean);
    }
    const scoreMatch = log.text.match(/^Review score:\s*(\d+)\/100$/);
    if (scoreMatch) score = parseInt(scoreMatch[1], 10);
  }
  return { summary, issues, score };
}

function getMaxIteration(logs: PipelineLogEntry[]): number {
  let max = 1;
  for (const log of logs) { if (log.iteration && log.iteration > max) max = log.iteration; }
  return max;
}

function _getTabTiming(step: PipelineStep, stepTimings: StepTimings, selectedIteration?: number): { startedAt: number; endedAt: number | null } | undefined {
  const key = getStepTimingKey(step, stepTimings, selectedIteration);
  return stepTimings[key];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function totalDuration(startIso: string, endIso: string | null | undefined): string {
  if (!endIso) return "...";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const secs = Math.round(ms / 1000);
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins === 0) return `${rem}s`;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

// =============================================================================
// Shell
// =============================================================================

export default function PipelinePageShell({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const router = useRouter();
  const [sseVersion, setSseVersion] = useState(0);
  const { logs, status, currentStep, reviewScore, stepTimings, iteration, maxRetries } = usePipelineLogs({ runId, version: sseVersion });
  const [activeTab, setActiveTab] = useState<PipelineStep>("worktree");
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [, setTick] = useState(0);
  const [specInfo, setSpecInfo] = useState<{ title: string; versionNumber: number } | null>(null);
  const [specInfoLoading, setSpecInfoLoading] = useState(false);
  const [codingIteration, setCodingIteration] = useState<number | null>(null);
  const [reviewingIteration, setReviewingIteration] = useState<number | null>(null);
  const [gaugeAnimated, setGaugeAnimated] = useState(false);
  const [forceMergeConfirm, setForceMergeConfirm] = useState(false);

  // Two-panel navigation state
  const [focusPanel, setFocusPanel] = useState<FocusPanel>("steps");
  const [navMode, setNavMode] = useState<NavMode>("step");
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);
  const [selectedLogIdx, setSelectedLogIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const totalIterations = Math.max(iteration, getMaxIteration(logs), run?.iterations ?? 1);
  const totalAttempts = (maxRetries > 0 ? maxRetries : (run?.maxRetries ?? 0)) + 1;

  useEffect(() => { const t = setTimeout(() => setGaugeAnimated(true), 300); return () => clearTimeout(t); }, []);
  useEffect(() => { setCodingIteration(null); setReviewingIteration(null); }, [totalIterations]);

  useEffect(() => {
    if (!run) { setSpecInfo(null); setSpecInfoLoading(false); return; }
    let ignore = false;
    setSpecInfoLoading(true);
    const sb = getSupabase();
    Promise.all([
      sb.from("specifications").select("title").eq("id", run.specificationId).single(),
      sb.from("specification_versions").select("version_number").eq("id", run.specVersionId).single(),
    ]).then(([specRes, versionRes]) => {
      if (ignore) return;
      if (specRes.data && versionRes.data) setSpecInfo({ title: specRes.data.title as string, versionNumber: versionRes.data.version_number as number });
    }).catch(() => {}).finally(() => { if (!ignore) setSpecInfoLoading(false); });
    return () => { ignore = true; };
  }, [run?.specificationId, run?.specVersionId]);

  useEffect(() => {
    fetch(`/api/pipelines/${runId}`).then((res) => res.json()).then((data) => {
      if (data && !data.error) setRun({ id: data.id, projectId: data.project_id, specificationId: data.specification_id, specVersionId: data.spec_version_id, status: data.status, currentStep: data.current_step, worktreeBranch: data.worktree_branch, worktreePath: data.worktree_path, reviewScore: data.review_score, reviewThreshold: data.review_threshold, errorMessage: data.error_message, createdAt: data.created_at, finishedAt: data.finished_at, iterations: data.iterations ?? 1, maxRetries: data.max_retries ?? 0, hasKnowledge: data.has_knowledge ?? false });
    }).catch(() => {});
  }, [runId]);

  const hasKnowledge = run?.hasKnowledge ?? false;
  const STEPS = hasKnowledge ? ALL_STEPS : BASE_STEPS;

  useEffect(() => { if (currentStep && (STEPS as string[]).includes(currentStep)) setActiveTab(currentStep); }, [currentStep, STEPS]);
  useEffect(() => { if (status !== "failed" && status !== "rejected") setRetrying(false); }, [status]);

  useEffect(() => {
    if (sseVersion === 0) return;
    if (!["success", "failed", "rejected"].includes(status)) return;
    fetch(`/api/pipelines/${runId}`).then((res) => res.json()).then((data) => {
      if (data && !data.error) setRun({ id: data.id, projectId: data.project_id, specificationId: data.specification_id, specVersionId: data.spec_version_id, status: data.status, currentStep: data.current_step, worktreeBranch: data.worktree_branch, worktreePath: data.worktree_path, reviewScore: data.review_score, reviewThreshold: data.review_threshold, errorMessage: data.error_message, createdAt: data.created_at, finishedAt: data.finished_at, iterations: data.iterations ?? 1, maxRetries: data.max_retries ?? 0, hasKnowledge: data.has_knowledge ?? false });
    }).catch(() => {});
  }, [sseVersion, status, runId]);

  useEffect(() => {
    const hasActive = Object.values(stepTimings).some((t) => t.endedAt == null);
    if (!hasActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [stepTimings]);

  const isActive = ["pending", "worktree", "retrieving", "coding", "reviewing", "merging", "updating"].includes(status);
  const displayStatus = status;
  const displayStep = currentStep;
  const threshold = run?.reviewThreshold ?? 80;

  const handleCancel = async () => { setCancelling(true); await fetch(`/api/pipelines/${runId}`, { method: "DELETE" }); };
  const canRetryMerge = (status === "failed" && run?.currentStep === "merging") || status === "rejected";
  const handleRetryMerge = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/pipelines/${runId}/retry-merge`, { method: "POST" });
      if (!res.ok) { const err = await res.json(); alert(err.error ?? "Failed to retry merge"); setRetrying(false); return; }
      setSseVersion((v) => v + 1);
    } catch { setRetrying(false); }
  };

  // Synced iteration setters
  const setSyncedIteration = (iter: number) => {
    setCodingIteration(iter);
    setReviewingIteration(iter);
  };

  const selectedIter = codingIteration ?? reviewingIteration ?? null;
  const effectiveReviewIter = selectedIter ?? totalIterations;

  const getSelectedIteration = useCallback((step: PipelineStep): number | undefined => {
    if (totalIterations <= 1) return undefined;
    if (step === "coding" || step === "reviewing") return selectedIter ?? totalIterations;
    return undefined;
  }, [totalIterations, selectedIter]);

  const { summary: reviewSummary, issues: reviewIssues, score: iterationScore } = extractReviewDetails(logs, effectiveReviewIter);

  const isViewingLatest = effectiveReviewIter === totalIterations;
  const latestScore = reviewScore ?? run?.reviewScore ?? null;
  const displayScore = isViewingLatest ? latestScore : (iterationScore ?? null);

  const getStepState = useCallback((step: string): "complete" | "active" | "failed" | "pending" => {
    const stepIdx = STEPS.indexOf(step as PipelineStep);
    const currentIdx = displayStep ? STEPS.indexOf(displayStep) : -1;
    const stepSelectedIter = getSelectedIteration(step as PipelineStep);
    const isNonFinalIteration = (step === "coding" || step === "reviewing") && totalIterations > 1 && stepSelectedIter != null && stepSelectedIter < totalIterations;
    if (displayStatus === "success") return "complete";
    if (displayStatus === "failed" || displayStatus === "cancelled" || displayStatus === "rejected") {
      if (isNonFinalIteration) return "complete";
      if (stepIdx < currentIdx) return "complete";
      if (stepIdx === currentIdx) return "failed";
      return "pending";
    }
    if (stepIdx < currentIdx) return "complete";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }, [STEPS, displayStep, displayStatus, totalIterations, getSelectedIteration]);

  const statusBadge = (() => {
    switch (displayStatus) {
      case "success": return { bg: "bg-emerald-500/10 ring-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" };
      case "failed": return { bg: "bg-red-500/10 ring-red-500/20", text: "text-red-400", dot: "bg-red-400" };
      case "cancelled": return { bg: "bg-zinc-500/10 ring-zinc-500/20", text: "text-zinc-400", dot: "bg-zinc-400" };
      case "rejected": return { bg: "bg-amber-500/10 ring-amber-500/20", text: "text-amber-400", dot: "bg-amber-400" };
      default: return { bg: "bg-amber-500/10 ring-amber-500/20", text: "text-amber-400", dot: "bg-amber-400 animate-pulse" };
    }
  })();

  // Log counts per step
  const logCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const step of STEPS) { counts[step] = logs.filter((l) => l.step === step).length; }
    return counts;
  }, [logs, STEPS]);

  // Filtered logs for active step (for counting during keyboard nav)
  const activeStepDisplayLogs = useMemo(() => {
    let filtered = logs.filter((l) => l.step === activeTab);
    const selIter = getSelectedIteration(activeTab);
    if (selIter != null && (activeTab === "coding" || activeTab === "reviewing")) {
      filtered = filtered.filter((l) => (l.iteration ?? 1) === selIter);
    }
    if (searchQuery) {
      filtered = filtered.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return filtered;
  }, [logs, activeTab, searchQuery, getSelectedIteration]);

  // Sync selectedStepIdx to activeTab when currentStep changes from SSE
  useEffect(() => {
    const idx = STEPS.indexOf(activeTab);
    if (idx >= 0) setSelectedStepIdx(idx);
  }, [activeTab, STEPS]);

  // ==========================================================================
  // Keyboard handler
  // ==========================================================================

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Force merge confirmation dialog takes priority
      if (forceMergeConfirm) {
        if (e.key === "Enter") { e.preventDefault(); handleRetryMerge(); setForceMergeConfirm(false); return; }
        if (e.key === "Escape") { e.preventDefault(); setForceMergeConfirm(false); return; }
        return;
      }

      // Don't interfere with overlays
      if (document.querySelector("[data-overlay-open]")) return;

      // Search mode
      if (navMode === "search") {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchQuery("");
          setSearchInput("");
          setNavMode(focusPanel === "logs" ? "log" : "step");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setNavMode(focusPanel === "logs" ? "log" : "step");
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          setSearchInput((prev) => {
            const next = prev.slice(0, -1);
            setSearchQuery(next);
            return next;
          });
          return;
        }
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setSearchInput((prev) => {
            const next = prev + e.key;
            setSearchQuery(next);
            return next;
          });
          return;
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Slash to enter search mode
      if (e.key === "/") {
        e.preventDefault();
        setNavMode("search");
        setSearchInput(searchQuery);
        return;
      }

      // Tab to switch panels
      if (e.key === "Tab") {
        e.preventDefault();
        if (focusPanel === "steps") {
          setFocusPanel("logs");
          setNavMode("log");
          setSelectedLogIdx(0);
        } else {
          setFocusPanel("steps");
          setNavMode("step");
        }
        return;
      }

      // Number keys for step jump
      const num = parseInt(e.key);
      if (num >= 1 && num <= STEPS.length) {
        e.preventDefault();
        const step = STEPS[num - 1];
        setSelectedStepIdx(num - 1);
        setActiveTab(step);
        setSelectedLogIdx(0);
        return;
      }

      // Action shortcuts
      if (e.key === "f" && canRetryMerge && !retrying) {
        e.preventDefault();
        setForceMergeConfirm(true);
        return;
      }
      if (e.key === "c" && isActive && !cancelling) {
        e.preventDefault();
        handleCancel();
        return;
      }

      // Steps panel navigation
      if (focusPanel === "steps") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedStepIdx((prev) => Math.min(prev + 1, STEPS.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedStepIdx((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "l" || e.key === "ArrowRight") {
          e.preventDefault();
          setActiveTab(STEPS[selectedStepIdx]);
          setSelectedLogIdx(0);
          setFocusPanel("logs");
          setNavMode("log");
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          router.back();
          return;
        }
        return;
      }

      // Log panel navigation
      if (focusPanel === "logs") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedLogIdx((prev) => Math.min(prev + 1, activeStepDisplayLogs.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedLogIdx((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "g") {
          e.preventDefault();
          setSelectedLogIdx(0);
          return;
        }
        if (e.key === "G") {
          e.preventDefault();
          setSelectedLogIdx(Math.max(0, activeStepDisplayLogs.length - 1));
          return;
        }
        if (e.key === "Escape" || e.key === "h" || e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusPanel("steps");
          setNavMode("step");
          return;
        }
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [navMode, focusPanel, selectedStepIdx, STEPS, searchQuery, activeStepDisplayLogs.length, forceMergeConfirm, canRetryMerge, retrying, isActive, cancelling, router]);

  // Sync activeTab from selectedStepIdx when navigating with j/k
  useEffect(() => {
    if (focusPanel === "steps" && STEPS[selectedStepIdx] && STEPS[selectedStepIdx] !== activeTab) {
      setActiveTab(STEPS[selectedStepIdx]);
      setSelectedLogIdx(0);
    }
  }, [selectedStepIdx, focusPanel]);

  // Step state colors
  const stateColors: Record<string, { text: string; dot: string }> = {
    complete: { text: "text-emerald-400", dot: "bg-emerald-400" },
    active: { text: "text-amber-400", dot: "bg-amber-400 animate-pulse" },
    failed: { text: "text-red-400", dot: "bg-red-400" },
    pending: { text: "text-zinc-600", dot: "bg-zinc-600" },
  };

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in-up { opacity: 0; animation: fadeInUp 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .glass-card-strong {
          background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 50%, rgba(255,255,255,0.04) 100%);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow:
            inset 0 1px 0 0 rgba(255,255,255,0.08),
            inset 0 0 30px rgba(255,255,255,0.02),
            0 12px 48px rgba(0,0,0,0.4),
            0 4px 12px rgba(0,0,0,0.25);
        }
        .gradient-border-glow { position: relative; }
        .gradient-border-glow::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1), rgba(16,185,129,0.15));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      <div className="flex h-full flex-col text-zinc-100">
        {/* Header */}
        <header className="sticky top-0 z-20 flex flex-wrap gap-3 items-center justify-between border-b border-white/[0.06] bg-zinc-950 px-4 md:px-8 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/pipelines")} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
              <span className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded" style={{ fontFamily: MONO }}>{runId.slice(0, 8)}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusBadge.bg} ${statusBadge.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                {displayStatus}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {run && specInfo && (
              <Link href={`/specifications/${run.specificationId}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-zinc-300">
                <span>{specInfo.title} v{specInfo.versionNumber}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" /></svg>
              </Link>
            )}
            {canRetryMerge && (
              <button onClick={() => setForceMergeConfirm(true)} disabled={retrying} className="flex items-center gap-2 rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed">
                {retrying ? "Merging..." : displayStatus === "rejected" ? "Force Merge" : "Retry Merge"}
                {!retrying && <Kbd variant="amber">f</Kbd>}
              </button>
            )}
            {isActive && !cancelling && (
              <button onClick={handleCancel} className="flex items-center gap-2 rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50">
                Cancel
                <kbd className="rounded bg-red-500/15 border border-red-500/20 px-1 py-0.5 text-[9px] font-medium text-red-400">c</kbd>
              </button>
            )}
            {cancelling && <span className="text-sm text-zinc-500">Cancelling...</span>}
          </div>
        </header>

        {/* Dashboard Widgets (v4 cards) */}
        <div className="flex flex-col gap-4 px-4 md:px-8 py-6 shrink-0 fade-in-up" style={{ animationDelay: "80ms" }}>
          <div className={`grid gap-4 ${displayScore != null ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}`}>
            {/* Score Widget — glass card with semi-circle gauge */}
            {displayScore != null && (
              <div className="glass-card-strong gradient-border-glow rounded-2xl overflow-hidden flex flex-col items-center justify-center p-4">
                <div className="relative flex justify-center">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-[160px] rounded-full opacity-20 blur-[60px]" style={{ background: displayScore >= threshold ? "radial-gradient(ellipse, #10b981 0%, transparent 70%)" : "radial-gradient(ellipse, #ef4444 0%, transparent 70%)" }} />
                  <SemiCircleGauge score={displayScore} threshold={threshold} animated={gaugeAnimated} />
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide mt-1 ${displayScore >= threshold ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"}`}>
                  {displayScore >= threshold ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                  {displayScore >= threshold ? "PASSED" : "FAILED"}
                  <span className="text-zinc-600 font-normal ml-1" style={{ fontFamily: MONO }}>{totalIterations > 1 ? `iter ${effectiveReviewIter}` : `thr ${threshold}`}</span>
                </span>
              </div>
            )}

            <TimingWidget run={run} isActive={isActive} />
            <ConfigWidget run={run} totalIterations={totalIterations} totalAttempts={totalAttempts} specInfo={specInfo} specInfoLoading={specInfoLoading} />
            <StatusWidget status={displayStatus} />
          </div>
        </div>

        {/* Error Message */}
        {run?.errorMessage && (displayStatus === "failed" || displayStatus === "rejected") && (
          <div className="mx-4 md:mx-8 mb-4 rounded-xl border border-red-800/50 bg-red-950/30 px-5 py-3 shrink-0">
            <p className="text-sm text-red-400">{run.errorMessage}</p>
          </div>
        )}

        {/* Two-Panel Split — Steps (left) + Log Viewer (right) */}
        <div className="flex flex-1 overflow-hidden px-4 md:px-8 pb-0 gap-4 fade-in-up" style={{ animationDelay: "200ms" }}>
          {/* Left Panel: Step List */}
          <div className={`w-72 shrink-0 flex flex-col rounded-xl border transition-colors duration-150 ${focusPanel === "steps" ? "border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.08)]" : "border-white/[0.06]"} bg-white/[0.02] overflow-hidden`}>
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Steps</span>
                {focusPanel === "steps" && (
                  <span className="text-[9px] bg-violet-500/15 border border-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded font-medium">
                    FOCUSED
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
                {STEPS.length} steps
              </span>
            </div>

            {/* Step list */}
            <div className="flex flex-col flex-1 overflow-y-auto min-h-0">
              {STEPS.map((step, idx) => {
                const state = getStepState(step);
                const colors = stateColors[state];
                const isSelected = idx === selectedStepIdx && focusPanel === "steps";
                const isActiveStep = step === activeTab;
                const timingKey = getStepTimingKey(step, stepTimings, getSelectedIteration(step));
                const timing = stepTimings[timingKey];
                const count = logCounts[step] ?? 0;

                return (
                  <button
                    key={step}
                    onClick={() => {
                      setSelectedStepIdx(idx);
                      setActiveTab(step);
                      setSelectedLogIdx(0);
                      setFocusPanel("steps");
                      setNavMode("step");
                    }}
                    className={`
                      flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150
                      border-l-2
                      ${isSelected ? "border-l-violet-400 bg-violet-500/[0.06]" : isActiveStep && focusPanel === "logs" ? "border-l-amber-400/40 bg-amber-500/[0.04]" : "border-l-transparent hover:bg-white/[0.02]"}
                    `}
                  >
                    {/* Selection dot indicator */}
                    <div className="w-3 flex justify-center shrink-0">
                      {isSelected ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      ) : (
                        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      )}
                    </div>

                    {/* Step icon */}
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${isSelected ? "bg-violet-500/10 border border-violet-500/20" : "bg-white/[0.03] border border-white/[0.04]"}`}>
                      <svg className={`h-3.5 w-3.5 ${isSelected ? "text-violet-400" : colors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={STEP_ICONS[step]} />
                      </svg>
                    </div>

                    {/* Step info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isSelected ? "text-violet-300" : state === "pending" ? "text-zinc-600" : "text-zinc-200"}`}>
                          {STEP_LABELS[step]}
                        </span>
                        <kbd className={`rounded px-1 py-0.5 text-[9px] font-medium ${isSelected ? "bg-violet-500/15 border border-violet-500/20 text-violet-400" : "bg-white/[0.04] border border-white/[0.06] text-zinc-600"}`}>
                          {idx + 1}
                        </kbd>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {timing ? (
                          <span className={`text-[10px] tabular-nums ${isSelected ? "text-violet-400/60" : "text-zinc-600"}`} style={{ fontFamily: MONO }}>
                            {formatStepDuration(timing.startedAt, timing.endedAt)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-700">--:--</span>
                        )}
                        <span className={`text-[10px] tabular-nums ${isSelected ? "text-violet-400/40" : "text-zinc-700"}`} style={{ fontFamily: MONO }}>
                          {count} lines
                        </span>
                      </div>
                    </div>

                    {/* State icon */}
                    <span className="shrink-0">
                      {state === "complete" && (
                        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      )}
                      {state === "active" && (
                        <svg className="h-4 w-4 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      )}
                      {state === "failed" && (
                        <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      )}
                    </span>
                  </button>
                );
              })}

              {/* Iteration selector (when multiple iterations) */}
              {totalIterations > 1 && (activeTab === "coding" || activeTab === "reviewing") && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-2">Iteration</div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: totalIterations }, (_, i) => i + 1).map((iter) => (
                      <button
                        key={iter}
                        onClick={() => setSyncedIteration(iter)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          (selectedIter ?? totalIterations) === iter
                            ? "bg-violet-500/15 border border-violet-500/20 text-violet-400"
                            : "bg-white/[0.03] border border-white/[0.06] text-zinc-600 hover:text-zinc-400"
                        }`}
                      >
                        {iter}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Log Viewer */}
          <div className={`flex-1 flex flex-col min-w-0 rounded-xl border transition-colors duration-150 ${focusPanel === "logs" ? "border-amber-500/30 shadow-[0_0_20px_rgba(251,191,36,0.06)]" : "border-white/[0.06]"} bg-white/[0.02] overflow-hidden`}>
            {/* Review Issues (inline when on reviewing step) */}
            {activeTab === "reviewing" && reviewIssues && reviewIssues.length > 0 && (
              <div className="shrink-0 border-b border-white/[0.06] px-4 py-0">
                <ReviewIssuesTable summary={reviewSummary} issues={reviewIssues} />
              </div>
            )}

            <LogViewerPanel
              logs={logs}
              step={activeTab}
              selectedIteration={getSelectedIteration(activeTab)}
              isFocused={focusPanel === "logs" && navMode === "log"}
              selectedLogIdx={selectedLogIdx}
              searchQuery={searchQuery}
              stepTimings={stepTimings}
            />
          </div>
        </div>

        {/* Bottom Hints Bar */}
        <HintsBar mode={navMode} focusPanel={focusPanel} searchQuery={searchQuery} />
      </div>

      {/* Force merge confirmation dialog */}
      {forceMergeConfirm && (
        <>
          <div data-overlay-open className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setForceMergeConfirm(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px]">
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">{displayStatus === "rejected" ? "Force Merge" : "Retry Merge"}</h2>
              <p className="text-[13px] text-zinc-500 mb-1">
                {displayStatus === "rejected"
                  ? "This will merge the branch despite the review score being below threshold."
                  : "This will retry the merge step for this pipeline run."}
              </p>
              {run?.reviewScore != null && (
                <p className="text-[12px] text-zinc-600 mb-5">
                  Score: <span className="text-amber-400 font-mono">{run.reviewScore}</span> / threshold: <span className="text-zinc-400 font-mono">{run.reviewThreshold}</span>
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { handleRetryMerge(); setForceMergeConfirm(false); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/20 text-sm font-medium hover:bg-amber-500/30 transition-colors"
                >
                  <Kbd variant="amber">Enter</Kbd>
                  {displayStatus === "rejected" ? "Force Merge" : "Retry"}
                </button>
                <button
                  onClick={() => setForceMergeConfirm(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <Kbd>Esc</Kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
