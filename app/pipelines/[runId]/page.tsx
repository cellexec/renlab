"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePipelineLogs } from "../../hooks/usePipelineLogs";
import { formatStepDuration, getStepTimingKey } from "../../components/PipelineSteps";
import { getSupabase } from "../../lib/supabase";
import type { PipelineRun, PipelineStep, PipelineLogEntry, StepTimings } from "../../pipelines";

const STEPS: PipelineStep[] = ["worktree", "coding", "reviewing", "merging"];

// =============================================================================
// ScoreGauge — SVG circular gauge (ported from v4, scaled to 160x160)
// =============================================================================

function ScoreGauge({ score, threshold, animated }: { score: number; threshold: number; animated: boolean }) {
  const radius = 64;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * radius;
  const scoreOffset = circumference - (score / 100) * circumference;
  const thresholdAngle = (threshold / 100) * 360 - 90;
  const thresholdRad = (thresholdAngle * Math.PI) / 180;
  const thresholdX = cx + radius * Math.cos(thresholdRad);
  const thresholdY = cy + radius * Math.sin(thresholdRad);
  const passed = score >= threshold;

  const scoreColor = passed ? "#10b981" : "#ef4444";
  const scoreGlow = passed ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="160" height="160" viewBox="0 0 160 160" className="drop-shadow-lg">
        <defs>
          <filter id="score-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="gauge-track" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="url(#gauge-track)" strokeWidth="10" strokeLinecap="round" />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = (tick / 100) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const innerR = 55;
          const outerR = 58;
          return (
            <line
              key={tick}
              x1={cx + innerR * Math.cos(rad)}
              y1={cy + innerR * Math.sin(rad)}
              x2={cx + outerR * Math.cos(rad)}
              y2={cy + outerR * Math.sin(rad)}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Score arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? scoreOffset : circumference}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter="url(#score-glow)"
          style={{ transition: animated ? "stroke-dashoffset 1.8s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }}
        />

        {/* Glow trail */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={scoreGlow}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? scoreOffset : circumference}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: animated ? "stroke-dashoffset 1.8s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none" }}
        />

        {/* Threshold marker */}
        <circle cx={thresholdX} cy={thresholdY} r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <text
          x={thresholdX + (thresholdX > cx ? 9 : -9)}
          y={thresholdY + 3.5}
          textAnchor={thresholdX > cx ? "start" : "end"}
          fill="rgba(255,255,255,0.35)"
          fontSize="9"
          fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        >
          {threshold}
        </text>
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums tracking-tighter"
          style={{ color: scoreColor, fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
        >
          {score}
        </span>
        <span className="text-[11px] text-zinc-500 -mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// =============================================================================
// StepLogViewer — terminal-style log display (unchanged)
// =============================================================================

function StepLogViewer({ logs, step, selectedIteration }: { logs: PipelineLogEntry[]; step: PipelineStep; selectedIteration?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const filtered = logs.filter((l) => {
    if (l.step !== step) return false;
    if (selectedIteration != null && (step === "coding" || step === "reviewing")) {
      return (l.iteration ?? 1) === selectedIteration;
    }
    return true;
  });

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      className="log-scroll flex-1 overflow-y-auto p-4 text-[13px] leading-5"
    >
      {filtered.length === 0 ? (
        <div className="flex h-full items-center justify-center text-zinc-600">
          No output for this step yet.
        </div>
      ) : (
        (() => {
          const completedTools = new Set<string>();
          for (const e of filtered) {
            if (e.toolCallId?.endsWith("-end")) {
              completedTools.add(e.toolCallId.replace("-end", ""));
            }
          }
          return filtered.map((entry, i) => {
            if (entry.toolCallId?.endsWith("-start")) {
              const toolKey = entry.toolCallId.replace("-start", "");
              if (completedTools.has(toolKey)) return null;
            }
            const isThinking = !!entry.toolCallId?.startsWith("thinking-");
            if (isThinking && i < filtered.length - 1) return null;
            const isToolStart = !isThinking && !!entry.toolCallId?.endsWith("-start");
            const isToolEnd = !isThinking && !!entry.toolCallId?.endsWith("-end");
            const isToolUse = isToolStart || isToolEnd || (entry.stream === "stdout" && /^\[(?:Read|Write|Edit|Bash|Glob|Grep|Task)\]/.test(entry.text));
            return (
              <div key={i} className="flex gap-3">
                <span className="shrink-0 select-none text-zinc-600">
                  {formatTime(entry.timestamp)}
                </span>
                {isThinking ? (
                  <span className="flex items-center gap-2 text-zinc-500 whitespace-pre-wrap">
                    <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {entry.text}
                  </span>
                ) : isToolStart ? (
                  <span className="flex items-center gap-2 text-amber-400/80 whitespace-pre-wrap">
                    <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {entry.text}
                  </span>
                ) : isToolEnd ? (
                  <span className="flex items-center gap-2 text-amber-400/80 whitespace-pre-wrap">
                    <svg className="h-3.5 w-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {entry.text}
                  </span>
                ) : (
                  <span
                    className={
                      entry.stream === "stderr"
                        ? "text-red-400 whitespace-pre-wrap"
                        : isToolUse
                          ? "text-amber-400/80 whitespace-pre-wrap"
                          : "text-zinc-300 whitespace-pre-wrap"
                    }
                  >
                    {entry.text}
                  </span>
                )}
              </div>
            );
          });
        })()
      )}
    </div>
  );
}

// =============================================================================
// Helpers (unchanged)
// =============================================================================

function extractReviewDetails(logs: PipelineLogEntry[], iteration: number): { summary?: string; issues?: string[] } {
  let summary: string | undefined;
  let issues: string[] | undefined;
  const reviewLogs = logs.filter((l) => l.step === "reviewing" && l.stream === "stdout" && (l.iteration ?? 1) === iteration);
  for (const log of reviewLogs) {
    if (log.text.startsWith("Summary: ")) {
      summary = log.text.replace("Summary: ", "");
    }
    if (log.text.startsWith("Issues:")) {
      issues = log.text
        .replace("Issues:\n", "")
        .split("\n")
        .map((l) => l.replace(/^\s+-\s*/, "").trim())
        .filter(Boolean);
    }
  }
  return { summary, issues };
}

function getMaxIteration(logs: PipelineLogEntry[]): number {
  let max = 1;
  for (const log of logs) {
    if (log.iteration && log.iteration > max) max = log.iteration;
  }
  return max;
}

function getTabTiming(step: PipelineStep, stepTimings: StepTimings, selectedIteration?: number): { startedAt: number; endedAt: number | null } | undefined {
  const key = getStepTimingKey(step, stepTimings, selectedIteration);
  return stepTimings[key];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
// Main Page
// =============================================================================

export default function PipelineRunPage({ params }: { params: Promise<{ runId: string }> }) {
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

  const totalIterations = Math.max(iteration, getMaxIteration(logs), run?.iterations ?? 1);
  const totalAttempts = (maxRetries > 0 ? maxRetries : (run?.maxRetries ?? 0)) + 1;

  // Trigger gauge animation after mount
  useEffect(() => {
    const t = setTimeout(() => setGaugeAnimated(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Reset iteration selectors when iteration count changes
  useEffect(() => {
    setCodingIteration(null);
    setReviewingIteration(null);
  }, [totalIterations]);

  // Fetch spec title and version when run data is available
  useEffect(() => {
    if (!run) {
      setSpecInfo(null);
      setSpecInfoLoading(false);
      return;
    }

    let ignore = false;
    setSpecInfoLoading(true);

    const sb = getSupabase();
    Promise.all([
      sb.from("specifications").select("title").eq("id", run.specificationId).single(),
      sb.from("specification_versions").select("version_number").eq("id", run.specVersionId).single(),
    ])
      .then(([specRes, versionRes]) => {
        if (ignore) return;
        if (specRes.data && versionRes.data) {
          setSpecInfo({
            title: specRes.data.title as string,
            versionNumber: versionRes.data.version_number as number,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setSpecInfoLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [run?.specificationId, run?.specVersionId]);

  // Fetch initial run data
  useEffect(() => {
    fetch(`/api/pipelines/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setRun({
            id: data.id,
            projectId: data.project_id,
            specificationId: data.specification_id,
            specVersionId: data.spec_version_id,
            status: data.status,
            currentStep: data.current_step,
            worktreeBranch: data.worktree_branch,
            worktreePath: data.worktree_path,
            reviewScore: data.review_score,
            reviewThreshold: data.review_threshold,
            errorMessage: data.error_message,
            createdAt: data.created_at,
            finishedAt: data.finished_at,
            iterations: data.iterations ?? 1,
            maxRetries: data.max_retries ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [runId]);

  // Auto-switch to active step tab
  useEffect(() => {
    if (currentStep && STEPS.includes(currentStep)) {
      setActiveTab(currentStep);
    }
  }, [currentStep]);

  // Reset retry state when status changes away from failed/rejected
  useEffect(() => {
    if (status !== "failed" && status !== "rejected") setRetrying(false);
  }, [status]);

  // Refetch run data when pipeline reaches terminal state after a retry
  useEffect(() => {
    if (sseVersion === 0) return;
    if (!["success", "failed", "rejected"].includes(status)) return;
    fetch(`/api/pipelines/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setRun({
            id: data.id,
            projectId: data.project_id,
            specificationId: data.specification_id,
            specVersionId: data.spec_version_id,
            status: data.status,
            currentStep: data.current_step,
            worktreeBranch: data.worktree_branch,
            worktreePath: data.worktree_path,
            reviewScore: data.review_score,
            reviewThreshold: data.review_threshold,
            errorMessage: data.error_message,
            createdAt: data.created_at,
            finishedAt: data.finished_at,
            iterations: data.iterations ?? 1,
            maxRetries: data.max_retries ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [sseVersion, status, runId]);

  // Tick every second for live tab durations
  useEffect(() => {
    const hasActive = Object.values(stepTimings).some((t) => t.endedAt == null);
    if (!hasActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [stepTimings]);

  const isActive = ["pending", "worktree", "coding", "reviewing", "merging"].includes(status);
  const displayStatus = status;
  const displayStep = currentStep;
  const displayScore = reviewScore ?? run?.reviewScore ?? null;
  const threshold = run?.reviewThreshold ?? 80;

  const handleCancel = async () => {
    setCancelling(true);
    await fetch(`/api/pipelines/${runId}`, { method: "DELETE" });
  };

  const canRetryMerge = (status === "failed" && run?.currentStep === "merging") || status === "rejected";

  const handleRetryMerge = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/pipelines/${runId}/retry-merge`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to retry merge");
        setRetrying(false);
        return;
      }
      setSseVersion((v) => v + 1);
    } catch {
      setRetrying(false);
    }
  };

  const { summary: reviewSummary, issues: reviewIssues } = extractReviewDetails(logs, reviewingIteration ?? totalIterations);

  const getSelectedIteration = (step: PipelineStep): number | undefined => {
    if (totalIterations <= 1) return undefined;
    if (step === "coding") return codingIteration ?? totalIterations;
    if (step === "reviewing") return reviewingIteration ?? totalIterations;
    return undefined;
  };

  // Compute step states for the left card buttons
  const getStepState = (step: PipelineStep): "complete" | "active" | "failed" | "pending" => {
    const stepIdx = STEPS.indexOf(step);
    const currentIdx = displayStep ? STEPS.indexOf(displayStep) : -1;
    const selectedIter = getSelectedIteration(step);
    const isNonFinalIteration = (step === "coding" || step === "reviewing") && totalIterations > 1 && selectedIter != null && selectedIter < totalIterations;

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
  };

  // Status badge styling
  const statusBadge = (() => {
    switch (displayStatus) {
      case "success":
        return { bg: "bg-emerald-500/10 ring-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" };
      case "failed":
        return { bg: "bg-red-500/10 ring-red-500/20", text: "text-red-400", dot: "bg-red-400" };
      case "cancelled":
        return { bg: "bg-zinc-500/10 ring-zinc-500/20", text: "text-zinc-400", dot: "bg-zinc-400" };
      case "rejected":
        return { bg: "bg-amber-500/10 ring-amber-500/20", text: "text-amber-400", dot: "bg-amber-400" };
      default:
        return { bg: "bg-amber-500/10 ring-amber-500/20", text: "text-amber-400", dot: "bg-amber-400 animate-pulse" };
    }
  })();

  const activeTabTiming = getTabTiming(activeTab, stepTimings, getSelectedIteration(activeTab));

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up {
          opacity: 0;
          animation: fadeInUp 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .log-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .log-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .log-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
        }
        .log-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .log-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
        }
      `}</style>

      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        {/* ================================================================= */}
        {/* Header                                                            */}
        {/* ================================================================= */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.04] bg-zinc-950/80 px-8 py-4 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/pipelines")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>

            <div className="flex items-center gap-3">
              <h1 className="text-sm font-medium text-zinc-300">Pipeline Run</h1>
              <span
                className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded"
                style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
              >
                {runId.slice(0, 8)}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusBadge.bg} ${statusBadge.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                {displayStatus}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Spec link */}
            {run && specInfo && (
              <Link
                href={`/specifications/${run.specificationId}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-zinc-300"
              >
                <span>{specInfo.title} v{specInfo.versionNumber}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                </svg>
              </Link>
            )}

            {canRetryMerge && (
              <button
                onClick={handleRetryMerge}
                disabled={retrying}
                className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retrying ? "Retrying..." : displayStatus === "rejected" ? "Force Merge" : "Retry Merge"}
              </button>
            )}
            {isActive && !cancelling && (
              <button
                onClick={handleCancel}
                className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50"
              >
                Cancel
              </button>
            )}
            {cancelling && (
              <span className="text-sm text-zinc-500">Cancelling...</span>
            )}
          </div>
        </header>

        {/* ================================================================= */}
        {/* Info Cards                                                        */}
        {/* ================================================================= */}
        <div className="flex flex-col gap-4 px-8 py-6 shrink-0 fade-in-up" style={{ animationDelay: "80ms" }}>
          {/* ---- Metadata Card (Score left + fields right) ---- */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-6">
            <div className={`flex ${displayScore != null ? "gap-8" : ""}`}>
              {/* Score gauge — left side, only when score exists */}
              {displayScore != null && (
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <ScoreGauge score={displayScore} threshold={threshold} animated={gaugeAnimated} />
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        displayScore >= threshold
                          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                          : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
                      }`}
                    >
                      {displayScore >= threshold ? "PASSED" : "FAILED"}
                    </span>
                    <span className="text-[11px] text-zinc-600" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                      threshold {threshold}
                    </span>
                  </div>
                </div>
              )}

              {/* Metadata fields — right side */}
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  {/* Created */}
                  <div>
                    <div className="text-[11px] text-zinc-600 mb-1">Created</div>
                    <div className="text-sm text-zinc-300 tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                      {run ? formatTimestamp(run.createdAt) : "..."}
                    </div>
                  </div>

                  {/* Finished */}
                  <div>
                    <div className="text-[11px] text-zinc-600 mb-1">Finished</div>
                    <div className="text-sm text-zinc-300 tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                      {run?.finishedAt ? formatTimestamp(run.finishedAt) : isActive ? "In progress" : "..."}
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <div className="text-[11px] text-zinc-600 mb-1">Duration</div>
                    <div className="text-sm text-zinc-300 tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                      {run ? totalDuration(run.createdAt, run.finishedAt) : "..."}
                    </div>
                  </div>

                  {/* Branch */}
                  <div>
                    <div className="text-[11px] text-zinc-600 mb-1">Branch</div>
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-cyan-500/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" />
                      </svg>
                      <span className="text-sm text-cyan-400/80 truncate" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                        {run?.worktreeBranch ?? "..."}
                      </span>
                    </div>
                  </div>

                  {/* Iterations */}
                  <div>
                    <div className="text-[11px] text-zinc-600 mb-1">Iterations</div>
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-violet-400/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.993 4.356v4.992" />
                      </svg>
                      <span className="text-sm text-zinc-300 tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                        {totalIterations} / {totalAttempts}
                      </span>
                    </div>
                  </div>

                  {/* Specification */}
                  <div>
                    <div className="text-[11px] text-zinc-600 mb-1">Specification</div>
                    <div className="flex items-center gap-1.5">
                      <svg className="h-3.5 w-3.5 text-violet-400/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      {specInfo && run ? (
                        <Link
                          href={`/specifications/${run.specificationId}`}
                          className="text-sm text-violet-400/80 hover:text-violet-300 truncate transition-colors"
                          style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                          title={`${specInfo.title} (v${specInfo.versionNumber})`}
                        >
                          {specInfo.title} v{specInfo.versionNumber}
                        </Link>
                      ) : (
                        <span className="text-sm text-zinc-500" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                          {specInfoLoading ? "..." : "Unknown"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Pipeline Steps Card ---- */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl px-4 py-3">
            <div className="flex items-center gap-1.5">
              {STEPS.map((step, i) => {
                const state = getStepState(step);
                const isSelected = activeTab === step;
                const selectedIter = getSelectedIteration(step);
                const timing = getTabTiming(step, stepTimings, selectedIter);
                const stepLogs = logs.filter((l) => l.step === step);

                const dotColor =
                  state === "complete" ? "bg-emerald-500"
                  : state === "active" ? "bg-amber-400 animate-pulse"
                  : state === "failed" ? "bg-red-500"
                  : "bg-zinc-700";

                const hasIterations = totalIterations > 1 && (step === "coding" || step === "reviewing");
                const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);

                return (
                  <div key={step} className="flex items-center">
                    <button
                      onClick={() => setActiveTab(step)}
                      className={`
                        group flex items-center gap-2.5 rounded-lg px-3.5 py-2.5
                        transition-all duration-200 cursor-pointer
                        ${isSelected
                          ? "bg-white/[0.06] border border-white/[0.1]"
                          : "border border-transparent hover:bg-white/[0.03] hover:border-white/[0.06]"
                        }
                      `}
                    >
                      {/* Status dot */}
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${
                        state === "complete" ? "bg-emerald-500/15" : state === "failed" ? "bg-red-500/15" : state === "active" ? "bg-amber-500/15" : "bg-zinc-800"
                      }`}>
                        {state === "complete" ? (
                          <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${dotColor}`} />
                        )}
                      </div>

                      {/* Label + duration */}
                      <div className="flex flex-col">
                        <span className={`text-xs font-medium ${isSelected ? "text-zinc-100" : "text-zinc-400"}`}>
                          {step.charAt(0).toUpperCase() + step.slice(1)}
                        </span>
                        <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                          {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : stepLogs.length > 0 ? `${stepLogs.length} logs` : "pending"}
                        </span>
                      </div>
                    </button>

                    {/* Iteration pills — inline right after the step button */}
                    {hasIterations && isSelected && (
                      <div className="flex items-center gap-0.5 ml-1.5">
                        {Array.from({ length: totalIterations }, (_, j) => j + 1).map((iter) => (
                          <button
                            key={iter}
                            onClick={() => {
                              if (step === "coding") setCodingIteration(iter);
                              else setReviewingIteration(iter);
                            }}
                            className={`
                              flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-medium tabular-nums
                              transition-all duration-150
                              ${iter === currentIter
                                ? "bg-white/[0.1] text-zinc-100 ring-1 ring-white/[0.15]"
                                : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"
                              }
                            `}
                            title={`Iteration ${iter}`}
                            style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                          >
                            {iter}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Connector between steps */}
                    {i < STEPS.length - 1 && (
                      <div className="mx-0.5 h-[2px] w-6 rounded-full bg-white/[0.06] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* Review Issues Bar — only when activeTab is reviewing              */}
        {/* ================================================================= */}
        {activeTab === "reviewing" && reviewIssues && reviewIssues.length > 0 && (
          <div className="mx-8 mb-4 shrink-0 fade-in-up" style={{ animationDelay: "0ms" }}>
            <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.03] px-5 py-4">
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-amber-500/60 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="flex-1 min-w-0">
                  {reviewSummary && (
                    <p className="text-xs text-zinc-400 mb-2.5 leading-relaxed">{reviewSummary}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {reviewIssues.map((issue, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-1.5 text-[11px] text-zinc-400"
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[9px] font-medium text-amber-400">
                          {i + 1}
                        </span>
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* Error Message                                                     */}
        {/* ================================================================= */}
        {run?.errorMessage && (displayStatus === "failed" || displayStatus === "rejected") && (
          <div className="mx-8 mb-4 rounded-xl border border-red-800/50 bg-red-950/30 px-5 py-3 shrink-0">
            <p className="text-sm text-red-400">{run.errorMessage}</p>
          </div>
        )}

        {/* ================================================================= */}
        {/* Log Viewer — fills remaining space                                */}
        {/* ================================================================= */}
        <div className="flex flex-1 flex-col overflow-hidden mx-8 mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] fade-in-up" style={{ animationDelay: "200ms" }}>
          {/* Terminal header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
              </div>
              <span className="ml-2 text-[11px] text-zinc-600" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                {activeTab}
                {getSelectedIteration(activeTab) != null ? ` (iteration ${getSelectedIteration(activeTab)})` : ""}
                {activeTabTiming ? ` — ${formatStepDuration(activeTabTiming.startedAt, activeTabTiming.endedAt)}` : ""}
              </span>
            </div>
            <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
              {logs.filter((l) => l.step === activeTab).length} lines
            </span>
          </div>

          {/* Log content — no step tabs, controlled by left card */}
          <StepLogViewer
            logs={logs}
            step={activeTab}
            selectedIteration={getSelectedIteration(activeTab)}
          />
        </div>
      </div>
    </>
  );
}
