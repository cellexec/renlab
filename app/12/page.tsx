"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// =============================================================================
// Types
// =============================================================================

type RunStatus = "running" | "queued" | "completed" | "failed";

interface PipelineStep {
  name: string;
  status: "done" | "running" | "pending" | "failed";
  duration?: string;
}

interface PipelineRun {
  id: string;
  name: string;
  specTitle: string;
  branch: string;
  status: RunStatus;
  duration: string;
  durationMs: number;
  reviewScore: number;
  timestamp: string;
  timestampMs: number;
  steps: PipelineStep[];
}

// =============================================================================
// Status config
// =============================================================================

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; color: string; border: string; bg: string; dot: string; text: string }
> = {
  running: {
    label: "Running",
    color: "text-indigo-400",
    border: "border-l-indigo-500",
    bg: "bg-indigo-500/10",
    dot: "bg-indigo-500",
    text: "text-indigo-300",
  },
  queued: {
    label: "Queued",
    color: "text-amber-400",
    border: "border-l-amber-500",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
    text: "text-amber-300",
  },
  completed: {
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
};

const STATUS_ORDER: RunStatus[] = ["running", "queued", "completed", "failed"];

// =============================================================================
// Mock data
// =============================================================================

const now = Date.now();
const ago = (minutes: number) => now - minutes * 60 * 1000;

const MOCK_RUNS: PipelineRun[] = [
  {
    id: "run-001",
    name: "deploy-frontend-prod",
    specTitle: "Production Deploy: Dashboard v2.4",
    branch: "main",
    status: "running",
    duration: "4m 32s",
    durationMs: 272000,
    reviewScore: 72,
    timestamp: "2m ago",
    timestampMs: ago(2),
    steps: [
      { name: "Checkout", status: "done", duration: "3s" },
      { name: "Install deps", status: "done", duration: "28s" },
      { name: "Lint & typecheck", status: "done", duration: "1m 14s" },
      { name: "Unit tests", status: "done", duration: "2m 05s" },
      { name: "Build", status: "running" },
      { name: "Deploy", status: "pending" },
      { name: "Smoke tests", status: "pending" },
    ],
  },
  {
    id: "run-002",
    name: "ml-model-retrain",
    specTitle: "Nightly Model Retrain: Recommendation Engine",
    branch: "feat/retrain-v3",
    status: "running",
    duration: "18m 04s",
    durationMs: 1084000,
    reviewScore: 45,
    timestamp: "18m ago",
    timestampMs: ago(18),
    steps: [
      { name: "Fetch dataset", status: "done", duration: "2m 30s" },
      { name: "Preprocess", status: "done", duration: "4m 12s" },
      { name: "Train model", status: "running" },
      { name: "Evaluate", status: "pending" },
      { name: "Push artifacts", status: "pending" },
    ],
  },
  {
    id: "run-003",
    name: "api-integration-tests",
    specTitle: "Integration Suite: Payment Gateway",
    branch: "fix/payment-timeout",
    status: "queued",
    duration: "--",
    durationMs: 0,
    reviewScore: 0,
    timestamp: "1m ago",
    timestampMs: ago(1),
    steps: [
      { name: "Checkout", status: "pending" },
      { name: "Provision DB", status: "pending" },
      { name: "Seed data", status: "pending" },
      { name: "Run tests", status: "pending" },
      { name: "Teardown", status: "pending" },
    ],
  },
  {
    id: "run-004",
    name: "security-scan",
    specTitle: "Dependency Audit: CVE Scanner",
    branch: "main",
    status: "queued",
    duration: "--",
    durationMs: 0,
    reviewScore: 0,
    timestamp: "3m ago",
    timestampMs: ago(3),
    steps: [
      { name: "Clone repo", status: "pending" },
      { name: "SAST scan", status: "pending" },
      { name: "DAST scan", status: "pending" },
      { name: "Report", status: "pending" },
    ],
  },
  {
    id: "run-005",
    name: "deploy-backend-staging",
    specTitle: "Staging Deploy: Auth Service v1.8",
    branch: "develop",
    status: "completed",
    duration: "6m 14s",
    durationMs: 374000,
    reviewScore: 98,
    timestamp: "25m ago",
    timestampMs: ago(25),
    steps: [
      { name: "Checkout", status: "done", duration: "2s" },
      { name: "Install deps", status: "done", duration: "31s" },
      { name: "Build image", status: "done", duration: "2m 44s" },
      { name: "Push registry", status: "done", duration: "48s" },
      { name: "Deploy K8s", status: "done", duration: "1m 22s" },
      { name: "Health check", status: "done", duration: "47s" },
    ],
  },
  {
    id: "run-006",
    name: "e2e-browser-tests",
    specTitle: "E2E Suite: Checkout Flow",
    branch: "feat/checkout-v2",
    status: "completed",
    duration: "12m 48s",
    durationMs: 768000,
    reviewScore: 100,
    timestamp: "1h ago",
    timestampMs: ago(60),
    steps: [
      { name: "Checkout", status: "done", duration: "3s" },
      { name: "Install", status: "done", duration: "35s" },
      { name: "Build", status: "done", duration: "2m 10s" },
      { name: "Start server", status: "done", duration: "12s" },
      { name: "Playwright tests", status: "done", duration: "9m 38s" },
      { name: "Upload report", status: "done", duration: "10s" },
    ],
  },
  {
    id: "run-007",
    name: "data-migration",
    specTitle: "DB Migration: Users Table Schema",
    branch: "chore/db-migrate",
    status: "completed",
    duration: "3m 02s",
    durationMs: 182000,
    reviewScore: 95,
    timestamp: "2h ago",
    timestampMs: ago(120),
    steps: [
      { name: "Backup", status: "done", duration: "45s" },
      { name: "Run migrations", status: "done", duration: "1m 28s" },
      { name: "Validate schema", status: "done", duration: "32s" },
      { name: "Update seeds", status: "done", duration: "17s" },
    ],
  },
  {
    id: "run-008",
    name: "build-mobile-app",
    specTitle: "Release Build: iOS v3.1.0",
    branch: "release/3.1.0",
    status: "failed",
    duration: "8m 55s",
    durationMs: 535000,
    reviewScore: 34,
    timestamp: "45m ago",
    timestampMs: ago(45),
    steps: [
      { name: "Checkout", status: "done", duration: "3s" },
      { name: "Install pods", status: "done", duration: "1m 42s" },
      { name: "Build archive", status: "failed", duration: "6m 58s" },
      { name: "Sign & export", status: "pending" },
      { name: "Upload TestFlight", status: "pending" },
    ],
  },
  {
    id: "run-009",
    name: "lint-formatting",
    specTitle: "Code Quality: ESLint + Prettier",
    branch: "feat/new-dashboard",
    status: "failed",
    duration: "1m 12s",
    durationMs: 72000,
    reviewScore: 12,
    timestamp: "3h ago",
    timestampMs: ago(180),
    steps: [
      { name: "Checkout", status: "done", duration: "2s" },
      { name: "Install", status: "done", duration: "22s" },
      { name: "ESLint", status: "failed", duration: "38s" },
      { name: "Prettier check", status: "pending" },
    ],
  },
  {
    id: "run-010",
    name: "perf-benchmark",
    specTitle: "Benchmark: API Response Times",
    branch: "main",
    status: "completed",
    duration: "5m 22s",
    durationMs: 322000,
    reviewScore: 88,
    timestamp: "4h ago",
    timestampMs: ago(240),
    steps: [
      { name: "Provision env", status: "done", duration: "1m 05s" },
      { name: "Warm cache", status: "done", duration: "30s" },
      { name: "Run k6 suite", status: "done", duration: "3m 12s" },
      { name: "Generate report", status: "done", duration: "35s" },
    ],
  },
];

// =============================================================================
// Sparkline component (SVG mini chart)
// =============================================================================

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 80;
  const height = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#spark-${color})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
// Icons (inline SVGs)
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

function IconPlay({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
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
// Step timeline inside an expanded row
// =============================================================================

function StepTimeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="flex flex-col gap-0 py-3 pl-6 pr-4">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const dotColor =
          step.status === "done"
            ? "bg-emerald-500"
            : step.status === "running"
              ? "bg-indigo-500"
              : step.status === "failed"
                ? "bg-red-500"
                : "bg-zinc-600";
        const lineColor =
          step.status === "done" ? "bg-emerald-500/40" : "bg-zinc-700/60";

        return (
          <div key={step.name} className="flex items-start gap-3 relative">
            {/* Connector line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0 mt-[5px] ${
                  step.status === "running" ? "animate-pulse" : ""
                }`}
              />
              {!isLast && (
                <div className={`w-[1.5px] h-6 ${lineColor}`} />
              )}
            </div>
            {/* Step info */}
            <div className="flex items-center justify-between w-full min-h-[32px] pb-1">
              <span
                className={`text-[13px] ${
                  step.status === "pending"
                    ? "text-zinc-500"
                    : step.status === "failed"
                      ? "text-red-400"
                      : "text-zinc-300"
                }`}
              >
                {step.name}
                {step.status === "running" && (
                  <span className="ml-2 text-indigo-400 text-xs font-medium">in progress...</span>
                )}
                {step.status === "failed" && (
                  <span className="ml-2 text-red-400 text-xs font-medium">error</span>
                )}
              </span>
              {step.duration && (
                <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
                  {step.duration}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Pipeline row
// =============================================================================

function PipelineRow({
  run,
  expanded,
  onToggle,
  style,
}: {
  run: PipelineRun;
  expanded: boolean;
  onToggle: () => void;
  style: React.CSSProperties;
}) {
  const cfg = STATUS_CONFIG[run.status];
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded]);

  return (
    <div style={style} className="animate-fade-in-up">
      {/* Main row */}
      <div
        className={`group relative border-l-[3px] ${cfg.border} bg-white/[0.015] hover:bg-white/[0.04] border-b border-white/[0.04] transition-all duration-200 cursor-pointer`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Expand chevron */}
          <IconChevron open={expanded} className="w-3.5 h-3.5 text-zinc-500 shrink-0" />

          {/* Run name + spec */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-zinc-100 truncate">
                {run.name}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${run.status === "running" ? "animate-pulse" : ""}`} />
                {cfg.label}
              </span>
            </div>
            <p className="text-[12px] text-zinc-500 mt-0.5 truncate">{run.specTitle}</p>
          </div>

          {/* Branch badge */}
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-md shrink-0">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
            </svg>
            {run.branch}
          </span>

          {/* Duration */}
          <span className="text-[12px] text-zinc-400 font-mono tabular-nums w-[72px] text-right shrink-0">
            {run.duration}
          </span>

          {/* Review score */}
          <div className="hidden md:flex items-center gap-2 w-[120px] shrink-0">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  run.reviewScore >= 80
                    ? "bg-emerald-500"
                    : run.reviewScore >= 50
                      ? "bg-amber-500"
                      : run.reviewScore > 0
                        ? "bg-red-500"
                        : "bg-zinc-700"
                }`}
                style={{ width: `${run.reviewScore}%` }}
              />
            </div>
            <span className="text-[11px] text-zinc-500 font-mono tabular-nums w-[28px] text-right">
              {run.reviewScore > 0 ? `${run.reviewScore}%` : "--"}
            </span>
          </div>

          {/* Timestamp */}
          <span className="text-[11px] text-zinc-500 w-[52px] text-right shrink-0">
            {run.timestamp}
          </span>

          {/* Hover action icons */}
          <div className="flex items-center gap-1 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="p-1.5 rounded-md hover:bg-white/[0.08] text-zinc-400 hover:text-violet-400 transition-colors"
              title="View"
            >
              <IconEye />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="p-1.5 rounded-md hover:bg-white/[0.08] text-zinc-400 hover:text-violet-400 transition-colors"
              title="Re-run"
            >
              <IconPlay />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="p-1.5 rounded-md hover:bg-white/[0.08] text-zinc-400 hover:text-red-400 transition-colors"
              title="Cancel"
            >
              <IconX />
            </button>
          </div>
        </div>
      </div>

      {/* Expandable step timeline */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out bg-white/[0.01] border-b border-white/[0.04]"
        style={{ maxHeight: expanded ? contentHeight : 0, opacity: expanded ? 1 : 0 }}
      >
        <div ref={contentRef}>
          <StepTimeline steps={run.steps} />
        </div>
      </div>
    </div>
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
  sparkData,
  sparkColor,
  accentColor,
  delay,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  sparkData: number[];
  sparkColor: string;
  accentColor: string;
  delay: number;
}) {
  const animatedValue = useAnimatedNumber(value, 1400);

  return (
    <div
      className="stat-card group relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 overflow-hidden transition-all duration-300 hover:bg-white/[0.05]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Animated border glow on hover */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `conic-gradient(from var(--border-angle, 0deg), transparent 60%, ${accentColor}33 80%, transparent 100%)`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: "1px",
        }}
      />

      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-white/[0.04] ${accentColor.includes("indigo") ? "text-indigo-400" : accentColor.includes("emerald") ? "text-emerald-400" : accentColor.includes("amber") ? "text-amber-400" : "text-violet-400"}`}>
          {icon}
        </div>
        <Sparkline data={sparkData} color={sparkColor} />
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
// TOC Sidebar
// =============================================================================

function TocSidebar({
  groups,
  activeGroup,
  onNavigate,
}: {
  groups: { status: RunStatus; count: number }[];
  activeGroup: RunStatus | null;
  onNavigate: (status: RunStatus) => void;
}) {
  return (
    <div className="w-[200px] shrink-0 hidden lg:block">
      <div className="sticky top-6">
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Status Groups
          </h3>
          <div className="flex flex-col gap-1">
            {groups.map(({ status, count }) => {
              const cfg = STATUS_CONFIG[status];
              const isActive = activeGroup === status;
              return (
                <button
                  key={status}
                  onClick={() => onNavigate(status)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all duration-200 ${
                    isActive
                      ? "bg-white/[0.06] border border-white/[0.08]"
                      : "hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot} ${status === "running" && isActive ? "animate-pulse" : ""}`} />
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

          {/* Divider */}
          <div className="border-t border-white/[0.06] my-4" />

          {/* Quick legend */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Review Score
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-zinc-500">80-100%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[11px] text-zinc-500">50-79%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-1.5 rounded-full bg-red-500" />
              <span className="text-[11px] text-zinc-500">0-49%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main page
// =============================================================================

export default function PipelineRunsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<RunStatus>>(new Set());
  const [activeGroup, setActiveGroup] = useState<RunStatus | null>("running");
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Mount animation trigger
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
    const observers: IntersectionObserver[] = [];
    STATUS_ORDER.forEach((status) => {
      const el = groupRefs.current[status];
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveGroup(status);
          }
        },
        { threshold: 0.3, rootMargin: "-80px 0px -60% 0px" }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [mounted]);

  // Filtered runs
  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return MOCK_RUNS;
    const q = searchQuery.toLowerCase();
    return MOCK_RUNS.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.specTitle.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Grouped
  const groupedRuns = useMemo(() => {
    const map: Record<RunStatus, PipelineRun[]> = {
      running: [],
      queued: [],
      completed: [],
      failed: [],
    };
    filteredRuns.forEach((r) => map[r.status].push(r));
    return map;
  }, [filteredRuns]);

  // Stat computations
  const stats = useMemo(() => {
    const total = MOCK_RUNS.length;
    const completed = MOCK_RUNS.filter((r) => r.status === "completed").length;
    const failed = MOCK_RUNS.filter((r) => r.status === "failed").length;
    const successRate = total > 0 ? Math.round((completed / (completed + failed)) * 100) : 0;
    const withDuration = MOCK_RUNS.filter((r) => r.durationMs > 0);
    const avgDurationMs =
      withDuration.length > 0
        ? withDuration.reduce((s, r) => s + r.durationMs, 0) / withDuration.length
        : 0;
    const avgDurationMin = Math.round(avgDurationMs / 60000);
    const activeNow = MOCK_RUNS.filter((r) => r.status === "running").length;
    return { total, successRate, avgDurationMin, activeNow };
  }, []);

  const toggleRun = useCallback((id: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((status: RunStatus) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const navigateToGroup = useCallback((status: RunStatus) => {
    const el = groupRefs.current[status];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Also ensure the group is expanded
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        next.delete(status);
        return next;
      });
    }
  }, []);

  const tocGroups = STATUS_ORDER.map((status) => ({
    status,
    count: groupedRuns[status].length,
  }));

  return (
    <>
      {/* CSS for animations and conic border */}
      <style>{`
        @property --border-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        .stat-card:hover {
          --border-angle: 360deg;
          transition: --border-angle 3s linear infinite;
        }

        @keyframes spin-border {
          to {
            --border-angle: 360deg;
          }
        }

        .stat-card:hover {
          animation: spin-border 3s linear infinite;
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out both;
        }

        .stagger-1 { animation-delay: 0ms; }
        .stagger-2 { animation-delay: 80ms; }
        .stagger-3 { animation-delay: 160ms; }
        .stagger-4 { animation-delay: 240ms; }

        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .search-glow:focus-within {
          box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.3), 0 0 20px -5px rgba(139, 92, 246, 0.15);
        }
      `}</style>

      <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
        <div className="h-full overflow-auto">
          <div className="max-w-full px-6 py-6">
            {/* Breadcrumb + header */}
            <div className="mb-6 animate-fade-in-up stagger-1">
              <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
                <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
                <span>/</span>
                <span className="hover:text-zinc-300 cursor-pointer transition-colors">Pipelines</span>
                <span>/</span>
                <span className="text-zinc-300">Runs</span>
              </div>
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Pipeline Runs</h1>
                <button className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors duration-200">
                  <IconPlay className="w-3.5 h-3.5" />
                  New Run
                </button>
              </div>
            </div>

            {/* Bento stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard
                label="Total Runs"
                value={stats.total}
                icon={<IconActivity />}
                sparkData={[3, 7, 5, 8, 6, 9, 10, 8, 12, 10]}
                sparkColor="#818cf8"
                accentColor="indigo"
                delay={100}
              />
              <StatCard
                label="Success Rate"
                value={stats.successRate}
                suffix="%"
                icon={<IconCheck />}
                sparkData={[88, 92, 85, 90, 94, 91, 87, 93, 96, 95]}
                sparkColor="#34d399"
                accentColor="emerald"
                delay={180}
              />
              <StatCard
                label="Avg Duration"
                value={stats.avgDurationMin}
                suffix="m"
                icon={<IconClock />}
                sparkData={[6, 8, 5, 7, 9, 6, 4, 7, 5, 6]}
                sparkColor="#fbbf24"
                accentColor="amber"
                delay={260}
              />
              <StatCard
                label="Active Now"
                value={stats.activeNow}
                icon={<IconPulse />}
                sparkData={[1, 2, 1, 3, 2, 4, 2, 3, 1, 2]}
                sparkColor="#a78bfa"
                accentColor="violet"
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
                  placeholder="Search pipeline runs..."
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
              {/* Main pipeline list */}
              <div className="flex-1 min-w-0">
                {STATUS_ORDER.map((status) => {
                  const runs = groupedRuns[status];
                  if (runs.length === 0) return null;
                  const cfg = STATUS_CONFIG[status];
                  const isCollapsed = collapsedGroups.has(status);

                  return (
                    <div
                      key={status}
                      ref={(el) => { groupRefs.current[status] = el; }}
                      className="mb-4"
                    >
                      {/* Group header */}
                      <button
                        onClick={() => toggleGroup(status)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors duration-200 mb-1 group"
                      >
                        <IconChevron open={!isCollapsed} className="w-3.5 h-3.5 text-zinc-500" />
                        <span className={`w-2 h-2 rounded-full ${cfg.dot} ${status === "running" ? "animate-pulse" : ""}`} />
                        <span className={`text-[13px] font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          ({runs.length})
                        </span>
                      </button>

                      {/* Collapsible run list */}
                      <div
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{
                          maxHeight: isCollapsed ? 0 : runs.length * 200,
                          opacity: isCollapsed ? 0 : 1,
                        }}
                      >
                        <div className="backdrop-blur-xl bg-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
                          {runs.map((run, idx) => (
                            <PipelineRow
                              key={run.id}
                              run={run}
                              expanded={expandedRuns.has(run.id)}
                              onToggle={() => toggleRun(run.id)}
                              style={{ animationDelay: `${300 + idx * 60}ms` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Empty state */}
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
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
