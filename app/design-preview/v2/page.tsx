"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// =============================================================================
// Types & Constants
// =============================================================================

type PipelineStep = "worktree" | "retrieving" | "coding" | "reviewing" | "merging" | "updating";
type PipelineStatus = "pending" | "worktree" | "retrieving" | "coding" | "reviewing" | "merging" | "updating" | "success" | "failed" | "cancelled" | "rejected";

interface LogEntry {
  timestamp: number;
  step: PipelineStep;
  stream: "stdout" | "stderr";
  text: string;
  toolCallId?: string;
  iteration?: number;
}

const ALL_STEPS: PipelineStep[] = ["worktree", "retrieving", "coding", "reviewing", "merging", "updating"];
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

// =============================================================================
// Navigation Modes
// =============================================================================

type NavMode = "section" | "step" | "log" | "search";

interface Section {
  id: string;
  label: string;
  type: "widget" | "steps" | "issues" | "log";
  drillable: boolean;
}

const SECTIONS: Section[] = [
  { id: "status", label: "Status", type: "widget", drillable: false },
  { id: "timing", label: "Timing", type: "widget", drillable: false },
  { id: "config", label: "Configuration", type: "widget", drillable: false },
  { id: "score", label: "Review Score", type: "widget", drillable: false },
  { id: "steps", label: "Pipeline Steps", type: "steps", drillable: true },
  { id: "issues", label: "Review Issues", type: "issues", drillable: true },
  { id: "log", label: "Log Viewer", type: "log", drillable: true },
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

// =============================================================================
// Mock Data
// =============================================================================

function generateMockLogs(): LogEntry[] {
  const base = Date.now() - 180_000;
  const logs: LogEntry[] = [];
  const steps: { step: PipelineStep; messages: string[] }[] = [
    { step: "worktree", messages: [
      "Creating worktree from branch main...",
      "Worktree created at /tmp/pipeline-abc123",
      "Checking out branch pipeline/spec-42-v3",
      "Branch ready for modifications",
    ]},
    { step: "retrieving", messages: [
      "Fetching knowledge base documents...",
      "Retrieved 12 relevant documents",
      "Indexing context for specification",
      "Knowledge retrieval complete — 48KB context",
    ]},
    { step: "coding", messages: [
      "[Read] src/components/Header.tsx",
      "Analyzing component structure...",
      "[Edit] src/components/Header.tsx — added responsive nav",
      "[Write] src/components/MobileMenu.tsx — new component",
      "[Bash] npm run typecheck — passed",
      "[Read] src/styles/globals.css",
      "[Edit] src/styles/globals.css — added mobile breakpoints",
      "Implementing requested changes...",
      "[Bash] npm run lint — 0 warnings",
      "All modifications applied successfully",
    ]},
    { step: "reviewing", messages: [
      "Starting automated review...",
      "Analyzing code quality metrics...",
      "Checking for security vulnerabilities...",
      "Summary: Clean implementation with good test coverage",
      "Issues:",
      " - Minor: Consider adding aria-label to mobile menu button",
      " - Minor: CSS could use logical properties for RTL support",
      "Review score: 87/100",
    ]},
    { step: "merging", messages: [
      "Preparing merge into main...",
      "Running pre-merge checks...",
      "All checks passed",
      "Merge commit created: abc1234",
      "Branch merged successfully",
    ]},
    { step: "updating", messages: [
      "Cleaning up worktree...",
      "Updating pipeline status...",
      "Pipeline complete",
    ]},
  ];

  let offset = 0;
  for (const group of steps) {
    for (const msg of group.messages) {
      logs.push({
        timestamp: base + offset,
        step: group.step,
        stream: msg.includes("error") || msg.includes("Error") ? "stderr" : "stdout",
        text: msg,
        iteration: group.step === "coding" || group.step === "reviewing" ? 1 : undefined,
      });
      offset += 2000 + Math.random() * 3000;
    }
  }
  return logs;
}

const MOCK_LOGS = generateMockLogs();

const MOCK_ISSUES = [
  "Minor: Consider adding aria-label to mobile menu button",
  "Minor: CSS could use logical properties for RTL support",
];

// =============================================================================
// Kbd Component
// =============================================================================

function Kbd({ children, variant = "static" }: { children: React.ReactNode; variant?: "static" | "dynamic" | "amber" }) {
  const styles = {
    static: "bg-violet-500/15 border-violet-500/20 text-violet-400",
    dynamic: "bg-cyan-500/15 border-cyan-500/20 text-cyan-400",
    amber: "bg-amber-500/15 border-amber-500/20 text-amber-400",
  };
  return (
    <kbd className={`rounded border px-1 py-0.5 text-[9px] font-medium ${styles[variant]}`}>
      {children}
    </kbd>
  );
}

// =============================================================================
// Semi-Circle Gauge
// =============================================================================

function SemiCircleGauge({ score, threshold }: { score: number; threshold: number }) {
  const width = 280;
  const height = 155;
  const cx = width / 2;
  const cy = 140;
  const radius = 100;
  const strokeW = 12;
  const semiCircumference = Math.PI * radius;
  const scoreRatio = Math.min(score / 100, 1);
  const scoreArc = semiCircumference * scoreRatio;
  const scoreOffset = semiCircumference - scoreArc;
  const passed = score >= threshold;
  const scoreColor = passed ? "#10b981" : "#ef4444";

  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[280px] overflow-visible" preserveAspectRatio="xMidYMax meet">
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW} strokeLinecap="round" />
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke={scoreColor} strokeWidth={strokeW} strokeLinecap="round" strokeDasharray={semiCircumference} strokeDashoffset={scoreOffset} style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
      </svg>
      <div className="absolute" style={{ bottom: "6px", left: "50%", transform: "translateX(-50%)" }}>
        <span className="text-3xl font-bold tabular-nums tracking-tighter" style={{ color: scoreColor, fontFamily: MONO }}>{score}</span>
        <span className="text-[10px] text-zinc-500 ml-1">/ 100</span>
      </div>
    </div>
  );
}

// =============================================================================
// Widget Section Components
// =============================================================================

function StatusSection({ isSelected }: { isSelected: boolean }) {
  const status: PipelineStatus = "success";
  return (
    <SectionRow id="status" label="Status" isSelected={isSelected} drillable={false}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <svg className="h-4.5 w-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <span className="text-sm font-semibold text-emerald-400">Success</span>
          <span className="text-[11px] text-zinc-600 ml-3" style={{ fontFamily: MONO }}>completed 3m 12s ago</span>
        </div>
      </div>
    </SectionRow>
  );
}

function TimingSection({ isSelected }: { isSelected: boolean }) {
  return (
    <SectionRow id="timing" label="Timing" isSelected={isSelected} drillable={false}>
      <div className="flex gap-8 text-sm" style={{ fontFamily: MONO }}>
        <div>
          <span className="text-[10px] text-zinc-600 block mb-0.5">Created</span>
          <span className="text-zinc-300 tabular-nums">Mar 17, 14:32</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-600 block mb-0.5">Finished</span>
          <span className="text-zinc-300 tabular-nums">Mar 17, 14:35</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-600 block mb-0.5">Duration</span>
          <span className="text-zinc-300 tabular-nums">3m 12s</span>
        </div>
      </div>
    </SectionRow>
  );
}

function ConfigSection({ isSelected }: { isSelected: boolean }) {
  return (
    <SectionRow id="config" label="Configuration" isSelected={isSelected} drillable={false}>
      <div className="flex gap-8 text-sm" style={{ fontFamily: MONO }}>
        <div>
          <span className="text-[10px] text-zinc-600 block mb-0.5">Branch</span>
          <span className="text-cyan-400/80 tabular-nums">pipeline/spec-42-v3</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-600 block mb-0.5">Iterations</span>
          <span className="text-zinc-300 tabular-nums">1 / 3</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-600 block mb-0.5">Specification</span>
          <span className="text-violet-400/80 tabular-nums">Add responsive nav v3</span>
        </div>
      </div>
    </SectionRow>
  );
}

function ScoreSection({ isSelected }: { isSelected: boolean }) {
  return (
    <SectionRow id="score" label="Review Score" isSelected={isSelected} drillable={false}>
      <div className="flex items-center gap-6">
        <div className="w-[200px]">
          <SemiCircleGauge score={87} threshold={80} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            PASSED
          </span>
          <span className="text-[11px] text-zinc-600" style={{ fontFamily: MONO }}>threshold: 80</span>
        </div>
      </div>
    </SectionRow>
  );
}

// =============================================================================
// Section Row — the core navigable element
// =============================================================================

function SectionRow({
  id,
  label,
  isSelected,
  isActive,
  drillable,
  children,
}: {
  id: string;
  label: string;
  isSelected: boolean;
  isActive?: boolean;
  drillable: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-section-id={id}
      className={`border-b border-white/[0.04] px-5 py-4 transition-colors duration-150 ${
        isActive
          ? "bg-amber-500/[0.06] border-l-2 border-l-amber-500/60"
          : isSelected
            ? "bg-violet-500/[0.04] border-l-2 border-l-violet-500/60"
            : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Selection dot */}
        <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150 ${
          isActive ? "bg-amber-400" : isSelected ? "bg-violet-400" : "bg-transparent"
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">{label}</span>
            {isSelected && drillable && (
              <Kbd variant="dynamic">Enter</Kbd>
            )}
            {isActive && (
              <Kbd variant="amber">Esc to exit</Kbd>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Step List (drillable section)
// =============================================================================

const STEP_LABELS: Record<PipelineStep, string> = {
  worktree: "Worktree",
  retrieving: "Retrieving",
  coding: "Coding",
  reviewing: "Reviewing",
  merging: "Merging",
  updating: "Updating",
};

const STEP_TIMINGS: Record<PipelineStep, string> = {
  worktree: "4s",
  retrieving: "12s",
  coding: "1m 48s",
  reviewing: "32s",
  merging: "28s",
  updating: "8s",
};

function StepListSection({
  isSelected,
  isActive,
  selectedStepIndex,
  activeStep,
}: {
  isSelected: boolean;
  isActive: boolean;
  selectedStepIndex: number;
  activeStep: PipelineStep;
}) {
  return (
    <SectionRow id="steps" label="Pipeline Steps" isSelected={isSelected} isActive={isActive} drillable>
      <div className="flex flex-col gap-0">
        {ALL_STEPS.map((step, i) => {
          const isStepSelected = isActive && i === selectedStepIndex;
          const isCurrentActiveStep = step === activeStep;
          return (
            <div
              key={step}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 ${
                isStepSelected
                  ? "bg-violet-500/[0.06] ring-1 ring-violet-500/20"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              {/* Step number */}
              <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-medium tabular-nums shrink-0 ${
                isStepSelected
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "bg-white/[0.04] text-zinc-600 border border-white/[0.06]"
              }`} style={{ fontFamily: MONO }}>
                {i + 1}
              </span>

              {/* Step icon + name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <StepIcon step={step} state="complete" />
                <span className={`text-sm ${isStepSelected ? "text-zinc-200" : "text-zinc-400"}`}>
                  {STEP_LABELS[step]}
                </span>
                {isCurrentActiveStep && (
                  <span className="text-[10px] text-amber-400/60 ml-1">current</span>
                )}
              </div>

              {/* Timing */}
              <span className="text-[11px] text-zinc-600 tabular-nums shrink-0" style={{ fontFamily: MONO }}>
                {STEP_TIMINGS[step]}
              </span>

              {/* Status dot */}
              <div className="h-2 w-2 rounded-full bg-emerald-400/60 shrink-0" />

              {/* Number key hint */}
              {isActive && (
                <Kbd variant="static">{i + 1}</Kbd>
              )}
            </div>
          );
        })}
      </div>
    </SectionRow>
  );
}

function StepIcon({ step, state }: { step: PipelineStep; state: "complete" | "active" | "failed" | "pending" }) {
  const color = state === "complete" ? "text-emerald-400/70" : state === "active" ? "text-amber-400/70" : state === "failed" ? "text-red-400/70" : "text-zinc-600";
  const cls = `h-4 w-4 ${color}`;
  const icons: Record<PipelineStep, React.ReactNode> = {
    worktree: <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>,
    retrieving: <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>,
    coding: <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>,
    reviewing: <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
    merging: <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
    updating: <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" /></svg>,
  };
  return icons[step] ?? null;
}

// =============================================================================
// Review Issues Section (drillable)
// =============================================================================

function IssuesSection({
  isSelected,
  isActive,
  selectedIssueIndex,
}: {
  isSelected: boolean;
  isActive: boolean;
  selectedIssueIndex: number;
}) {
  return (
    <SectionRow id="issues" label="Review Issues" isSelected={isSelected} isActive={isActive} drillable>
      <div className="flex flex-col gap-0">
        {MOCK_ISSUES.map((issue, i) => {
          const isIssueSelected = isActive && i === selectedIssueIndex;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 ${
                isIssueSelected ? "bg-violet-500/[0.06] ring-1 ring-violet-500/20" : ""
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-[11px] font-medium text-amber-400 tabular-nums shrink-0" style={{ fontFamily: MONO }}>
                {i + 1}
              </span>
              <span className="text-[12px] text-zinc-300 flex-1">{issue}</span>
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-zinc-500/15 border-zinc-500/20 text-zinc-400">
                minor
              </span>
            </div>
          );
        })}
      </div>
    </SectionRow>
  );
}

// =============================================================================
// Log Viewer Section (drillable, with search)
// =============================================================================

function LogSection({
  isSelected,
  isActive,
  activeStep,
  searchQuery,
  searchMode,
  logScrollIndex,
}: {
  isSelected: boolean;
  isActive: boolean;
  activeStep: PipelineStep;
  searchQuery: string;
  searchMode: boolean;
  logScrollIndex: number;
}) {
  const stepLogs = MOCK_LOGS.filter((l) => l.step === activeStep);
  const filteredLogs = searchQuery
    ? stepLogs.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : stepLogs;
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <SectionRow id="log" label={`Log Viewer — ${STEP_LABELS[activeStep]}`} isSelected={isSelected} isActive={isActive} drillable>
      {/* Search bar within log */}
      {isActive && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <svg className="h-3.5 w-3.5 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {searchMode ? (
            <span className="text-[11px] text-amber-400">filtering...</span>
          ) : (
            <span className="text-[11px] text-zinc-600">
              <Kbd variant="static">/</Kbd>
              <span className="ml-1">filter logs</span>
            </span>
          )}
          {searchQuery && (
            <span className="text-[11px] text-violet-400" style={{ fontFamily: MONO }}>
              &quot;{searchQuery}&quot;
              <span className="text-zinc-600 ml-2">{filteredLogs.length} match{filteredLogs.length !== 1 ? "es" : ""}</span>
            </span>
          )}
        </div>
      )}

      {/* Log terminal */}
      <div className="rounded-lg border border-white/[0.06] bg-zinc-950/80 overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO }}>
            {filteredLogs.length} lines
          </span>
        </div>

        {/* Log lines */}
        <div className="max-h-[300px] overflow-y-auto p-3 text-[13px] leading-5" style={{ fontFamily: MONO }}>
          {filteredLogs.length === 0 ? (
            <div className="text-zinc-600 text-center py-8">
              {searchQuery ? "No matching log lines" : "No output for this step yet."}
            </div>
          ) : (
            filteredLogs.map((entry, i) => {
              const isLogSelected = isActive && i === logScrollIndex;
              const isToolUse = entry.stream === "stdout" && /^\[(?:Read|Write|Edit|Bash|Glob|Grep|Task)\]/.test(entry.text);
              return (
                <div
                  key={i}
                  className={`flex gap-3 px-1 rounded transition-colors duration-100 ${
                    isLogSelected ? "bg-violet-500/[0.08]" : ""
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
                    {searchQuery ? highlightSearch(entry.text, searchQuery) : entry.text}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </SectionRow>
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
      <span className="bg-violet-500/30 text-violet-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DesignPreviewV2() {
  // -- Navigation state --
  const [mode, setMode] = useState<NavMode>("section");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [logScrollIndex, setLogScrollIndex] = useState(0);
  const [issueIndex, setIssueIndex] = useState(0);
  const [activeStep, setActiveStep] = useState<PipelineStep>("coding");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected section into view
  useEffect(() => {
    if (mode !== "section") return;
    const section = SECTIONS[sectionIndex];
    if (!section) return;
    const el = document.querySelector(`[data-section-id="${section.id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sectionIndex, mode]);

  // Compute step log count for log section
  const stepLogs = useMemo(() => {
    const logs = MOCK_LOGS.filter((l) => l.step === activeStep);
    return searchQuery
      ? logs.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()))
      : logs;
  }, [activeStep, searchQuery]);

  // -- Keyboard handler --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;

      // Search mode: capture typing
      if (searchMode) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchMode(false);
          setSearchQuery("");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSearchMode(false);
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          setSearchQuery((q) => q.slice(0, -1));
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setSearchQuery((q) => q + e.key);
          return;
        }
        return;
      }

      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (document.querySelector("[data-overlay-open]")) return;

      if (mode === "section") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSectionIndex((i) => Math.min(i + 1, SECTIONS.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSectionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const section = SECTIONS[sectionIndex];
          if (section?.drillable) {
            if (section.type === "steps") {
              setMode("step");
            } else if (section.type === "log") {
              setMode("log");
              setLogScrollIndex(0);
            } else if (section.type === "issues") {
              setMode("step"); // reuse step mode for issues drill-in
              setIssueIndex(0);
            }
          }
          return;
        }
        // Number keys for quick step jump
        if (e.key >= "1" && e.key <= "6") {
          e.preventDefault();
          const idx = parseInt(e.key) - 1;
          if (idx < ALL_STEPS.length) {
            setActiveStep(ALL_STEPS[idx]);
            // Jump to steps section and enter it
            const stepsIdx = SECTIONS.findIndex((s) => s.id === "steps");
            setSectionIndex(stepsIdx);
            setStepIndex(idx);
            setMode("step");
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          // Could navigate back
          return;
        }
        if (e.key === "/") {
          e.preventDefault();
          // Jump to log section and enter search mode
          const logIdx = SECTIONS.findIndex((s) => s.id === "log");
          setSectionIndex(logIdx);
          setMode("log");
          setLogScrollIndex(0);
          setSearchMode(true);
          setSearchQuery("");
          return;
        }
        return;
      }

      if (mode === "step") {
        const currentSection = SECTIONS[sectionIndex];
        if (currentSection?.id === "issues") {
          // Issue navigation
          if (e.key === "j" || e.key === "ArrowDown") {
            e.preventDefault();
            setIssueIndex((i) => Math.min(i + 1, MOCK_ISSUES.length - 1));
            return;
          }
          if (e.key === "k" || e.key === "ArrowUp") {
            e.preventDefault();
            setIssueIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setMode("section");
            return;
          }
          return;
        }

        // Step navigation
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setStepIndex((i) => Math.min(i + 1, ALL_STEPS.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setStepIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setActiveStep(ALL_STEPS[stepIndex]);
          // Switch to log view for this step
          const logIdx = SECTIONS.findIndex((s) => s.id === "log");
          setSectionIndex(logIdx);
          setMode("log");
          setLogScrollIndex(0);
          return;
        }
        if (e.key >= "1" && e.key <= "6") {
          e.preventDefault();
          const idx = parseInt(e.key) - 1;
          if (idx < ALL_STEPS.length) {
            setStepIndex(idx);
            setActiveStep(ALL_STEPS[idx]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMode("section");
          return;
        }
        return;
      }

      if (mode === "log") {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setLogScrollIndex((i) => Math.min(i + 1, stepLogs.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setLogScrollIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "/") {
          e.preventDefault();
          setSearchMode(true);
          setSearchQuery("");
          return;
        }
        if (e.key === "g") {
          // gg — jump to top (simplified: single g)
          e.preventDefault();
          setLogScrollIndex(0);
          return;
        }
        if (e.key === "G") {
          e.preventDefault();
          setLogScrollIndex(Math.max(0, stepLogs.length - 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (searchQuery) {
            setSearchQuery("");
          } else {
            setMode("section");
          }
          return;
        }
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [mode, sectionIndex, stepIndex, logScrollIndex, issueIndex, searchMode, searchQuery, stepLogs.length, activeStep]);

  // Mode label for hints bar
  const modeLabel = mode === "section" ? "Section" : mode === "step" ? (SECTIONS[sectionIndex]?.id === "issues" ? "Issues" : "Steps") : mode === "log" ? (searchMode ? "Search" : "Log") : "Search";

  return (
    <div className="flex h-full flex-col text-zinc-100 bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap gap-3 items-center justify-between border-b border-white/[0.06] bg-zinc-950 px-4 md:px-8 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
            <span className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/15 px-1.5 py-0.5 rounded font-medium">
              v2 — Flat Section List
            </span>
            <span className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded" style={{ fontFamily: MONO }}>
              a1b2c3d4
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-emerald-500/10 ring-emerald-500/20 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              success
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode indicator pill */}
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium ${
            mode === "section"
              ? "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20"
              : searchMode
                ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20"
                : "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              mode === "section" ? "bg-violet-400" : searchMode ? "bg-amber-400 animate-pulse" : "bg-cyan-400"
            }`} />
            {modeLabel} mode
          </div>
        </div>
      </header>

      {/* Main scrollable content — single flat list */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-2">
          {/* Status */}
          <StatusSection isSelected={mode === "section" && sectionIndex === 0} />

          {/* Timing */}
          <TimingSection isSelected={mode === "section" && sectionIndex === 1} />

          {/* Config */}
          <ConfigSection isSelected={mode === "section" && sectionIndex === 2} />

          {/* Score */}
          <ScoreSection isSelected={mode === "section" && sectionIndex === 3} />

          {/* Steps (drillable) */}
          <StepListSection
            isSelected={mode === "section" && sectionIndex === 4}
            isActive={mode === "step" && SECTIONS[sectionIndex]?.id === "steps"}
            selectedStepIndex={stepIndex}
            activeStep={activeStep}
          />

          {/* Review Issues (drillable) */}
          <IssuesSection
            isSelected={mode === "section" && sectionIndex === 5}
            isActive={mode === "step" && SECTIONS[sectionIndex]?.id === "issues"}
            selectedIssueIndex={issueIndex}
          />

          {/* Log Viewer (drillable) */}
          <LogSection
            isSelected={mode === "section" && sectionIndex === 6}
            isActive={mode === "log"}
            activeStep={activeStep}
            searchQuery={searchQuery}
            searchMode={searchMode}
            logScrollIndex={logScrollIndex}
          />
        </div>
      </div>

      {/* Bottom Hints Bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        {mode === "section" && (
          <>
            <span><Kbd>j</Kbd> <Kbd>k</Kbd> navigate</span>
            <span><Kbd>Enter</Kbd> drill in</span>
            <span><Kbd>1</Kbd>–<Kbd>6</Kbd> jump to step</span>
            <span><Kbd>/</Kbd> search logs</span>
            <span><Kbd>Esc</Kbd> back</span>
          </>
        )}
        {mode === "step" && SECTIONS[sectionIndex]?.id === "steps" && (
          <>
            <span><Kbd>j</Kbd> <Kbd>k</Kbd> move</span>
            <span><Kbd>Enter</Kbd> view logs</span>
            <span><Kbd>1</Kbd>–<Kbd>6</Kbd> jump</span>
            <span><Kbd>Esc</Kbd> back to sections</span>
          </>
        )}
        {mode === "step" && SECTIONS[sectionIndex]?.id === "issues" && (
          <>
            <span><Kbd>j</Kbd> <Kbd>k</Kbd> move</span>
            <span><Kbd>Esc</Kbd> back to sections</span>
          </>
        )}
        {mode === "log" && !searchMode && (
          <>
            <span><Kbd>j</Kbd> <Kbd>k</Kbd> scroll</span>
            <span><Kbd>/</Kbd> filter</span>
            <span><Kbd>g</Kbd> top <Kbd>G</Kbd> bottom</span>
            <span><Kbd>Esc</Kbd> {searchQuery ? "clear filter" : "back to sections"}</span>
          </>
        )}
        {searchMode && (
          <>
            <span>type to filter</span>
            <span><Kbd variant="amber">Enter</Kbd> confirm</span>
            <span><Kbd variant="amber">Esc</Kbd> cancel</span>
          </>
        )}
        <span className="ml-auto text-zinc-700">
          {mode === "section" ? `${sectionIndex + 1}/${SECTIONS.length}` : mode === "step" ? `step ${stepIndex + 1}/${ALL_STEPS.length}` : `line ${logScrollIndex + 1}/${stepLogs.length}`}
        </span>
      </div>
    </div>
  );
}
