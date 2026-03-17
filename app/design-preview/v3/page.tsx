"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// =============================================================================
// Types & Constants
// =============================================================================

type PipelineStep = "worktree" | "retrieving" | "coding" | "reviewing" | "merging" | "updating";
type StepState = "complete" | "active" | "failed" | "pending";

const ALL_STEPS: PipelineStep[] = ["worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

// Navigation modes
type NavMode = "section" | "step" | "log" | "search";

// Sections for flat list navigation
type SectionId = "header" | "score" | "timing" | "config" | "status" | "steps" | "issues" | "logs";

const SECTION_LABELS: Record<SectionId, string> = {
  header: "Header Actions",
  score: "Review Score",
  timing: "Timing",
  config: "Configuration",
  status: "Status",
  steps: "Pipeline Steps",
  issues: "Review Issues",
  logs: "Log Viewer",
};

// Mock data for demo
const MOCK_LOGS: { timestamp: number; step: PipelineStep; stream: "stdout" | "stderr"; text: string; iteration?: number }[] = [
  { timestamp: Date.now() - 120000, step: "worktree", stream: "stdout", text: "Creating worktree for branch pipeline/spec-v3..." },
  { timestamp: Date.now() - 119000, step: "worktree", stream: "stdout", text: "Worktree created at /tmp/worktrees/abc123" },
  { timestamp: Date.now() - 115000, step: "retrieving", stream: "stdout", text: "Fetching knowledge documents..." },
  { timestamp: Date.now() - 114000, step: "retrieving", stream: "stdout", text: "Retrieved 3 documents (12.4KB total)" },
  { timestamp: Date.now() - 110000, step: "coding", stream: "stdout", text: "[Edit] app/components/Button.tsx" },
  { timestamp: Date.now() - 108000, step: "coding", stream: "stdout", text: "Adding keyboard navigation support..." },
  { timestamp: Date.now() - 105000, step: "coding", stream: "stdout", text: "[Write] app/hooks/useVimNav.ts" },
  { timestamp: Date.now() - 100000, step: "coding", stream: "stdout", text: "[Bash] npm run typecheck" },
  { timestamp: Date.now() - 95000, step: "coding", stream: "stdout", text: "Type check passed with 0 errors" },
  { timestamp: Date.now() - 90000, step: "coding", stream: "stdout", text: "[Edit] app/components/HintsBar.tsx", iteration: 2 },
  { timestamp: Date.now() - 85000, step: "coding", stream: "stdout", text: "Refactoring hint display logic...", iteration: 2 },
  { timestamp: Date.now() - 80000, step: "reviewing", stream: "stdout", text: "Starting code review..." },
  { timestamp: Date.now() - 75000, step: "reviewing", stream: "stdout", text: "Analyzing 4 changed files..." },
  { timestamp: Date.now() - 70000, step: "reviewing", stream: "stdout", text: "Summary: Good implementation with minor style issues" },
  { timestamp: Date.now() - 65000, step: "reviewing", stream: "stdout", text: "Issues:\n- Missing error boundary around keyboard handler\n- Consider using useCallback for event handlers" },
  { timestamp: Date.now() - 60000, step: "reviewing", stream: "stdout", text: "Review score: 82/100" },
  { timestamp: Date.now() - 55000, step: "merging", stream: "stdout", text: "Merging branch pipeline/spec-v3 into main..." },
  { timestamp: Date.now() - 50000, step: "merging", stream: "stdout", text: "Merge successful, no conflicts" },
  { timestamp: Date.now() - 45000, step: "updating", stream: "stdout", text: "Updating specification status..." },
  { timestamp: Date.now() - 40000, step: "updating", stream: "stdout", text: "Pipeline complete" },
];

const MOCK_ISSUES = [
  "Missing error boundary around keyboard handler",
  "Consider using useCallback for event handlers to prevent unnecessary re-renders",
  "Minor: variable naming inconsistency in useVimNav hook",
];

// =============================================================================
// Kbd helper
// =============================================================================

function Kbd({ children, variant = "static" }: { children: React.ReactNode; variant?: "static" | "dynamic" | "action" }) {
  const styles = {
    static: "bg-violet-500/15 border-violet-500/20 text-violet-400",
    dynamic: "bg-cyan-500/15 border-cyan-500/20 text-cyan-400",
    action: "bg-amber-500/15 border-amber-500/20 text-amber-400",
  };
  return (
    <kbd className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-mono font-medium border rounded ${styles[variant]}`}>
      {children}
    </kbd>
  );
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
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="url(#gauge-track-grad)" strokeWidth={strokeW} strokeLinecap="round" />
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
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreGlowColor} strokeWidth={strokeW + 8} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} filter="url(#score-glow-soft)" style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreColor} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={animated ? scoreOffset : semiCircumference} filter="url(#score-glow)" style={{ transition: animated ? "stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }} />
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
// TimingWidget
// =============================================================================

function TimingWidget({ isSelected }: { isSelected: boolean }) {
  const items = [
    { label: "Created", value: "Mar 17, 14:32", done: true },
    { label: "Finished", value: "Mar 17, 14:35", done: true },
    { label: "Duration", value: "2m 48s", done: true },
  ];

  return (
    <div className={`flex flex-col rounded-2xl border p-6 transition-colors duration-150 ${isSelected ? "border-violet-500/40 bg-violet-500/[0.04] shadow-[0_0_20px_rgba(139,92,246,0.06)]" : "border-white/[0.06] bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2 mb-5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Timing</div>
        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
      </div>
      <div className="flex flex-col gap-0">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center w-3 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${item.done ? "border-emerald-500/60 bg-emerald-500/20" : "border-zinc-700 bg-zinc-800"}`} />
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

// =============================================================================
// ConfigWidget
// =============================================================================

function ConfigWidget({ isSelected }: { isSelected: boolean }) {
  const rows = [
    { icon: <svg className="h-3.5 w-3.5 text-cyan-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>, label: "Branch", value: "pipeline/spec-v3", valueClass: "text-cyan-400/80" },
    { icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" /></svg>, label: "Iterations", value: "2 / 3", valueClass: "text-zinc-300" },
    { icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>, label: "Specification", value: "UI Refactor v3", valueClass: "text-violet-400/80" },
  ];

  return (
    <div className={`flex flex-col rounded-2xl border p-6 transition-colors duration-150 ${isSelected ? "border-violet-500/40 bg-violet-500/[0.04] shadow-[0_0_20px_rgba(139,92,246,0.06)]" : "border-white/[0.06] bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2 mb-5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Configuration</div>
        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
      </div>
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

// =============================================================================
// StatusWidget
// =============================================================================

function StatusWidget({ status, isSelected }: { status: string; isSelected: boolean }) {
  const config: Record<string, { color: string; glow: string; bg: string; animBg: string; label: string }> = {
    success: { color: "text-emerald-400", glow: "shadow-[0_0_40px_rgba(16,185,129,0.15)]", bg: "bg-emerald-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.06) 0%, transparent 70%)", label: "Success" },
    failed: { color: "text-red-400", glow: "shadow-[0_0_40px_rgba(239,68,68,0.15)]", bg: "bg-red-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(239,68,68,0.06) 0%, transparent 70%)", label: "Failed" },
    cancelled: { color: "text-zinc-400", glow: "", bg: "bg-zinc-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(161,161,170,0.04) 0%, transparent 70%)", label: "Cancelled" },
    rejected: { color: "text-amber-400", glow: "shadow-[0_0_40px_rgba(251,191,36,0.12)]", bg: "bg-amber-500/[0.04]", animBg: "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 70%)", label: "Rejected" },
  };
  const c = config[status] ?? { color: "text-amber-400", glow: "shadow-[0_0_40px_rgba(251,191,36,0.1)]", bg: "bg-amber-500/[0.04]", animBg: "", label: status.charAt(0).toUpperCase() + status.slice(1) };
  const isRunning = !["success", "failed", "cancelled", "rejected"].includes(status);

  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border ${c.bg} p-6 ${c.glow} relative overflow-hidden transition-colors duration-150 ${isSelected ? "border-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.06)]" : "border-white/[0.06]"}`}>
      {isRunning && <div className="absolute inset-0 animate-pulse" style={{ background: c.animBg }} />}
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Status</div>
        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
      </div>
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
// Step Icons (from step-designs)
// =============================================================================

const STEP_ICONS: Record<string, (cls: string) => React.ReactNode> = {
  worktree: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>,
  retrieving: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
  coding: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>,
  reviewing: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
  merging: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
  updating: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>,
};

const STATE_COLORS: Record<StepState, { dot: string; text: string; border: string; bg: string }> = {
  complete: { dot: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/[0.06]" },
  active: { dot: "bg-amber-400 animate-pulse", text: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/[0.06]" },
  failed: { dot: "bg-red-500", text: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/[0.06]" },
  pending: { dot: "bg-zinc-700", text: "text-zinc-600", border: "border-zinc-700/30", bg: "bg-zinc-800/30" },
};

// =============================================================================
// StepBar with navigable steps
// =============================================================================

function StepBar({
  steps,
  activeStep,
  selectedStepIdx,
  stepStates,
  onStepClick,
  isNavigable,
  isSelected,
}: {
  steps: PipelineStep[];
  activeStep: PipelineStep;
  selectedStepIdx: number;
  stepStates: Record<string, StepState>;
  onStepClick: (step: PipelineStep) => void;
  isNavigable: boolean;
  isSelected: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors duration-150 ${isSelected ? (isNavigable ? "border-amber-500/40 bg-amber-500/[0.03] shadow-[0_0_20px_rgba(245,158,11,0.06)]" : "border-violet-500/40 bg-violet-500/[0.04] shadow-[0_0_20px_rgba(139,92,246,0.06)]") : "border-white/[0.06] bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Pipeline Steps</div>
        {isSelected && <div className={`h-1.5 w-1.5 rounded-full ${isNavigable ? "bg-amber-400" : "bg-violet-400"}`} />}
        {isNavigable && <span className="text-[9px] text-amber-400/70 ml-auto">STEP MODE</span>}
      </div>
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const state = stepStates[step] ?? "pending";
          const colors = STATE_COLORS[state];
          const isActiveStep = step === activeStep;
          const isStepSelected = isNavigable && i === selectedStepIdx;

          return (
            <button
              key={step}
              onClick={() => onStepClick(step)}
              className={`group relative flex-1 flex flex-col items-center gap-2 rounded-xl py-3 px-2 transition-all duration-150 cursor-pointer ${
                isStepSelected
                  ? "border-2 border-amber-500/50 bg-amber-500/[0.08]"
                  : isActiveStep
                    ? `border ${colors.border} ${colors.bg}`
                    : "border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isStepSelected ? "bg-amber-500/15 border border-amber-500/25" : isActiveStep ? `${colors.bg} border ${colors.border}` : "bg-white/[0.03] border border-white/[0.04]"}`}>
                {STEP_ICONS[step]?.(`h-4 w-4 ${isStepSelected ? "text-amber-400" : colors.text}`)}
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[10px] font-medium capitalize ${isStepSelected ? "text-amber-300" : isActiveStep ? colors.text : "text-zinc-500"}`}>{step}</span>
                <div className={`h-1 w-1 rounded-full ${isStepSelected ? "bg-amber-400" : colors.dot}`} />
              </div>
              {/* Number key hint */}
              {isNavigable && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded px-1 font-mono">{i + 1}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// ReviewIssuesSection
// =============================================================================

function ReviewIssuesSection({ issues, isSelected }: { issues: string[]; isSelected: boolean }) {
  const [expanded, setExpanded] = useState(true);

  const getSeverity = (issue: string): { label: string; color: string; bg: string } => {
    const lower = issue.toLowerCase();
    if (lower.includes("critical") || lower.includes("security") || lower.includes("crash"))
      return { label: "critical", color: "text-red-400", bg: "bg-red-500/15 border-red-500/20" };
    if (lower.includes("missing") || lower.includes("error") || lower.includes("fail") || lower.includes("wrong"))
      return { label: "major", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/20" };
    return { label: "minor", color: "text-zinc-400", bg: "bg-zinc-500/15 border-zinc-500/20" };
  };

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors duration-150 ${isSelected ? "border-violet-500/40 bg-violet-500/[0.02] shadow-[0_0_20px_rgba(139,92,246,0.06)]" : "border-amber-500/10 bg-amber-500/[0.02]"}`}>
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-white/[0.02]">
        <svg className="w-4 h-4 text-amber-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <span className="text-xs font-medium text-amber-400/80">Review Issues</span>
        <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO }}>{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-violet-400 ml-1" />}
        <svg className={`w-4 h-4 text-zinc-600 shrink-0 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      <div className="grid transition-[grid-template-rows] duration-200" style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="grid grid-cols-[48px_1fr_90px] items-center gap-4 border-t border-white/[0.04] px-5 py-2" style={{ fontFamily: MONO }}>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">#</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">Description</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 text-right">Severity</span>
          </div>
          {issues.map((issue, i) => {
            const severity = getSeverity(issue);
            return (
              <div key={i} className={`grid grid-cols-[48px_1fr_90px] items-center gap-4 px-5 py-2.5 ${i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"} transition-colors hover:bg-white/[0.03]`}>
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
// LogViewer with search
// =============================================================================

function LogViewer({
  logs,
  step,
  isSelected,
  isFocused,
  logScrollIdx,
  searchQuery,
  searchOpen,
}: {
  logs: typeof MOCK_LOGS;
  step: PipelineStep;
  isSelected: boolean;
  isFocused: boolean;
  logScrollIdx: number;
  searchQuery: string;
  searchOpen: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filtered = logs.filter((l) => l.step === step);
  const searchFiltered = searchQuery
    ? filtered.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : filtered;

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  useEffect(() => {
    if (isFocused && scrollRef.current) {
      const lineEls = scrollRef.current.querySelectorAll("[data-log-line]");
      if (lineEls[logScrollIdx]) {
        lineEls[logScrollIdx].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [logScrollIdx, isFocused]);

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border transition-colors duration-150 ${
      isFocused
        ? "border-amber-500/40 bg-amber-500/[0.02] shadow-[0_0_20px_rgba(245,158,11,0.06)]"
        : isSelected
          ? "border-violet-500/40 bg-violet-500/[0.04] shadow-[0_0_20px_rgba(139,92,246,0.06)]"
          : "border-white/[0.06] bg-white/[0.02]"
    }`}>
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 text-[11px] text-zinc-600" style={{ fontFamily: MONO }}>{step}</span>
          {isFocused && (
            <span className="text-[9px] text-amber-400/70 ml-2 uppercase">Log Mode</span>
          )}
          {isSelected && !isFocused && (
            <div className="h-1.5 w-1.5 rounded-full bg-violet-400 ml-2" />
          )}
        </div>
        <div className="flex items-center gap-3">
          {searchOpen && (
            <div className="flex items-center gap-1 bg-zinc-900/80 border border-amber-500/30 rounded px-2 py-0.5">
              <svg className="w-3 h-3 text-amber-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <span className="text-[11px] text-amber-300" style={{ fontFamily: MONO }}>{searchQuery || "..."}</span>
            </div>
          )}
          <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
            {searchQuery ? `${searchFiltered.length}/` : ""}{filtered.length} lines
          </span>
        </div>
      </div>

      {/* Log content */}
      <div ref={scrollRef} style={{ fontFamily: MONO }} className="flex-1 overflow-y-auto p-4 text-[13px] leading-5 max-h-[360px]">
        {searchFiltered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-zinc-600">
            {searchQuery ? "No matching lines" : "No output for this step yet."}
          </div>
        ) : (
          searchFiltered.map((entry, i) => {
            const isLogSelected = isFocused && i === logScrollIdx;
            const isToolUse = entry.stream === "stdout" && /^\[(?:Read|Write|Edit|Bash|Glob|Grep|Task)\]/.test(entry.text);
            return (
              <div
                key={i}
                data-log-line
                className={`flex gap-3 rounded px-1 -mx-1 transition-colors duration-100 ${
                  isLogSelected
                    ? "bg-amber-500/10 border-l-2 border-l-amber-500"
                    : "border-l-2 border-l-transparent"
                }`}
              >
                <span className="shrink-0 select-none text-zinc-600">{formatTime(entry.timestamp)}</span>
                <span className={
                  entry.stream === "stderr"
                    ? "text-red-400 whitespace-pre-wrap"
                    : isToolUse
                      ? "text-amber-400/80 whitespace-pre-wrap"
                      : "text-zinc-300 whitespace-pre-wrap"
                }>
                  {searchQuery ? highlightMatch(entry.text, searchQuery) : entry.text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-amber-300 font-semibold bg-amber-500/15 rounded px-0.5">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// =============================================================================
// Main Page Component — Variant 3: Flat Section List
// =============================================================================

export default function DesignPreviewV3() {
  // Navigation state
  const [mode, setMode] = useState<NavMode>("section");
  const [sectionIdx, setSectionIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [logIdx, setLogIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pipeline state (mock)
  const [activeStep, setActiveStep] = useState<PipelineStep>("reviewing");
  const [gaugeAnimated, setGaugeAnimated] = useState(false);
  const displayStatus = "success";
  const displayScore = 82;
  const threshold = 80;

  useEffect(() => {
    const t = setTimeout(() => setGaugeAnimated(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Define sections — the flat list the user navigates
  const sections: SectionId[] = ["header", "score", "timing", "config", "status", "steps", "issues", "logs"];
  const currentSection = sections[sectionIdx];

  // Step states (mock)
  const stepStates: Record<string, StepState> = {
    worktree: "complete",
    retrieving: "complete",
    coding: "complete",
    reviewing: "complete",
    merging: "complete",
    updating: "complete",
  };

  // Log filtering by active step
  const filteredLogs = MOCK_LOGS.filter((l) => l.step === activeStep);
  const maxLogIdx = Math.max(0, (searchQuery
    ? filteredLogs.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase())).length
    : filteredLogs.length) - 1);

  // Switch to step when entering step mode
  const enterStepMode = useCallback(() => {
    setMode("step");
    setStepIdx(ALL_STEPS.indexOf(activeStep));
  }, [activeStep]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Only handle Escape in search input
        if (e.key === "Escape" && searchOpen) {
          e.preventDefault();
          setSearchQuery("");
          setSearchOpen(false);
          setMode("log");
        }
        return;
      }

      // Overlay check
      if (document.querySelector("[data-overlay-open]")) return;

      if (mode === "search") {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchQuery("");
          setSearchOpen(false);
          setMode("log");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSearchOpen(false);
          setMode("log");
          return;
        }
        // Let the input handle other keys
        return;
      }

      if (mode === "section") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSectionIdx((i) => Math.min(i + 1, sections.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSectionIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (currentSection === "steps") {
            enterStepMode();
          } else if (currentSection === "logs") {
            setMode("log");
            setLogIdx(0);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          // Would go back in real app
          return;
        }
        // Number keys 1-6 jump to steps
        const num = parseInt(e.key);
        if (num >= 1 && num <= ALL_STEPS.length) {
          e.preventDefault();
          setActiveStep(ALL_STEPS[num - 1]);
          setSectionIdx(sections.indexOf("steps"));
          return;
        }
        return;
      }

      if (mode === "step") {
        if (e.key === "j" || e.key === "ArrowDown" || e.key === "l" || e.key === "ArrowRight") {
          e.preventDefault();
          setStepIdx((i) => Math.min(i + 1, ALL_STEPS.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp" || e.key === "h" || e.key === "ArrowLeft") {
          e.preventDefault();
          setStepIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setActiveStep(ALL_STEPS[stepIdx]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMode("section");
          return;
        }
        const num = parseInt(e.key);
        if (num >= 1 && num <= ALL_STEPS.length) {
          e.preventDefault();
          setStepIdx(num - 1);
          setActiveStep(ALL_STEPS[num - 1]);
          return;
        }
        return;
      }

      if (mode === "log") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setLogIdx((i) => Math.min(i + 1, maxLogIdx));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setLogIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "g") {
          e.preventDefault();
          setLogIdx(0);
          return;
        }
        if (e.key === "G") {
          e.preventDefault();
          setLogIdx(maxLogIdx);
          return;
        }
        if (e.key === "/") {
          e.preventDefault();
          setMode("search");
          setSearchOpen(true);
          setSearchQuery("");
          setTimeout(() => searchInputRef.current?.focus(), 0);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMode("section");
          setSectionIdx(sections.indexOf("logs"));
          return;
        }
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [mode, currentSection, sections, stepIdx, logIdx, maxLogIdx, searchOpen, enterStepMode]);

  // Scroll selected section into view
  useEffect(() => {
    const el = document.querySelector(`[data-section="${currentSection}"]`);
    if (el && mode === "section") {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentSection, mode]);

  // Build hints based on mode
  const hints: { key: string; label: string; variant?: "static" | "dynamic" | "action" }[] = [];
  if (mode === "search") {
    hints.push({ key: "Esc", label: "Cancel", variant: "static" });
    hints.push({ key: "Enter", label: "Confirm", variant: "action" });
  } else if (mode === "log") {
    hints.push({ key: "j/k", label: "Scroll", variant: "dynamic" });
    hints.push({ key: "g/G", label: "Top/Bottom", variant: "dynamic" });
    hints.push({ key: "/", label: "Search", variant: "action" });
    hints.push({ key: "Esc", label: "Exit log", variant: "static" });
  } else if (mode === "step") {
    hints.push({ key: "j/k", label: "Navigate", variant: "dynamic" });
    hints.push({ key: "h/l", label: "Navigate", variant: "dynamic" });
    hints.push({ key: "1-6", label: "Jump to step", variant: "action" });
    hints.push({ key: "Enter", label: "Select step", variant: "action" });
    hints.push({ key: "Esc", label: "Back", variant: "static" });
  } else {
    hints.push({ key: "j/k", label: "Navigate", variant: "static" });
    hints.push({ key: "Enter", label: "Enter section", variant: "action" });
    hints.push({ key: "1-6", label: "Jump to step", variant: "dynamic" });
    hints.push({ key: "Esc", label: "Back", variant: "static" });
  }

  const modeLabel = { section: "SECTION", step: "STEP", log: "LOG", search: "SEARCH" }[mode];
  const modeColor = { section: "text-violet-400", step: "text-amber-400", log: "text-amber-400", search: "text-cyan-400" }[mode];

  const statusBadge = { bg: "bg-emerald-500/10 ring-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" };

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

      <div className="flex h-full flex-col text-zinc-100">
        {/* ── Header Section ── */}
        <header
          data-section="header"
          className={`sticky top-0 z-20 flex flex-wrap gap-3 items-center justify-between border-b px-4 md:px-8 py-4 shrink-0 transition-colors duration-150 ${
            currentSection === "header" && mode === "section"
              ? "border-violet-500/30 bg-violet-500/[0.02]"
              : "border-white/[0.06] bg-zinc-950"
          }`}
        >
          <div className="flex items-center gap-4">
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
              <span className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/15 px-1.5 py-0.5 rounded font-medium">v3 — Flat Section List</span>
              <span className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded" style={{ fontFamily: MONO }}>demo1234</span>
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
            {currentSection === "header" && mode === "section" && (
              <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            )}
          </div>
        </header>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="flex flex-col gap-4 fade-in-up" style={{ animationDelay: "80ms" }}>
            {/* Widget Grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              {/* Score Widget */}
              <div
                data-section="score"
                className={`glass-card-strong gradient-border-glow rounded-2xl overflow-hidden flex flex-col items-center justify-center p-4 transition-all duration-150 ${
                  currentSection === "score" && mode === "section"
                    ? "ring-2 ring-violet-500/40 shadow-[0_0_24px_rgba(139,92,246,0.1)]"
                    : ""
                }`}
              >
                {currentSection === "score" && mode === "section" && (
                  <div className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-violet-400 z-10" />
                )}
                <div className="relative flex justify-center">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-[160px] rounded-full opacity-20 blur-[60px]" style={{ background: displayScore >= threshold ? "radial-gradient(ellipse, #10b981 0%, transparent 70%)" : "radial-gradient(ellipse, #ef4444 0%, transparent 70%)" }} />
                  <SemiCircleGauge score={displayScore} threshold={threshold} animated={gaugeAnimated} />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide mt-1 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  PASSED
                  <span className="text-zinc-600 font-normal ml-1" style={{ fontFamily: MONO }}>thr {threshold}</span>
                </span>
              </div>

              {/* Timing */}
              <div data-section="timing">
                <TimingWidget isSelected={currentSection === "timing" && mode === "section"} />
              </div>

              {/* Config */}
              <div data-section="config">
                <ConfigWidget isSelected={currentSection === "config" && mode === "section"} />
              </div>

              {/* Status */}
              <div data-section="status">
                <StatusWidget status={displayStatus} isSelected={currentSection === "status" && mode === "section"} />
              </div>
            </div>

            {/* Step Bar */}
            <div data-section="steps">
              <StepBar
                steps={ALL_STEPS}
                activeStep={activeStep}
                selectedStepIdx={stepIdx}
                stepStates={stepStates}
                onStepClick={(step) => {
                  setActiveStep(step);
                  setStepIdx(ALL_STEPS.indexOf(step));
                }}
                isNavigable={mode === "step"}
                isSelected={(currentSection === "steps" && mode === "section") || mode === "step"}
              />
            </div>

            {/* Review Issues */}
            <div data-section="issues">
              <ReviewIssuesSection
                issues={MOCK_ISSUES}
                isSelected={currentSection === "issues" && mode === "section"}
              />
            </div>

            {/* Log Viewer */}
            <div data-section="logs" className="min-h-[400px] flex flex-col">
              <LogViewer
                logs={MOCK_LOGS}
                step={activeStep}
                isSelected={(currentSection === "logs" && mode === "section")}
                isFocused={mode === "log" || mode === "search"}
                logScrollIdx={logIdx}
                searchQuery={searchQuery}
                searchOpen={searchOpen}
              />
            </div>
          </div>
        </div>

        {/* ── Search Input (hidden, captures keystrokes in search mode) ── */}
        {searchOpen && (
          <div className="fixed inset-0 z-40 flex items-end justify-center pb-16 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 bg-zinc-900/95 backdrop-blur-xl border border-amber-500/30 rounded-xl px-4 py-3 shadow-2xl">
              <svg className="w-4 h-4 text-amber-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setLogIdx(0);
                }}
                placeholder="Filter logs..."
                className="bg-transparent text-sm text-amber-100 placeholder-zinc-600 outline-none w-64"
                style={{ fontFamily: MONO }}
                autoFocus
              />
              <div className="flex items-center gap-1.5 ml-2">
                <Kbd variant="static">Esc</Kbd>
                <Kbd variant="action">Enter</Kbd>
              </div>
            </div>
          </div>
        )}

        {/* ── Bottom Hints Bar ── */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-1.5 border-t border-white/[0.04] bg-zinc-950">
          {/* Mode indicator */}
          <span className={`text-[10px] font-medium ${modeColor} bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded`}>
            {modeLabel}
          </span>

          {/* Section indicator (in section mode) */}
          {mode === "section" && (
            <span className="text-[10px] text-zinc-600">
              {SECTION_LABELS[currentSection]}
              <span className="text-zinc-700 ml-1">({sectionIdx + 1}/{sections.length})</span>
            </span>
          )}

          {/* Hints */}
          <div className="flex items-center gap-3 ml-auto">
            {hints.map((h, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600">
                <Kbd variant={h.variant}>{h.key}</Kbd>
                <span>{h.label}</span>
              </span>
            ))}
          </div>

          <span className="text-[10px] text-zinc-700 ml-3">v3 — Flat Section List</span>
        </div>
      </div>
    </>
  );
}
