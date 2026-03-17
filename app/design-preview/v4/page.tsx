"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { PipelineRun, PipelineStep, PipelineLogEntry, StepTimings } from "../../pipelines";

// =============================================================================
// Constants & Types
// =============================================================================

const ALL_STEPS: PipelineStep[] = ["worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
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
// Mock Data
// =============================================================================

function createMockData() {
  const now = Date.now();
  const created = new Date(now - 342000).toISOString();
  const finished = new Date(now - 12000).toISOString();

  const run: PipelineRun = {
    id: "v4-demo-run-abcd1234",
    projectId: "proj-1",
    specificationId: "spec-1",
    specVersionId: "specv-1",
    status: "success",
    currentStep: null,
    worktreeBranch: "pipeline/spec-v3-abc123",
    worktreePath: "/tmp/worktree",
    reviewScore: 87,
    reviewThreshold: 80,
    errorMessage: null,
    createdAt: created,
    finishedAt: finished,
    iterations: 2,
    maxRetries: 2,
    hasKnowledge: true,
  };

  const stepTimings: StepTimings = {
    worktree: { startedAt: now - 340000, endedAt: now - 335000 },
    retrieving: { startedAt: now - 335000, endedAt: now - 328000 },
    "coding-1": { startedAt: now - 328000, endedAt: now - 210000 },
    "coding-2": { startedAt: now - 150000, endedAt: now - 85000 },
    "reviewing-1": { startedAt: now - 210000, endedAt: now - 155000 },
    "reviewing-2": { startedAt: now - 85000, endedAt: now - 42000 },
    merging: { startedAt: now - 42000, endedAt: now - 18000 },
    updating: { startedAt: now - 18000, endedAt: now - 12000 },
  };

  const logEntries: PipelineLogEntry[] = [
    { timestamp: now - 340000, step: "worktree", stream: "stdout", text: "Creating worktree for branch pipeline/spec-v3-abc123..." },
    { timestamp: now - 338000, step: "worktree", stream: "stdout", text: "Worktree created at /tmp/worktree" },
    { timestamp: now - 336000, step: "worktree", stream: "stdout", text: "Branch checked out successfully" },
    { timestamp: now - 335000, step: "retrieving", stream: "stdout", text: "Fetching knowledge base documents..." },
    { timestamp: now - 333000, step: "retrieving", stream: "stdout", text: "Retrieved 12 relevant documents (3.2KB)" },
    { timestamp: now - 330000, step: "retrieving", stream: "stdout", text: "Embedding vectors computed and indexed" },
    { timestamp: now - 328000, step: "coding", stream: "stdout", text: "[Read] app/components/PipelineSteps.tsx", iteration: 1 },
    { timestamp: now - 320000, step: "coding", stream: "stdout", text: "Analyzing component structure...", iteration: 1 },
    { timestamp: now - 310000, step: "coding", stream: "stdout", text: "[Edit] app/components/PipelineSteps.tsx — adding keyboard navigation hook", iteration: 1 },
    { timestamp: now - 300000, step: "coding", stream: "stdout", text: "[Write] app/hooks/useVimNav.ts — new vim navigation utility", iteration: 1 },
    { timestamp: now - 280000, step: "coding", stream: "stdout", text: "[Edit] app/pipelines/[runId]/page.tsx — integrating nav hook", iteration: 1 },
    { timestamp: now - 260000, step: "coding", stream: "stdout", text: "Running type check...", iteration: 1 },
    { timestamp: now - 250000, step: "coding", stream: "stderr", text: "Type error: Property 'onSelect' does not exist on type 'StepDesignProps'", iteration: 1 },
    { timestamp: now - 240000, step: "coding", stream: "stdout", text: "[Edit] app/pipelines/[runId]/step-designs.tsx — fixing type definition", iteration: 1 },
    { timestamp: now - 220000, step: "coding", stream: "stdout", text: "Type check passed. All changes complete.", iteration: 1 },
    { timestamp: now - 210000, step: "reviewing", stream: "stdout", text: "Starting code review (iteration 1)...", iteration: 1 },
    { timestamp: now - 200000, step: "reviewing", stream: "stdout", text: "Analyzing diff: 4 files changed, +127 -23", iteration: 1 },
    { timestamp: now - 190000, step: "reviewing", stream: "stdout", text: "Summary: Keyboard navigation added but missing error boundary for edge cases", iteration: 1 },
    { timestamp: now - 180000, step: "reviewing", stream: "stdout", text: "Issues:\n- Missing null check when step list is empty\n- useVimNav hook doesn't clean up event listeners on unmount", iteration: 1 },
    { timestamp: now - 170000, step: "reviewing", stream: "stdout", text: "Review score: 62/100", iteration: 1 },
    { timestamp: now - 150000, step: "coding", stream: "stdout", text: "[Read] app/hooks/useVimNav.ts", iteration: 2 },
    { timestamp: now - 145000, step: "coding", stream: "stdout", text: "Addressing review feedback...", iteration: 2 },
    { timestamp: now - 130000, step: "coding", stream: "stdout", text: "[Edit] app/hooks/useVimNav.ts — adding cleanup and null guards", iteration: 2 },
    { timestamp: now - 110000, step: "coding", stream: "stdout", text: "[Edit] app/components/PipelineSteps.tsx — adding empty state handling", iteration: 2 },
    { timestamp: now - 95000, step: "coding", stream: "stdout", text: "Type check passed. All issues resolved.", iteration: 2 },
    { timestamp: now - 85000, step: "reviewing", stream: "stdout", text: "Starting code review (iteration 2)...", iteration: 2 },
    { timestamp: now - 75000, step: "reviewing", stream: "stdout", text: "Analyzing diff: 2 files changed, +34 -8", iteration: 2 },
    { timestamp: now - 65000, step: "reviewing", stream: "stdout", text: "Summary: All previous issues resolved. Clean implementation with proper cleanup.", iteration: 2 },
    { timestamp: now - 55000, step: "reviewing", stream: "stdout", text: "Review score: 87/100", iteration: 2 },
    { timestamp: now - 42000, step: "merging", stream: "stdout", text: "Merging branch pipeline/spec-v3-abc123 into main..." },
    { timestamp: now - 35000, step: "merging", stream: "stdout", text: "No conflicts detected" },
    { timestamp: now - 28000, step: "merging", stream: "stdout", text: "Merge commit created: abc1234" },
    { timestamp: now - 18000, step: "updating", stream: "stdout", text: "Updating knowledge base with new code context..." },
    { timestamp: now - 15000, step: "updating", stream: "stdout", text: "Indexed 4 modified files" },
    { timestamp: now - 12000, step: "updating", stream: "stdout", text: "Knowledge base updated successfully" },
  ];

  return { run, stepTimings, logEntries };
}

// =============================================================================
// Helpers
// =============================================================================

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

function formatStepDuration(startedAt: number, endedAt: number | null): string {
  const elapsed = (endedAt ?? Date.now()) - startedAt;
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getStepTimingKey(step: PipelineStep, stepTimings: StepTimings, selectedIteration?: number): string {
  if (step === "coding" || step === "reviewing") {
    if (selectedIteration) {
      const key = `${step}-${selectedIteration}`;
      if (stepTimings[key]) return key;
    }
    const keys = Object.keys(stepTimings).filter((k) => k.startsWith(`${step}-`));
    if (keys.length > 0) return keys.sort().pop()!;
    return step;
  }
  return step;
}

// =============================================================================
// Semi-Circle Score Gauge
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
          <filter id="score-glow-v4" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="score-glow-soft-v4" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="gauge-track-grad-v4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.07)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="url(#gauge-track-grad-v4)" strokeWidth={strokeW} strokeLinecap="round" />
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
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreGlowSoft} strokeWidth={strokeW + 20} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreGlowColor} strokeWidth={strokeW + 8} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} filter="url(#score-glow-soft-v4)" style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreColor} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} filter="url(#score-glow-v4)" style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />
        <circle cx={thresholdX} cy={thresholdY} r="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <text x={thresholdX + (thresholdX > cx ? 12 : -12)} y={thresholdY + 4} textAnchor={thresholdX > cx ? "start" : "end"} fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily={MONO}>{threshold}</text>
      </svg>
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
// Info Widgets (unchanged from original)
// =============================================================================

function TimingWidget({ run, isActive }: { run: PipelineRun; isActive: boolean }) {
  const items = [
    { label: "Created", value: formatTimestamp(run.createdAt), done: true },
    { label: "Finished", value: run.finishedAt ? formatTimestamp(run.finishedAt) : isActive ? "In progress" : "...", done: !!run.finishedAt },
    { label: "Duration", value: totalDuration(run.createdAt, run.finishedAt), done: !!run.finishedAt },
  ];

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-5 font-medium">Timing</div>
      <div className="flex flex-col gap-0">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center w-3 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${item.done ? "border-emerald-500/60 bg-emerald-500/20" : isActive && i === 1 ? "border-amber-400/60 bg-amber-400/20 animate-pulse" : "border-zinc-700 bg-zinc-800"}`} />
              {i < items.length - 1 && <div className={`w-px flex-1 min-h-[28px] ${item.done ? "bg-emerald-500/20" : "bg-zinc-800"}`} />}
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

function ConfigWidget({ run }: { run: PipelineRun }) {
  const rows = [
    {
      icon: <svg className="h-3.5 w-3.5 text-cyan-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>,
      label: "Branch", value: run.worktreeBranch ?? "...", valueClass: "text-cyan-400/80",
    },
    {
      icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" /></svg>,
      label: "Iterations", value: `${run.iterations} / ${run.maxRetries + 1}`, valueClass: "text-zinc-300",
    },
    {
      icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
      label: "Specification", value: "UI Refactor v3", valueClass: "text-violet-400/80",
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
              <div className={`text-sm truncate tabular-nums ${row.valueClass}`} style={{ fontFamily: MONO }}>{row.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
// Step List Panel (Left Panel)
// =============================================================================

function StepListPanel({
  steps,
  activeStep,
  selectedStepIdx,
  isFocused,
  stepTimings,
  getStepState,
  onSelectStep,
  logCounts,
}: {
  steps: PipelineStep[];
  activeStep: PipelineStep;
  selectedStepIdx: number;
  isFocused: boolean;
  stepTimings: StepTimings;
  getStepState: (step: PipelineStep) => "complete" | "active" | "failed" | "pending";
  onSelectStep: (step: PipelineStep) => void;
  logCounts: Record<string, number>;
}) {
  const stateColors: Record<string, { text: string; dot: string; border: string; bg: string }> = {
    complete: { text: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/5" },
    active: { text: "text-amber-400", dot: "bg-amber-400 animate-pulse", border: "border-amber-500/40", bg: "bg-amber-500/5" },
    failed: { text: "text-red-400", dot: "bg-red-400", border: "border-red-500/40", bg: "bg-red-500/5" },
    pending: { text: "text-zinc-600", dot: "bg-zinc-600", border: "border-zinc-700", bg: "bg-transparent" },
  };

  return (
    <div className={`flex flex-col rounded-xl border transition-colors duration-150 ${isFocused ? "border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.08)]" : "border-white/[0.06]"} bg-white/[0.02] overflow-hidden`}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Steps</span>
          {isFocused && (
            <span className="text-[9px] bg-violet-500/15 border border-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded font-medium">
              FOCUSED
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
          {steps.length} steps
        </span>
      </div>

      {/* Step list */}
      <div className="flex flex-col">
        {steps.map((step, idx) => {
          const state = getStepState(step);
          const colors = stateColors[state];
          const isSelected = idx === selectedStepIdx && isFocused;
          const isActive = step === activeStep;
          const timingKey = getStepTimingKey(step, stepTimings);
          const timing = stepTimings[timingKey];
          const count = logCounts[step] ?? 0;

          return (
            <button
              key={step}
              onClick={() => onSelectStep(step)}
              className={`
                flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150
                border-l-2
                ${isSelected ? "border-l-violet-400 bg-violet-500/[0.06]" : isActive ? `border-l-transparent ${colors.bg}` : "border-l-transparent hover:bg-white/[0.02]"}
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
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${isSelected ? "bg-violet-500/10 border border-violet-500/20" : `bg-white/[0.03] border border-white/[0.04]`}`}>
                <svg className={`h-3.5 w-3.5 ${isSelected ? "text-violet-400" : colors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={STEP_ICONS[step]} />
                </svg>
              </div>

              {/* Step info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isSelected ? "text-violet-300" : colors.text}`}>
                    {STEP_LABELS[step]}
                  </span>
                  {/* Number key hint */}
                  <kbd className={`rounded px-1 py-0.5 text-[9px] font-medium ${isSelected ? "bg-violet-500/15 border border-violet-500/20 text-violet-400" : "bg-white/[0.04] border border-white/[0.06] text-zinc-600"}`}>
                    {idx + 1}
                  </kbd>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {timing && (
                    <span className={`text-[10px] tabular-nums ${isSelected ? "text-violet-400/60" : "text-zinc-600"}`} style={{ fontFamily: MONO }}>
                      {formatStepDuration(timing.startedAt, timing.endedAt)}
                    </span>
                  )}
                  <span className={`text-[10px] tabular-nums ${isSelected ? "text-violet-400/40" : "text-zinc-700"}`} style={{ fontFamily: MONO }}>
                    {count} lines
                  </span>
                </div>
              </div>

              {/* State badge */}
              <span className={`text-[9px] uppercase tracking-wider font-medium ${colors.text}`}>
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
      </div>
    </div>
  );
}

// =============================================================================
// Log Viewer Panel (Right Panel)
// =============================================================================

function LogViewerPanel({
  logs,
  step,
  isFocused,
  selectedLogIdx,
  searchQuery,
  stepTimings,
}: {
  logs: PipelineLogEntry[];
  step: PipelineStep;
  isFocused: boolean;
  selectedLogIdx: number;
  searchQuery: string;
  stepTimings: StepTimings;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const filtered = logs.filter((l) => l.step === step);
  const timingKey = getStepTimingKey(step, stepTimings);
  const timing = stepTimings[timingKey];

  const displayLogs = searchQuery
    ? filtered.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : filtered;

  // Scroll selected line into view
  useEffect(() => {
    if (isFocused && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedLogIdx, isFocused]);

  // Auto-scroll to bottom when not focused
  useEffect(() => {
    if (!isFocused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLogs.length, isFocused]);

  return (
    <div className={`flex flex-col flex-1 rounded-xl border transition-colors duration-150 ${isFocused ? "border-amber-500/30 shadow-[0_0_20px_rgba(251,191,36,0.06)]" : "border-white/[0.06]"} bg-white/[0.02] overflow-hidden`}>
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 text-[11px] text-zinc-600" style={{ fontFamily: MONO }}>
            {step}{timing ? ` — ${formatStepDuration(timing.startedAt, timing.endedAt)}` : ""}
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
      <div ref={scrollRef} style={{ fontFamily: MONO }} className="flex-1 overflow-y-auto p-4 text-[13px] leading-5">
        {displayLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            {searchQuery ? `No matches for "${searchQuery}"` : "No output for this step yet."}
          </div>
        ) : (
          displayLogs.map((entry, i) => {
            const isThinking = !!entry.toolCallId?.startsWith("thinking-");
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
                <span className="shrink-0 select-none text-zinc-600">{formatLogTime(entry.timestamp)}</span>
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
          })
        )}
      </div>
    </div>
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
      { key: "g g", label: "top", type: "static" },
      { key: "G", label: "bottom", type: "static" },
      { key: "Esc", label: "back to steps", type: "static" },
    );
  }

  return (
    <div className="sticky bottom-0 z-20 flex items-center gap-1 border-t border-white/[0.06] bg-zinc-950/95 backdrop-blur-sm px-4 py-2">
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
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DesignPreviewV4() {
  const { run, stepTimings, logEntries } = createMockData();

  const [activeStep, setActiveStep] = useState<PipelineStep>("coding");
  const [selectedStepIdx, setSelectedStepIdx] = useState(2); // coding
  const [focusPanel, setFocusPanel] = useState<FocusPanel>("steps");
  const [mode, setMode] = useState<NavMode>("step");
  const [selectedLogIdx, setSelectedLogIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [gaugeAnimated, setGaugeAnimated] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const steps = ALL_STEPS;
  const isActive = false; // demo is "success"
  const displayStatus = run.status;
  const threshold = run.reviewThreshold;
  const displayScore = run.reviewScore;

  useEffect(() => { const t = setTimeout(() => setGaugeAnimated(true), 300); return () => clearTimeout(t); }, []);

  const getStepState = useCallback((step: PipelineStep): "complete" | "active" | "failed" | "pending" => {
    if (displayStatus === "success") return "complete";
    return "pending";
  }, [displayStatus]);

  const logCounts: Record<string, number> = {};
  for (const step of steps) {
    logCounts[step] = logEntries.filter((l) => l.step === step).length;
  }

  const filteredLogs = logEntries.filter((l) => l.step === activeStep);
  const displayLogs = searchQuery
    ? filteredLogs.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredLogs;

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Search mode
      if (mode === "search") {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchQuery("");
          setSearchInput("");
          setMode(focusPanel === "logs" ? "log" : "step");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setMode(focusPanel === "logs" ? "log" : "step");
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

      // Slash to enter search mode
      if (e.key === "/") {
        e.preventDefault();
        setMode("search");
        setSearchInput(searchQuery);
        return;
      }

      // Tab to switch panels
      if (e.key === "Tab") {
        e.preventDefault();
        if (focusPanel === "steps") {
          setFocusPanel("logs");
          setMode("log");
          setSelectedLogIdx(0);
        } else {
          setFocusPanel("steps");
          setMode("step");
        }
        return;
      }

      // Escape
      if (e.key === "Escape") {
        e.preventDefault();
        if (focusPanel === "logs") {
          setFocusPanel("steps");
          setMode("step");
        }
        return;
      }

      // Number keys for step jump
      const num = parseInt(e.key);
      if (num >= 1 && num <= steps.length) {
        e.preventDefault();
        const step = steps[num - 1];
        setSelectedStepIdx(num - 1);
        setActiveStep(step);
        setSelectedLogIdx(0);
        return;
      }

      // Steps panel navigation
      if (focusPanel === "steps") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedStepIdx((prev) => Math.min(prev + 1, steps.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedStepIdx((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setActiveStep(steps[selectedStepIdx]);
          setSelectedLogIdx(0);
          // Also jump to logs panel
          setFocusPanel("logs");
          setMode("log");
          return;
        }
      }

      // Log panel navigation
      if (focusPanel === "logs") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedLogIdx((prev) => Math.min(prev + 1, displayLogs.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedLogIdx((prev) => Math.max(prev - 1, 0));
          return;
        }
        // g g → top
        if (e.key === "g") {
          // Simple: single g goes to top
          e.preventDefault();
          setSelectedLogIdx(0);
          return;
        }
        // G → bottom
        if (e.key === "G") {
          e.preventDefault();
          setSelectedLogIdx(Math.max(0, displayLogs.length - 1));
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, focusPanel, selectedStepIdx, steps, searchQuery, displayLogs.length]);

  const statusBadge = (() => {
    switch (displayStatus) {
      case "success": return { bg: "bg-emerald-500/10 ring-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" };
      case "failed": return { bg: "bg-red-500/10 ring-red-500/20", text: "text-red-400", dot: "bg-red-400" };
      case "cancelled": return { bg: "bg-zinc-500/10 ring-zinc-500/20", text: "text-zinc-400", dot: "bg-zinc-400" };
      case "rejected": return { bg: "bg-amber-500/10 ring-amber-500/20", text: "text-amber-400", dot: "bg-amber-400" };
      default: return { bg: "bg-amber-500/10 ring-amber-500/20", text: "text-amber-400", dot: "bg-amber-400 animate-pulse" };
    }
  })();

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
          box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.08), inset 0 0 30px rgba(255,255,255,0.02), 0 12px 48px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.25);
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

      <div className="flex h-full flex-col text-zinc-100 bg-zinc-950">
        {/* Header */}
        <header className="sticky top-0 z-20 flex flex-wrap gap-3 items-center justify-between border-b border-white/[0.06] bg-zinc-950 px-4 md:px-8 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/pipelines" className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
              <span className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/15 px-1.5 py-0.5 rounded font-medium">v4 — Two-Panel Split</span>
              <span className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded" style={{ fontFamily: MONO }}>{run.id.slice(0, 8)}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusBadge.bg} ${statusBadge.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                {displayStatus}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500">
              UI Refactor v3
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" /></svg>
            </span>
            {isActive && (
              <button className="flex items-center gap-2 rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50">
                Cancel
                <kbd className="rounded bg-red-500/15 border border-red-500/20 px-1 py-0.5 text-[9px] font-medium text-red-400">c</kbd>
              </button>
            )}
          </div>
        </header>

        {/* Dashboard Widgets — Info Only (not navigable) */}
        <div className="flex flex-col gap-4 px-4 md:px-8 py-6 shrink-0 fade-in-up" style={{ animationDelay: "80ms" }}>
          <div className={`grid gap-4 ${displayScore != null ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}`}>
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
                  <span className="text-zinc-600 font-normal ml-1" style={{ fontFamily: MONO }}>thr {threshold}</span>
                </span>
              </div>
            )}
            <TimingWidget run={run} isActive={isActive} />
            <ConfigWidget run={run} />
            <StatusWidget status={displayStatus} />
          </div>
        </div>

        {/* Two-Panel Split — Steps (left) + Log Viewer (right) */}
        <div className="flex flex-1 overflow-hidden px-4 md:px-8 pb-0 gap-4 fade-in-up" style={{ animationDelay: "200ms" }}>
          {/* Left Panel: Step List */}
          <div className="w-72 shrink-0 flex flex-col">
            <StepListPanel
              steps={steps}
              activeStep={activeStep}
              selectedStepIdx={selectedStepIdx}
              isFocused={focusPanel === "steps"}
              stepTimings={stepTimings}
              getStepState={getStepState}
              onSelectStep={(step) => {
                const idx = steps.indexOf(step);
                setSelectedStepIdx(idx);
                setActiveStep(step);
                setSelectedLogIdx(0);
              }}
              logCounts={logCounts}
            />
          </div>

          {/* Right Panel: Log Viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            <LogViewerPanel
              logs={logEntries}
              step={activeStep}
              isFocused={focusPanel === "logs"}
              selectedLogIdx={selectedLogIdx}
              searchQuery={searchQuery}
              stepTimings={stepTimings}
            />
          </div>
        </div>

        {/* Bottom Hints Bar */}
        <HintsBar mode={mode} focusPanel={focusPanel} searchQuery={searchQuery} />
      </div>
    </>
  );
}
