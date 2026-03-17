"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// =============================================================================
// Types & Constants
// =============================================================================

type PipelineStep = "worktree" | "retrieving" | "coding" | "reviewing" | "merging" | "updating";
type StepState = "complete" | "active" | "failed" | "pending";

interface LogEntry {
  timestamp: number;
  step: PipelineStep;
  stream: "stdout" | "stderr";
  text: string;
  toolCallId?: string;
  iteration?: number;
}

interface ReviewIssue {
  text: string;
  severity: "critical" | "major" | "minor";
}

const ALL_STEPS: PipelineStep[] = ["worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

// =============================================================================
// Section Definition — Every navigable section on the page
// =============================================================================

type SectionId = "header" | "score" | "timing" | "config" | "status" | "steps" | "issues" | "logs";

interface Section {
  id: SectionId;
  label: string;
  drillable: boolean; // Can Enter drill into this section?
}

const SECTIONS: Section[] = [
  { id: "header", label: "Header Actions", drillable: false },
  { id: "score", label: "Review Score", drillable: false },
  { id: "timing", label: "Timing", drillable: false },
  { id: "config", label: "Configuration", drillable: false },
  { id: "status", label: "Status", drillable: false },
  { id: "steps", label: "Pipeline Steps", drillable: true },
  { id: "issues", label: "Review Issues", drillable: true },
  { id: "logs", label: "Log Viewer", drillable: true },
];

// =============================================================================
// Navigation Mode
// =============================================================================

type NavMode = "section" | "step" | "log" | "search";

// =============================================================================
// Mock Data for Preview
// =============================================================================

function generateMockLogs(): LogEntry[] {
  const now = Date.now();
  const logs: LogEntry[] = [];
  const steps: PipelineStep[] = ["worktree", "retrieving", "coding", "reviewing", "merging"];

  const messages: Record<PipelineStep, string[]> = {
    worktree: [
      "Creating worktree branch: feature/add-keyboard-nav",
      "Checking out branch from main...",
      "Worktree created at /tmp/worktrees/abc123",
      "Installing dependencies...",
      "npm install completed successfully",
    ],
    retrieving: [
      "Loading specification v3...",
      "Fetching knowledge base entries...",
      "Found 12 relevant knowledge entries",
      "Context preparation complete",
    ],
    coding: [
      "[Read] app/pipelines/[runId]/PipelinePageShell.tsx",
      "Analyzing existing keyboard handler...",
      "[Edit] app/pipelines/[runId]/PipelinePageShell.tsx",
      "Adding useVimNavigation hook...",
      "[Write] app/hooks/useVimNavigation.ts",
      "Implementing section-based navigation...",
      "[Read] app/settings/page.tsx",
      "Referencing existing vim pattern...",
      "[Edit] app/pipelines/[runId]/PipelinePageShell.tsx",
      "Adding bottom hints bar component...",
      "Wiring keyboard event handlers...",
      "[Bash] npm run typecheck",
      "Type checking passed with 0 errors",
    ],
    reviewing: [
      "Starting code review...",
      "Analyzing changed files...",
      "Checking for accessibility issues...",
      "Review score: 85/100",
      "Summary: Good implementation with minor issues",
      "Issues:",
      "- Missing aria-label on navigation sections",
      "- Consider adding screen reader announcements for mode changes",
    ],
    merging: [
      "Merging branch feature/add-keyboard-nav into main...",
      "No conflicts detected",
      "Merge complete",
      "Cleaning up worktree...",
    ],
    updating: [],
  };

  let offset = 0;
  for (const step of steps) {
    for (const msg of messages[step]) {
      logs.push({
        timestamp: now - 300000 + offset * 2000,
        step,
        stream: msg.startsWith("-") ? "stdout" : "stdout",
        text: msg,
        iteration: step === "coding" || step === "reviewing" ? 2 : undefined,
      });
      offset++;
    }
  }

  return logs;
}

const MOCK_LOGS = generateMockLogs();

const MOCK_ISSUES: ReviewIssue[] = [
  { text: "Missing aria-label on navigation sections for screen readers", severity: "major" },
  { text: "Consider adding screen reader announcements for mode changes", severity: "minor" },
  { text: "Keyboard trap possible when search input is focused with no escape handler", severity: "critical" },
];

// =============================================================================
// Fuzzy Helpers
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

function FuzzyHighlight({ text, query, className, highlightClass }: {
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
// Timing Widget
// =============================================================================

function TimingWidget({ isSelected }: { isSelected: boolean }) {
  const items = [
    { label: "Created", value: "Mar 17, 14:32", done: true },
    { label: "Finished", value: "Mar 17, 14:38", done: true },
    { label: "Duration", value: "5m 42s", done: true },
  ];

  return (
    <div className={`flex flex-col rounded-2xl border bg-white/[0.02] p-6 transition-colors duration-150 ${
      isSelected ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-white/[0.06]"
    }`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-5 font-medium">Timing</div>
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
// Config Widget
// =============================================================================

function ConfigWidget({ isSelected }: { isSelected: boolean }) {
  const rows = [
    {
      icon: <svg className="h-3.5 w-3.5 text-cyan-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>,
      label: "Branch", value: "feature/add-keyboard-nav", valueClass: "text-cyan-400/80",
    },
    {
      icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" /></svg>,
      label: "Iterations", value: "2 / 3", valueClass: "text-zinc-300",
    },
    {
      icon: <svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
      label: "Specification", value: "Vimstyle Pipeline Detail v3", valueClass: "text-violet-400/80",
    },
  ];

  return (
    <div className={`flex flex-col rounded-2xl border bg-white/[0.02] p-6 transition-colors duration-150 ${
      isSelected ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-white/[0.06]"
    }`}>
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

// =============================================================================
// Status Widget
// =============================================================================

function StatusWidget({ status, isSelected }: { status: string; isSelected: boolean }) {
  const config: Record<string, { color: string; glow: string; bg: string; label: string }> = {
    success: { color: "text-emerald-400", glow: "shadow-[0_0_40px_rgba(16,185,129,0.15)]", bg: "bg-emerald-500/[0.04]", label: "Success" },
    failed: { color: "text-red-400", glow: "shadow-[0_0_40px_rgba(239,68,68,0.15)]", bg: "bg-red-500/[0.04]", label: "Failed" },
    cancelled: { color: "text-zinc-400", glow: "", bg: "bg-zinc-500/[0.04]", label: "Cancelled" },
    rejected: { color: "text-amber-400", glow: "shadow-[0_0_40px_rgba(251,191,36,0.12)]", bg: "bg-amber-500/[0.04]", label: "Rejected" },
  };
  const c = config[status] ?? config.success;

  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border ${c.bg} p-6 ${c.glow} relative overflow-hidden transition-colors duration-150 ${
      isSelected ? "border-violet-500/40" : "border-white/[0.06]"
    }`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-4 font-medium relative z-10">Status</div>
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <span className={`text-lg font-semibold tracking-tight ${c.color}`}>{c.label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Step Bar with Selection
// =============================================================================

const STEP_ICONS: Record<string, (cls: string) => React.ReactNode> = {
  worktree: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>,
  retrieving: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
  coding: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>,
  reviewing: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
  merging: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
  updating: (cls) => <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>,
};

const STEP_STATES: Record<PipelineStep, StepState> = {
  worktree: "complete",
  retrieving: "complete",
  coding: "complete",
  reviewing: "complete",
  merging: "complete",
  updating: "pending",
};

const STATE_DOT_COLOR: Record<string, string> = {
  complete: "bg-emerald-500",
  active: "bg-amber-400 animate-pulse",
  failed: "bg-red-500",
  pending: "bg-zinc-700",
};

const STATE_TEXT_COLOR: Record<string, string> = {
  complete: "text-emerald-400",
  active: "text-amber-400",
  failed: "text-red-400",
  pending: "text-zinc-600",
};

function StepBar({
  isSelected,
  isDrilled,
  activeStep,
  selectedStepIdx,
  onSelectStep,
}: {
  isSelected: boolean;
  isDrilled: boolean;
  activeStep: PipelineStep;
  selectedStepIdx: number;
  onSelectStep: (step: PipelineStep) => void;
}) {
  const steps = ALL_STEPS.slice(0, 5); // exclude "updating" for demo

  return (
    <div className={`rounded-2xl border p-4 transition-colors duration-150 ${
      isDrilled
        ? "border-amber-500/40 bg-amber-500/[0.04]"
        : isSelected
          ? "border-violet-500/40 bg-violet-500/[0.04]"
          : "border-white/[0.06] bg-white/[0.02]"
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Pipeline Steps</span>
        {isDrilled && (
          <span className="text-[10px] text-amber-400/80 flex items-center gap-1">
            <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">j</kbd>
            <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">k</kbd>
            navigate
            <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400 ml-1">Esc</kbd>
            back
          </span>
        )}
        {isSelected && !isDrilled && (
          <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400">Enter to drill in</kbd>
        )}
      </div>
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const state = STEP_STATES[step];
          const isStepSelected = isDrilled && i === selectedStepIdx;
          const isStepActive = step === activeStep;
          const icon = STEP_ICONS[step];

          return (
            <button
              key={step}
              onClick={() => onSelectStep(step)}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
                isStepSelected
                  ? "border-amber-500/40 bg-amber-500/[0.08] ring-1 ring-amber-500/20"
                  : isStepActive
                    ? "border-violet-500/30 bg-violet-500/[0.06]"
                    : "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
            >
              <div className={`shrink-0 ${isStepSelected ? "text-amber-400" : STATE_TEXT_COLOR[state]}`}>
                {icon ? icon("h-4 w-4") : null}
              </div>
              <div className="flex flex-col items-start min-w-0">
                <span className={`text-[11px] font-medium capitalize truncate ${
                  isStepSelected ? "text-amber-300" : isStepActive ? "text-violet-300" : "text-zinc-400"
                }`}>
                  {step}
                </span>
                <span className="text-[9px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO }}>
                  {state === "complete" ? "done" : state}
                </span>
              </div>
              {isDrilled && (
                <span className={`text-[9px] font-mono shrink-0 ${isStepSelected ? "text-amber-500" : "text-zinc-700"}`}>
                  {i + 1}
                </span>
              )}
              <div className={`ml-auto h-1.5 w-1.5 rounded-full shrink-0 ${
                isStepSelected ? "bg-amber-400" : STATE_DOT_COLOR[state]
              }`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Review Issues with Navigation
// =============================================================================

function ReviewIssuesPanel({
  issues,
  isSelected,
  isDrilled,
  selectedIssueIdx,
}: {
  issues: ReviewIssue[];
  isSelected: boolean;
  isDrilled: boolean;
  selectedIssueIdx: number;
}) {
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "critical": return { color: "text-red-400", bg: "bg-red-500/15 border-red-500/20" };
      case "major": return { color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/20" };
      default: return { color: "text-zinc-400", bg: "bg-zinc-500/15 border-zinc-500/20" };
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors duration-150 ${
      isDrilled
        ? "border-amber-500/40 bg-amber-500/[0.02]"
        : isSelected
          ? "border-violet-500/40 bg-violet-500/[0.02]"
          : "border-amber-500/10 bg-amber-500/[0.02]"
    }`}>
      <div className="flex items-center gap-3 px-5 py-3">
        <svg className="w-4 h-4 text-amber-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <span className="text-xs font-medium text-amber-400/80">Review Issues</span>
        <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO }}>{issues.length} issues</span>
        {isDrilled && (
          <span className="text-[10px] text-amber-400/80 flex items-center gap-1 ml-2">
            <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">j</kbd>
            <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">k</kbd>
          </span>
        )}
        {isSelected && !isDrilled && (
          <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400 ml-2">Enter</kbd>
        )}
      </div>

      <div className="grid grid-cols-[48px_1fr_90px] items-center gap-4 border-t border-white/[0.04] px-5 py-2" style={{ fontFamily: MONO }}>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">#</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Description</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600 text-right">Severity</span>
      </div>

      {issues.map((issue, i) => {
        const severity = getSeverityStyle(issue.severity);
        const isIssueSelected = isDrilled && i === selectedIssueIdx;
        return (
          <div key={i} className={`grid grid-cols-[48px_1fr_90px] items-center gap-4 px-5 py-2.5 transition-colors duration-150 ${
            isIssueSelected
              ? "bg-amber-500/[0.06] border-l-2 border-l-amber-500/60"
              : i % 2 === 0
                ? "bg-white/[0.01] border-l-2 border-l-transparent"
                : "bg-transparent border-l-2 border-l-transparent"
          }`}>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-[11px] font-medium text-amber-400 tabular-nums" style={{ fontFamily: MONO }}>{i + 1}</span>
            <span className="text-[12px] text-zinc-300 leading-relaxed">{issue.text}</span>
            <div className="flex justify-end">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${severity.bg} ${severity.color}`}>{issue.severity}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Log Viewer with Search & Navigation
// =============================================================================

function LogViewerPanel({
  logs,
  activeStep,
  isSelected,
  isDrilled,
  searchQuery,
  searchOpen,
  selectedLogIdx,
  onSearchChange,
}: {
  logs: LogEntry[];
  activeStep: PipelineStep;
  isSelected: boolean;
  isDrilled: boolean;
  searchQuery: string;
  searchOpen: boolean;
  selectedLogIdx: number;
  onSearchChange: (q: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    let f = logs.filter((l) => l.step === activeStep);
    if (searchQuery) {
      f = f.filter((l) => fuzzyMatch(l.text, searchQuery));
    }
    return f;
  }, [logs, activeStep, searchQuery]);

  useEffect(() => {
    if (isDrilled && scrollRef.current) {
      const el = scrollRef.current.children[selectedLogIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedLogIdx, isDrilled]);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className={`flex flex-1 flex-col overflow-hidden rounded-xl border transition-colors duration-150 ${
      isDrilled
        ? "border-amber-500/40 bg-amber-500/[0.02]"
        : isSelected
          ? "border-violet-500/40 bg-violet-500/[0.04]"
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
          <span className="ml-2 text-[11px] text-zinc-600" style={{ fontFamily: MONO }}>
            {activeStep}
          </span>
          {isDrilled && (
            <span className="text-[10px] text-amber-400/80 flex items-center gap-1 ml-2">
              <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">j</kbd>
              <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">k</kbd>
              scroll
              <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400 ml-1">/</kbd>
              search
            </span>
          )}
          {isSelected && !isDrilled && (
            <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400 ml-2">Enter to focus</kbd>
          )}
        </div>
        <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>{filtered.length} lines</span>
      </div>

      {/* Search bar (shown when searching in log mode) */}
      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/[0.04] px-4 py-2">
          <svg className="h-3.5 w-3.5 text-amber-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <span className="text-[12px] text-amber-300" style={{ fontFamily: MONO }}>{searchQuery || "type to filter..."}</span>
          <kbd className="ml-auto rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">Esc</kbd>
        </div>
      )}

      {/* Log content */}
      <div ref={scrollRef} style={{ fontFamily: MONO }} className="flex-1 overflow-y-auto p-4 text-[13px] leading-5">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            {searchQuery ? "No matching log lines" : "No output for this step yet."}
          </div>
        ) : (
          filtered.map((entry, i) => {
            const isToolUse = entry.text.startsWith("[") && /^\[(?:Read|Write|Edit|Bash|Glob|Grep)\]/.test(entry.text);
            const isLineSelected = isDrilled && i === selectedLogIdx;

            return (
              <div key={i} className={`flex gap-3 px-1 -mx-1 rounded transition-colors duration-100 ${
                isLineSelected ? "bg-amber-500/[0.08]" : ""
              }`}>
                {isDrilled && (
                  <span className={`shrink-0 select-none w-4 text-right text-[10px] tabular-nums ${
                    isLineSelected ? "text-amber-500" : "text-zinc-800"
                  }`}>{i + 1}</span>
                )}
                <span className="shrink-0 select-none text-zinc-600">{formatTime(entry.timestamp)}</span>
                {searchQuery ? (
                  <FuzzyHighlight
                    text={entry.text}
                    query={searchQuery}
                    className={entry.stream === "stderr" ? "text-red-400 whitespace-pre-wrap" : isToolUse ? "text-amber-400/80 whitespace-pre-wrap" : "text-zinc-300 whitespace-pre-wrap"}
                    highlightClass="text-amber-300 font-semibold bg-amber-500/10"
                  />
                ) : (
                  <span className={entry.stream === "stderr" ? "text-red-400 whitespace-pre-wrap" : isToolUse ? "text-amber-400/80 whitespace-pre-wrap" : "text-zinc-300 whitespace-pre-wrap"}>
                    {entry.text}
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

// =============================================================================
// Bottom Hints Bar
// =============================================================================

function BottomHintsBar({ mode, selectedSection }: { mode: NavMode; selectedSection: Section | null }) {
  const kbdViolet = "rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400";
  const kbdAmber = "rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400";
  const kbdCyan = "rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400";

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
      {/* Mode indicator */}
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        mode === "section" ? "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20" :
        mode === "step" ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" :
        mode === "log" ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" :
        "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20"
      }`}>
        {mode === "section" ? "SECTION" : mode === "step" ? "STEP" : mode === "log" ? "LOG" : "SEARCH"}
      </span>

      <span className="text-zinc-800">|</span>

      {mode === "section" && (
        <>
          <span><kbd className={kbdViolet}>j</kbd> <kbd className={kbdViolet}>k</kbd> navigate</span>
          {selectedSection?.drillable && <span><kbd className={kbdCyan}>Enter</kbd> drill in</span>}
          <span><kbd className={kbdViolet}>1</kbd>-<kbd className={kbdViolet}>6</kbd> jump to step</span>
          <span><kbd className={kbdViolet}>Esc</kbd> back</span>
        </>
      )}

      {mode === "step" && (
        <>
          <span><kbd className={kbdAmber}>j</kbd> <kbd className={kbdAmber}>k</kbd> prev/next step</span>
          <span><kbd className={kbdAmber}>1</kbd>-<kbd className={kbdAmber}>5</kbd> jump to step</span>
          <span><kbd className={kbdCyan}>Enter</kbd> view logs</span>
          <span><kbd className={kbdAmber}>Esc</kbd> back to sections</span>
        </>
      )}

      {mode === "log" && (
        <>
          <span><kbd className={kbdAmber}>j</kbd> <kbd className={kbdAmber}>k</kbd> scroll</span>
          <span><kbd className={kbdAmber}>/</kbd> search</span>
          <span><kbd className={kbdAmber}>Esc</kbd> back to steps</span>
        </>
      )}

      {mode === "search" && (
        <>
          <span>type to filter</span>
          <span><kbd className={kbdCyan}>Esc</kbd> cancel</span>
          <span><kbd className={kbdCyan}>Enter</kbd> confirm</span>
        </>
      )}

      {/* Right-aligned action hints */}
      <div className="ml-auto flex items-center gap-3">
        <span><kbd className={kbdViolet}>c</kbd> cancel</span>
        <span><kbd className={kbdViolet}>f</kbd> force merge</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Design Preview V1 — Flat Section List
// =============================================================================

export default function DesignPreviewV1() {
  const [mounted, setMounted] = useState(false);
  const [gaugeAnimated, setGaugeAnimated] = useState(false);

  // Navigation state
  const [mode, setMode] = useState<NavMode>("section");
  const [sectionIdx, setSectionIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [logIdx, setLogIdx] = useState(0);
  const [issueIdx, setIssueIdx] = useState(0);
  const [activeStep, setActiveStep] = useState<PipelineStep>("coding");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBufferRef = useRef("");

  // Section refs for scroll-into-view
  const sectionRefs = useRef<Map<SectionId, HTMLElement>>(new Map());

  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);
  useEffect(() => { const t = setTimeout(() => setGaugeAnimated(true), 300); return () => clearTimeout(t); }, []);

  // Visible sections (e.g., issues only shown when reviewing tab active)
  const visibleSections = useMemo(() => {
    return SECTIONS.filter((s) => {
      if (s.id === "issues") return activeStep === "reviewing";
      return true;
    });
  }, [activeStep]);

  // Clamp section index
  useEffect(() => {
    setSectionIdx((i) => Math.min(i, Math.max(0, visibleSections.length - 1)));
  }, [visibleSections.length]);

  const currentSection = visibleSections[sectionIdx] ?? null;

  // Scroll selected section into view
  useEffect(() => {
    if (mode !== "section") return;
    const id = currentSection?.id;
    if (!id) return;
    const el = sectionRefs.current.get(id);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sectionIdx, mode, currentSection]);

  // Filtered logs for log viewer
  const filteredLogs = useMemo(() => {
    let f = MOCK_LOGS.filter((l) => l.step === activeStep);
    if (searchQuery) f = f.filter((l) => fuzzyMatch(l.text, searchQuery));
    return f;
  }, [activeStep, searchQuery]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    // ── Search Mode ──
    if (mode === "search") {
      if (e.key === "Escape") {
        e.preventDefault();
        setSearchQuery("");
        searchBufferRef.current = "";
        setSearchOpen(false);
        setMode("log");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setSearchOpen(false);
        setMode("log");
        setLogIdx(0);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        searchBufferRef.current = searchBufferRef.current.slice(0, -1);
        setSearchQuery(searchBufferRef.current);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchBufferRef.current += e.key;
        setSearchQuery(searchBufferRef.current);
        return;
      }
      return;
    }

    // ── Log Mode ──
    if (mode === "log") {
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setLogIdx((i) => Math.min(i + 1, filteredLogs.length - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setLogIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchBufferRef.current = "";
        setSearchQuery("");
        setSearchOpen(true);
        setMode("search");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMode("step");
        return;
      }
      return;
    }

    // ── Step Mode ──
    if (mode === "step") {
      const steps = ALL_STEPS.slice(0, 5);
      if (e.key === "j" || e.key === "ArrowDown" || e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        setStepIdx((i) => {
          const next = Math.min(i + 1, steps.length - 1);
          setActiveStep(steps[next]);
          return next;
        });
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp" || e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIdx((i) => {
          const next = Math.max(i - 1, 0);
          setActiveStep(steps[next]);
          return next;
        });
        return;
      }
      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < steps.length) {
          setStepIdx(idx);
          setActiveStep(steps[idx]);
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setLogIdx(0);
        setMode("log");
        // Jump section selection to logs
        const logSectionIdx = visibleSections.findIndex((s) => s.id === "logs");
        if (logSectionIdx >= 0) setSectionIdx(logSectionIdx);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMode("section");
        return;
      }
      return;
    }

    // ── Section Mode ──
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      setSectionIdx((i) => Math.min(i + 1, visibleSections.length - 1));
      return;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      setSectionIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const section = visibleSections[sectionIdx];
      if (!section?.drillable) return;
      if (section.id === "steps") {
        setMode("step");
      } else if (section.id === "logs") {
        setLogIdx(0);
        setMode("log");
      } else if (section.id === "issues") {
        setIssueIdx(0);
        setMode("step"); // drill into issues uses a sub-mode
      }
      return;
    }
    // Number keys jump to steps from section mode too
    if (e.key >= "1" && e.key <= "6") {
      e.preventDefault();
      const steps = ALL_STEPS.slice(0, 5);
      const idx = parseInt(e.key) - 1;
      if (idx < steps.length) {
        setStepIdx(idx);
        setActiveStep(steps[idx]);
        setMode("step");
        // Jump section to steps
        const stepSectionIdx = visibleSections.findIndex((s) => s.id === "steps");
        if (stepSectionIdx >= 0) setSectionIdx(stepSectionIdx);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      // Would navigate back in real app
      return;
    }
  }, [mode, sectionIdx, visibleSections, filteredLogs.length, activeStep]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  const isSectionSelected = (id: SectionId) => mode === "section" && currentSection?.id === id;
  const isDrilled = (id: SectionId) => {
    if (id === "steps") return mode === "step";
    if (id === "logs") return mode === "log" || mode === "search";
    if (id === "issues") return false;
    return false;
  };

  const setRef = (id: SectionId) => (el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  };

  const score = 85;
  const threshold = 80;

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
        .section-selection-ring {
          position: relative;
        }
        .section-selection-ring::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          border: 2px solid rgba(139, 92, 246, 0.4);
          pointer-events: none;
          opacity: 0;
          transition: opacity 150ms;
        }
        .section-selection-ring.selected::after {
          opacity: 1;
        }
        .section-selection-ring.drilled::after {
          border-color: rgba(245, 158, 11, 0.4);
          opacity: 1;
        }
      `}</style>

      <div className={`flex h-screen flex-col bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
        {/* Header */}
        <header
          ref={setRef("header")}
          className={`sticky top-0 z-20 flex flex-wrap gap-3 items-center justify-between border-b bg-zinc-950 px-4 md:px-8 py-4 shrink-0 transition-colors duration-150 ${
            isSectionSelected("header")
              ? "border-violet-500/40 bg-violet-500/[0.02]"
              : "border-white/[0.06]"
          }`}
        >
          <div className="flex items-center gap-4">
            {/* Selection dot */}
            <div className={`h-2 w-2 rounded-full shrink-0 transition-colors duration-150 ${
              isSectionSelected("header") ? "bg-violet-400" : "bg-transparent"
            }`} />
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
              <span className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/15 px-1.5 py-0.5 rounded font-medium">v1 — Flat Section List</span>
              <span className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded" style={{ fontFamily: MONO }}>a1b2c3d4</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-emerald-500/10 ring-emerald-500/20 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                success
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500">
              Vimstyle Pipeline Detail v3
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" /></svg>
            </span>
            <button className="flex items-center gap-2 rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-950/50">
              Force Merge
              <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">f</kbd>
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50">
              Cancel
              <kbd className="rounded bg-red-500/15 border border-red-500/20 px-1 py-0.5 text-[9px] font-medium text-red-400">c</kbd>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-4 px-4 md:px-8 py-6">
            {/* Widget Grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              {/* Score Widget */}
              <div
                ref={setRef("score")}
                className={`glass-card-strong gradient-border-glow rounded-2xl overflow-hidden flex flex-col items-center justify-center p-4 transition-all duration-150 ${
                  isSectionSelected("score") ? "ring-2 ring-violet-500/40" : ""
                }`}
              >
                {isSectionSelected("score") && (
                  <div className="absolute top-2 left-2 h-2 w-2 rounded-full bg-violet-400 z-10" />
                )}
                <div className="relative flex justify-center">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[300px] h-[160px] rounded-full opacity-20 blur-[60px]" style={{ background: "radial-gradient(ellipse, #10b981 0%, transparent 70%)" }} />
                  <SemiCircleGauge score={score} threshold={threshold} animated={gaugeAnimated} />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide mt-1 bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  PASSED
                  <span className="text-zinc-600 font-normal ml-1" style={{ fontFamily: MONO }}>thr {threshold}</span>
                </span>
              </div>

              {/* Timing */}
              <div ref={setRef("timing")} className="relative">
                {isSectionSelected("timing") && (
                  <div className="absolute top-4 left-2 h-2 w-2 rounded-full bg-violet-400 z-10" />
                )}
                <TimingWidget isSelected={isSectionSelected("timing")} />
              </div>

              {/* Config */}
              <div ref={setRef("config")} className="relative">
                {isSectionSelected("config") && (
                  <div className="absolute top-4 left-2 h-2 w-2 rounded-full bg-violet-400 z-10" />
                )}
                <ConfigWidget isSelected={isSectionSelected("config")} />
              </div>

              {/* Status */}
              <div ref={setRef("status")} className="relative">
                {isSectionSelected("status") && (
                  <div className="absolute top-4 left-2 h-2 w-2 rounded-full bg-violet-400 z-10" />
                )}
                <StatusWidget status="success" isSelected={isSectionSelected("status")} />
              </div>
            </div>

            {/* Step Bar */}
            <div ref={setRef("steps")}>
              <StepBar
                isSelected={isSectionSelected("steps")}
                isDrilled={isDrilled("steps")}
                activeStep={activeStep}
                selectedStepIdx={stepIdx}
                onSelectStep={(step) => {
                  const idx = ALL_STEPS.indexOf(step);
                  if (idx >= 0) {
                    setStepIdx(idx);
                    setActiveStep(step);
                  }
                }}
              />
            </div>

            {/* Review Issues (only when reviewing) */}
            {activeStep === "reviewing" && (
              <div ref={setRef("issues")} className="mx-0">
                <ReviewIssuesPanel
                  issues={MOCK_ISSUES}
                  isSelected={isSectionSelected("issues")}
                  isDrilled={isDrilled("issues")}
                  selectedIssueIdx={issueIdx}
                />
              </div>
            )}
          </div>

          {/* Log Viewer — fills remaining space */}
          <div ref={setRef("logs")} className="px-4 md:px-8 pb-6 flex flex-col" style={{ minHeight: "400px" }}>
            <LogViewerPanel
              logs={MOCK_LOGS}
              activeStep={activeStep}
              isSelected={isSectionSelected("logs")}
              isDrilled={isDrilled("logs")}
              searchQuery={searchQuery}
              searchOpen={searchOpen}
              selectedLogIdx={logIdx}
              onSearchChange={setSearchQuery}
            />
          </div>
        </div>

        {/* Bottom Hints Bar — Sticky at viewport bottom */}
        <BottomHintsBar mode={mode} selectedSection={currentSection} />
      </div>
    </>
  );
}
