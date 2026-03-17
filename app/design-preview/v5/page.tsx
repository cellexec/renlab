"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { PipelineStep, PipelineLogEntry, PipelineStatus, StepTimings } from "../../pipelines";

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

type FocusPanel = "steps" | "logs";
type KeyboardMode = "nav" | "log-scroll" | "search";

// Mock data for design preview
const MOCK_STATUS: PipelineStatus = "reviewing";
const MOCK_CURRENT_STEP: PipelineStep = "reviewing";
const MOCK_RUN_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const MOCK_THRESHOLD = 80;
const MOCK_SCORE = 72;
const MOCK_ITERATIONS = 2;

function mockStepTimings(): StepTimings {
  const now = Date.now();
  return {
    worktree: { startedAt: now - 300000, endedAt: now - 280000 },
    "retrieving": { startedAt: now - 280000, endedAt: now - 250000 },
    "coding-1": { startedAt: now - 250000, endedAt: now - 150000 },
    "reviewing-1": { startedAt: now - 150000, endedAt: now - 140000 },
    "coding-2": { startedAt: now - 140000, endedAt: now - 60000 },
    "reviewing-2": { startedAt: now - 60000, endedAt: null },
  };
}

function mockLogs(): PipelineLogEntry[] {
  const now = Date.now();
  const logs: PipelineLogEntry[] = [];
  const steps: { step: PipelineStep; lines: string[]; offset: number; iteration?: number }[] = [
    { step: "worktree", offset: 300000, lines: [
      "Creating worktree for branch feature/auth-middleware...",
      "Worktree created at /tmp/worktrees/auth-middleware",
      "Checking out branch feature/auth-middleware",
      "Branch ready for development",
    ]},
    { step: "retrieving", offset: 280000, lines: [
      "Scanning knowledge base for relevant context...",
      "Found 12 relevant documents",
      "Retrieving specification v3 content...",
      "Context assembled: 3,240 tokens",
    ]},
    { step: "coding", offset: 250000, iteration: 1, lines: [
      "[Read] app/middleware.ts",
      "Analyzing existing authentication flow...",
      "[Edit] app/middleware.ts — adding session token validation",
      "[Write] app/lib/auth-utils.ts — new helper module",
      "[Bash] npm run typecheck",
      "Type checking passed with 0 errors",
      "[Read] app/api/auth/route.ts",
      "[Edit] app/api/auth/route.ts — updating token storage",
      "Implementation complete for iteration 1",
    ]},
    { step: "reviewing", offset: 150000, iteration: 1, lines: [
      "Starting code review for iteration 1...",
      "Analyzing diff: 4 files changed, +127 -34 lines",
      "Checking for security vulnerabilities...",
      "Issues:\n - Missing input validation on session token\n - Auth helper lacks error boundary",
      "Summary: Good progress but needs input validation",
      "Review score: 65/100",
    ]},
    { step: "coding", offset: 140000, iteration: 2, lines: [
      "[Read] app/lib/auth-utils.ts",
      "[Edit] app/lib/auth-utils.ts — adding input validation",
      "[Edit] app/middleware.ts — adding error boundary",
      "[Bash] npm run typecheck",
      "Type checking passed with 0 errors",
      "[Bash] npm run test -- --filter auth",
      "Running 8 tests... all passed",
      "Implementation complete for iteration 2",
    ]},
    { step: "reviewing", offset: 60000, iteration: 2, lines: [
      "Starting code review for iteration 2...",
      "Analyzing diff: 3 files changed, +45 -12 lines",
      "Checking for security vulnerabilities...",
      "Input validation added, error boundaries in place",
      "Reviewing test coverage...",
    ]},
  ];

  for (const { step, lines, offset, iteration } of steps) {
    lines.forEach((text, i) => {
      logs.push({
        timestamp: now - offset + i * 3000,
        step,
        stream: text.includes("error") || text.includes("Error") ? "stderr" : "stdout",
        text,
        toolCallId: text.startsWith("[") && text.includes("]") ? `tool-${i}-end` : undefined,
        iteration: iteration ?? 1,
      });
    });
  }

  return logs;
}

// =============================================================================
// Fuzzy helpers
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

// =============================================================================
// Helper Components
// =============================================================================

function formatStepDuration(startedAt: number, endedAt: number | null): string {
  const elapsed = (endedAt ?? Date.now()) - startedAt;
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getStepState(step: PipelineStep, currentStep: PipelineStep | null, status: PipelineStatus): "complete" | "active" | "failed" | "pending" {
  const stepIdx = ALL_STEPS.indexOf(step);
  const currentIdx = currentStep ? ALL_STEPS.indexOf(currentStep) : -1;
  if (status === "success") return "complete";
  if (status === "failed" || status === "cancelled" || status === "rejected") {
    if (stepIdx < currentIdx) return "complete";
    if (stepIdx === currentIdx) return "failed";
    return "pending";
  }
  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

const STEP_ICONS: Record<string, (cls: string) => React.ReactNode> = {
  worktree: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" />
    </svg>
  ),
  retrieving: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  coding: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  reviewing: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  merging: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  updating: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644V14.652" />
    </svg>
  ),
};

// =============================================================================
// Semi-Circle Score Gauge
// =============================================================================

function SemiCircleGauge({ score, threshold }: { score: number; threshold: number }) {
  const width = 200;
  const height = 115;
  const cx = width / 2;
  const cy = 100;
  const radius = 75;
  const strokeW = 10;
  const semiCircumference = Math.PI * radius;
  const scoreRatio = Math.min(score / 100, 1);
  const scoreArc = semiCircumference * scoreRatio;
  const scoreOffset = semiCircumference - scoreArc;
  const passed = score >= threshold;
  const scoreColor = passed ? "#10b981" : "#ef4444";

  const thresholdRatio = threshold / 100;
  const thresholdAngle = Math.PI * (1 - thresholdRatio);
  const tx = cx + radius * Math.cos(thresholdAngle);
  const ty = cy - radius * Math.sin(thresholdAngle);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW} strokeLinecap="round"
      />
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none" stroke={scoreColor} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={semiCircumference} strokeDashoffset={scoreOffset}
        style={{ transition: "stroke-dashoffset 1s ease-out" }}
      />
      <circle cx={tx} cy={ty} r={3} fill="rgba(255,255,255,0.4)" />
      <text x={cx} y={cy - 20} textAnchor="middle" fill={scoreColor} fontSize={28} fontWeight={700} fontFamily={MONO}>
        {score}
      </text>
      <text x={cx} y={cy - 2} textAnchor="middle" fill="rgba(161,161,170,0.6)" fontSize={10} fontFamily={MONO}>
        / 100
      </text>
    </svg>
  );
}

// =============================================================================
// Timing Widget (compact)
// =============================================================================

function TimingWidgetCompact({ createdAt, isActive }: { createdAt: string; isActive: boolean }) {
  const created = new Date(createdAt);
  const elapsed = useMemo(() => {
    const ms = Date.now() - created.getTime();
    const secs = Math.round(ms / 1000);
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    if (mins === 0) return `${rem}s`;
    return `${mins}m ${rem}s`;
  }, [created]);

  return (
    <div className="flex items-center gap-4 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="text-zinc-600">Started</span>
        <span className="text-zinc-400 font-mono">{created.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-zinc-600">Elapsed</span>
        <span className={`font-mono ${isActive ? "text-amber-400" : "text-zinc-400"}`}>{elapsed}</span>
        {isActive && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />}
      </div>
    </div>
  );
}

// =============================================================================
// Status Widget (compact inline)
// =============================================================================

function StatusBadgeInline({ status }: { status: PipelineStatus }) {
  const cfg: Record<string, { dot: string; text: string; bg: string }> = {
    success: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 ring-emerald-500/20" },
    failed: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 ring-red-500/20" },
    cancelled: { dot: "bg-zinc-400", text: "text-zinc-400", bg: "bg-zinc-500/10 ring-zinc-500/20" },
    rejected: { dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/10 ring-amber-500/20" },
  };
  const c = cfg[status] ?? { dot: "bg-amber-400 animate-pulse", text: "text-amber-400", bg: "bg-amber-500/10 ring-amber-500/20" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

// =============================================================================
// Kbd helper
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
// Log Viewer with search & keyboard scroll
// =============================================================================

function LogPanel({
  logs,
  step,
  selectedIteration,
  isFocused,
  searchQuery,
  scrollIndex,
}: {
  logs: PipelineLogEntry[];
  step: PipelineStep;
  selectedIteration?: number;
  isFocused: boolean;
  searchQuery: string;
  scrollIndex: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const filtered = useMemo(() => {
    let result = logs.filter((l) => {
      if (l.step !== step) return false;
      if (selectedIteration != null && (step === "coding" || step === "reviewing")) return (l.iteration ?? 1) === selectedIteration;
      return true;
    });
    if (searchQuery) {
      result = result.filter((l) => fuzzyMatch(l.text, searchQuery));
    }
    return result;
  }, [logs, step, selectedIteration, searchQuery]);

  // Auto-scroll to selected line when keyboard-navigating
  useEffect(() => {
    if (!isFocused || scrollIndex < 0) return;
    const el = lineRefs.current.get(scrollIndex);
    el?.scrollIntoView({ block: "nearest" });
  }, [scrollIndex, isFocused]);

  // Auto-scroll to bottom when new logs arrive (only when not focused)
  useEffect(() => {
    if (isFocused) return;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [filtered.length, isFocused]);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div ref={scrollRef} style={{ fontFamily: MONO }} className="flex-1 overflow-y-auto p-3 text-[12px] leading-5">
      {filtered.length === 0 ? (
        <div className="flex h-full items-center justify-center text-zinc-600 text-[13px]">
          {searchQuery ? "No matching log lines" : "No output for this step yet."}
        </div>
      ) : (
        filtered.map((entry, i) => {
          const isToolUse = entry.stream === "stdout" && /^\[(?:Read|Write|Edit|Bash|Glob|Grep|Task)\]/.test(entry.text);
          const isSelected = isFocused && i === scrollIndex;
          return (
            <div
              key={i}
              ref={(el) => { if (el) lineRefs.current.set(i, el); }}
              className={`flex gap-3 px-1 rounded transition-colors duration-100 ${
                isSelected
                  ? "bg-amber-500/[0.08] border-l-2 border-l-amber-500/60 -ml-[2px]"
                  : "border-l-2 border-l-transparent"
              }`}
            >
              <span className="shrink-0 select-none text-zinc-700 tabular-nums">{formatTime(entry.timestamp)}</span>
              <span className={
                entry.stream === "stderr" ? "text-red-400 whitespace-pre-wrap" :
                isToolUse ? "text-amber-400/80 whitespace-pre-wrap" :
                "text-zinc-300 whitespace-pre-wrap"
              }>{entry.text}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// =============================================================================
// Review Issues (compact collapsible)
// =============================================================================

function ReviewIssuesBanner({ issues, summary }: { issues: string[]; summary?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-amber-500/10 bg-amber-500/[0.02]">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors">
        <svg className="w-3.5 h-3.5 text-amber-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        <span className="text-[11px] font-medium text-amber-400/80">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>
        {summary && <span className="text-[10px] text-zinc-600 truncate flex-1">{summary}</span>}
        <svg className={`w-3.5 h-3.5 text-zinc-600 shrink-0 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-amber-400/60 font-mono shrink-0">{i + 1}.</span>
              <span className="text-zinc-400">{issue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Page — Two-Panel Split
// =============================================================================

export default function DesignPreviewV5() {
  const [mounted, setMounted] = useState(false);
  const [activeStep, setActiveStep] = useState<PipelineStep>(MOCK_CURRENT_STEP);
  const [focusPanel, setFocusPanel] = useState<FocusPanel>("steps");
  const [mode, setMode] = useState<KeyboardMode>("nav");
  const [stepIndex, setStepIndex] = useState(ALL_STEPS.indexOf(MOCK_CURRENT_STEP));
  const [logScrollIndex, setLogScrollIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const stepListRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Mock data
  const logs = useMemo(() => mockLogs(), []);
  const stepTimings = useMemo(() => mockStepTimings(), []);
  const status = MOCK_STATUS;
  const currentStep = MOCK_CURRENT_STEP;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Tick for active timers
  useEffect(() => {
    const hasActive = Object.values(stepTimings).some((t) => t.endedAt == null);
    if (!hasActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [stepTimings]);

  // Get log count for active step
  const activeStepLogs = useMemo(() => {
    return logs.filter((l) => l.step === activeStep);
  }, [logs, activeStep]);

  // Review details for reviewing step
  const reviewDetails = useMemo(() => {
    const reviewLogs = logs.filter((l) => l.step === "reviewing" && l.stream === "stdout" && (l.iteration ?? 1) === MOCK_ITERATIONS);
    let summary: string | undefined;
    let issues: string[] | undefined;
    for (const log of reviewLogs) {
      if (log.text.startsWith("Summary: ")) summary = log.text.replace("Summary: ", "");
      if (log.text.startsWith("Issues:")) {
        issues = log.text.replace("Issues:\n", "").split("\n").map((l) => l.replace(/^\s+-\s*/, "").trim()).filter(Boolean);
      }
    }
    return { summary, issues };
  }, [logs]);

  // Step timing for a given step
  const getTimingForStep = useCallback((step: PipelineStep, iter?: number): { startedAt: number; endedAt: number | null } | undefined => {
    if (step === "coding" || step === "reviewing") {
      const iterKey = `${step}-${iter ?? MOCK_ITERATIONS}`;
      if (stepTimings[iterKey]) return stepTimings[iterKey];
    }
    return stepTimings[step];
  }, [stepTimings]);

  // Sync activeStep from stepIndex
  useEffect(() => {
    setActiveStep(ALL_STEPS[stepIndex]);
    setLogScrollIndex(-1);
  }, [stepIndex]);

  // Scroll selected step into view
  useEffect(() => {
    if (focusPanel !== "steps" || !stepListRef.current) return;
    const el = stepListRef.current.children[stepIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [stepIndex, focusPanel]);

  // ==========================================================================
  // Keyboard handler
  // ==========================================================================

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't interfere with search input
      if (searchOpen && document.activeElement === searchRef.current) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (searchQuery) {
            setSearchQuery("");
          } else {
            setSearchOpen(false);
            setMode("log-scroll");
            searchRef.current?.blur();
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          setSearchOpen(false);
          setMode("log-scroll");
          searchRef.current?.blur();
        }
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Number keys 1-6 jump to steps
      const num = parseInt(e.key);
      if (num >= 1 && num <= ALL_STEPS.length) {
        e.preventDefault();
        setStepIndex(num - 1);
        setFocusPanel("steps");
        setMode("nav");
        return;
      }

      // Tab switches panels
      if (e.key === "Tab") {
        e.preventDefault();
        if (focusPanel === "steps") {
          setFocusPanel("logs");
          setMode("log-scroll");
          setLogScrollIndex(0);
        } else {
          setFocusPanel("steps");
          setMode("nav");
          setLogScrollIndex(-1);
        }
        return;
      }

      // In step navigation mode
      if (focusPanel === "steps" && mode === "nav") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setStepIndex((i) => Math.min(i + 1, ALL_STEPS.length - 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setStepIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" || e.key === "l" || e.key === "ArrowRight") {
          e.preventDefault();
          setFocusPanel("logs");
          setMode("log-scroll");
          setLogScrollIndex(0);
        } else if (e.key === "Escape") {
          e.preventDefault();
          // Would go back in real app
        }
        return;
      }

      // In log scroll mode
      if (focusPanel === "logs" && mode === "log-scroll") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setLogScrollIndex((i) => Math.min(i + 1, activeStepLogs.length - 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setLogScrollIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setSearchOpen(true);
          setMode("search");
          requestAnimationFrame(() => searchRef.current?.focus());
        } else if (e.key === "g") {
          e.preventDefault();
          setLogScrollIndex(0);
        } else if (e.key === "G") {
          e.preventDefault();
          setLogScrollIndex(activeStepLogs.length - 1);
        } else if (e.key === "Escape" || e.key === "h" || e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusPanel("steps");
          setMode("nav");
          setLogScrollIndex(-1);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [focusPanel, mode, searchOpen, searchQuery, activeStepLogs.length, stepIndex]);

  // Mode label for hints bar
  const modeLabel = useMemo(() => {
    if (mode === "search") return "SEARCH";
    if (focusPanel === "steps") return "STEPS";
    return "LOGS";
  }, [mode, focusPanel]);

  const modeColor = useMemo(() => {
    if (focusPanel === "logs") return "text-amber-400";
    return "text-violet-400";
  }, [focusPanel]);

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in-up { opacity: 0; animation: fadeInUp 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      <div className={`flex h-full flex-col text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
        {/* Header */}
        <header className="shrink-0 flex flex-wrap gap-3 items-center justify-between border-b border-white/[0.06] bg-zinc-950 px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            </button>
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
              <span className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/15 px-1.5 py-0.5 rounded font-medium">v5 Two-Panel</span>
              <span className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded font-mono">{MOCK_RUN_ID.slice(0, 8)}</span>
              <StatusBadgeInline status={status} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TimingWidgetCompact createdAt={new Date(Date.now() - 300000).toISOString()} isActive={true} />
            <span className="text-[11px] text-zinc-600 font-mono">iter {MOCK_ITERATIONS}/{MOCK_ITERATIONS + 1}</span>
            <button className="flex items-center gap-2 rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/50">
              Cancel <Kbd variant="amber">c</Kbd>
            </button>
          </div>
        </header>

        {/* Info bar — score + config (compact, non-navigable) */}
        <div className="shrink-0 border-b border-white/[0.06] bg-zinc-950/80 px-4 md:px-6 py-3 fade-in-up" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center gap-6">
            {/* Score gauge (compact) */}
            <div className="flex items-center gap-3">
              <SemiCircleGauge score={MOCK_SCORE} threshold={MOCK_THRESHOLD} />
              <div className="flex flex-col gap-1">
                <span className={`text-[11px] font-semibold ${MOCK_SCORE >= MOCK_THRESHOLD ? "text-emerald-400" : "text-red-400"}`}>
                  {MOCK_SCORE >= MOCK_THRESHOLD ? "PASSED" : "BELOW THRESHOLD"}
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">thr {MOCK_THRESHOLD}</span>
              </div>
            </div>

            <div className="h-8 w-px bg-white/[0.06]" />

            {/* Config details */}
            <div className="flex items-center gap-5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">Branch</span>
                <span className="text-zinc-400 font-mono text-[10px] bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.5 rounded">feature/auth-middleware</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">Spec</span>
                <span className="text-zinc-400">Auth Middleware v3</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">Knowledge</span>
                <span className="inline-flex items-center gap-1 text-emerald-400/80">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  Yes
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main content — Two-Panel Split */}
        <div className="flex flex-1 min-h-0 overflow-hidden px-4 md:px-6 py-4 gap-4 fade-in-up" style={{ animationDelay: "120ms" }}>
          {/* Left panel — Step list */}
          <div className={`w-72 shrink-0 flex flex-col min-h-0 rounded-xl border-2 overflow-hidden transition-colors duration-150 ${
            focusPanel === "steps"
              ? "border-violet-500/30 bg-zinc-950/80"
              : "border-white/[0.08] bg-zinc-950/60"
          }`}>
            {/* Panel header */}
            <div className="shrink-0 border-b border-white/[0.06] px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Steps</span>
                {focusPanel === "steps" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                )}
              </div>
              <div className="flex items-center gap-1">
                {ALL_STEPS.map((_, i) => (
                  <span key={i} className="text-[9px] font-mono text-zinc-700">{i + 1}</span>
                ))}
              </div>
            </div>

            {/* Step list */}
            <div ref={stepListRef} className="flex-1 overflow-y-auto min-h-0">
              {ALL_STEPS.map((step, i) => {
                const state = getStepState(step, currentStep, status);
                const timing = getTimingForStep(step);
                const logCount = logs.filter((l) => l.step === step).length;
                const isSelected = focusPanel === "steps" && i === stepIndex;

                const stateColor = {
                  complete: "text-emerald-400",
                  active: "text-amber-400",
                  failed: "text-red-400",
                  pending: "text-zinc-600",
                }[state];

                const stateDot = {
                  complete: "bg-emerald-400",
                  active: "bg-amber-400 animate-pulse",
                  failed: "bg-red-400",
                  pending: "bg-zinc-700",
                }[state];

                const stateIcon = {
                  complete: (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  ),
                  active: (
                    <svg className="w-3.5 h-3.5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ),
                  failed: (
                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  ),
                  pending: (
                    <div className={`w-2 h-2 rounded-full ${stateDot}`} />
                  ),
                }[state];

                return (
                  <div
                    key={step}
                    onClick={() => { setStepIndex(i); setFocusPanel("steps"); setMode("nav"); }}
                    className={`px-3 py-3 transition-colors duration-150 cursor-pointer border-b border-white/[0.04] ${
                      isSelected
                        ? "bg-violet-500/[0.06] border-l-2 border-l-violet-500/60"
                        : activeStep === step && focusPanel === "logs"
                          ? "bg-amber-500/[0.04] border-l-2 border-l-amber-500/40"
                          : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Selection dot */}
                      <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150 ${
                        isSelected ? "bg-violet-400" : activeStep === step && focusPanel === "logs" ? "bg-amber-400" : "bg-transparent"
                      }`} />

                      {/* Step icon */}
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        state === "complete" ? "bg-emerald-500/10" :
                        state === "active" ? "bg-amber-500/10" :
                        state === "failed" ? "bg-red-500/10" :
                        "bg-white/[0.03]"
                      }`}>
                        {stateIcon}
                      </div>

                      {/* Step info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-medium ${state === "pending" ? "text-zinc-600" : "text-zinc-200"}`}>
                            {STEP_LABELS[step]}
                          </span>
                          {isSelected && (
                            <Kbd variant="dynamic">Enter</Kbd>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {timing ? (
                            <span className={`text-[10px] font-mono ${stateColor}`}>
                              {formatStepDuration(timing.startedAt, timing.endedAt)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-zinc-700">--:--</span>
                          )}
                          <span className="text-[10px] text-zinc-700 font-mono">{logCount} lines</span>
                        </div>
                      </div>

                      {/* Number key hint */}
                      <span className="text-[9px] font-mono text-zinc-700">{i + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel — Log viewer */}
          <div className={`flex-1 flex flex-col min-h-0 rounded-xl border-2 overflow-hidden transition-colors duration-150 ${
            focusPanel === "logs"
              ? "border-amber-500/30 bg-zinc-950/80"
              : "border-white/[0.08] bg-zinc-950/60"
          }`}>
            {/* Log header */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
              <div className="flex items-center gap-2">
                {/* Traffic light dots */}
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
                </div>
                <span className="ml-1.5 text-[11px] text-zinc-500" style={{ fontFamily: MONO }}>
                  {STEP_LABELS[activeStep]}
                  {getTimingForStep(activeStep) ? ` — ${formatStepDuration(getTimingForStep(activeStep)!.startedAt, getTimingForStep(activeStep)!.endedAt)}` : ""}
                </span>
                {focusPanel === "logs" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Search input (visible when search mode) */}
                {searchOpen && (
                  <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-1">
                    <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter logs…"
                      className="bg-transparent text-[11px] text-zinc-200 placeholder-zinc-600 outline-none w-32"
                    />
                  </div>
                )}
                {!searchOpen && focusPanel === "logs" && (
                  <Kbd>/</Kbd>
                )}
                <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
                  {activeStepLogs.length} lines
                </span>
              </div>
            </div>

            {/* Review issues banner (when on reviewing step) */}
            {activeStep === "reviewing" && reviewDetails.issues && reviewDetails.issues.length > 0 && (
              <ReviewIssuesBanner issues={reviewDetails.issues} summary={reviewDetails.summary} />
            )}

            {/* Log content */}
            <LogPanel
              logs={logs}
              step={activeStep}
              selectedIteration={MOCK_ITERATIONS}
              isFocused={focusPanel === "logs" && mode === "log-scroll"}
              searchQuery={searchQuery}
              scrollIndex={logScrollIndex}
            />
          </div>
        </div>

        {/* Bottom hints bar */}
        <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-4 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
          {/* Mode indicator */}
          <span className={`font-semibold text-[10px] uppercase tracking-wider ${modeColor}`}>
            {modeLabel}
          </span>
          <div className="h-3 w-px bg-white/[0.08]" />

          {/* Contextual hints */}
          {mode === "nav" && focusPanel === "steps" && (
            <>
              <span><Kbd>j</Kbd> <Kbd>k</Kbd> navigate</span>
              <span><Kbd>Enter</Kbd> view logs</span>
              <span><Kbd variant="dynamic">1</Kbd>–<Kbd variant="dynamic">6</Kbd> jump to step</span>
              <span><Kbd>Tab</Kbd> switch panel</span>
              <span><Kbd>Esc</Kbd> back</span>
            </>
          )}
          {mode === "log-scroll" && focusPanel === "logs" && (
            <>
              <span><Kbd variant="amber">j</Kbd> <Kbd variant="amber">k</Kbd> scroll</span>
              <span><Kbd variant="amber">/</Kbd> filter</span>
              <span><Kbd variant="amber">g</Kbd> top <Kbd variant="amber">G</Kbd> bottom</span>
              <span><Kbd>Esc</Kbd> back to steps</span>
              <span><Kbd>Tab</Kbd> switch panel</span>
              <span><Kbd variant="dynamic">1</Kbd>–<Kbd variant="dynamic">6</Kbd> jump to step</span>
            </>
          )}
          {mode === "search" && (
            <>
              <span><Kbd variant="dynamic">Enter</Kbd> confirm</span>
              <span><Kbd variant="dynamic">Esc</Kbd> clear</span>
            </>
          )}

          {/* Right-aligned action hints */}
          <div className="ml-auto flex items-center gap-3">
            <span><Kbd variant="amber">c</Kbd> cancel</span>
            <span><Kbd variant="amber">f</Kbd> force merge</span>
          </div>
        </div>
      </div>
    </>
  );
}
