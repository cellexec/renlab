"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePipelineLogs } from "../../hooks/usePipelineLogs";
import { PipelineSteps, formatStepDuration, getStepTimingKey } from "../../components/PipelineSteps";
import { ReviewScoreCard } from "../../components/ReviewScoreCard";
import { getSupabase } from "../../lib/supabase";
import type { PipelineRun, PipelineStep, PipelineLogEntry, StepTimings } from "../../pipelines";

const STEPS: PipelineStep[] = ["worktree", "coding", "reviewing", "merging"];

function StepLogViewer({ logs, step, selectedIteration }: { logs: PipelineLogEntry[]; step: PipelineStep; selectedIteration?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Filter by step, and optionally by iteration for coding/reviewing
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
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-xs text-zinc-600">{step} output{selectedIteration != null ? ` (iteration ${selectedIteration})` : ""}</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
        className="flex-1 overflow-y-auto p-4 text-[13px] leading-5"
      >
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            No output for this step yet.
          </div>
        ) : (
          (() => {
            // Build set of completed tool call IDs so we can hide their start entries
            const completedTools = new Set<string>();
            for (const e of filtered) {
              if (e.toolCallId?.endsWith("-end")) {
                completedTools.add(e.toolCallId.replace("-end", ""));
              }
            }
            return filtered.map((entry, i) => {
              // Hide start entries for completed tools (the end entry replaces them)
              if (entry.toolCallId?.endsWith("-start")) {
                const toolKey = entry.toolCallId.replace("-start", "");
                if (completedTools.has(toolKey)) return null;
              }
              // Thinking entries: only show if it's the very last entry (still active)
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
    </div>
  );
}

/** Extract review scores per iteration from logs */
function extractReviewScores(logs: PipelineLogEntry[]): Map<number, number> {
  const scores = new Map<number, number>();
  for (const log of logs) {
    if (log.step === "reviewing" && log.stream === "stdout") {
      const match = log.text.match(/^Review score: (\d+)\/100$/);
      if (match) {
        scores.set(log.iteration ?? 1, parseInt(match[1], 10));
      }
    }
  }
  return scores;
}

/** Extract review summary and issues for a specific iteration */
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

/** Count distinct iterations present in logs */
function getMaxIteration(logs: PipelineLogEntry[]): number {
  let max = 1;
  for (const log of logs) {
    if (log.iteration && log.iteration > max) max = log.iteration;
  }
  return max;
}

/** Get the timing for a step tab, handling iteration-keyed timings */
function getTabTiming(step: PipelineStep, stepTimings: StepTimings, selectedIteration?: number): { startedAt: number; endedAt: number | null } | undefined {
  const key = getStepTimingKey(step, stepTimings, selectedIteration);
  return stepTimings[key];
}

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
  // Per-tab iteration selection (null = show latest)
  const [codingIteration, setCodingIteration] = useState<number | null>(null);
  const [reviewingIteration, setReviewingIteration] = useState<number | null>(null);

  const totalIterations = Math.max(iteration, getMaxIteration(logs), run?.iterations ?? 1);
  const totalAttempts = (maxRetries > 0 ? maxRetries : (run?.maxRetries ?? 0)) + 1;

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
      .catch(() => {
        // Gracefully handle network/query errors — UI falls through to "Unknown spec"
      })
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
      // Trigger SSE reconnection to receive merge progress
      setSseVersion((v) => v + 1);
    } catch {
      setRetrying(false);
    }
  };

  // Extract review details for the selected iteration (default to latest)
  const { summary: reviewSummary, issues: reviewIssues } = extractReviewDetails(logs, reviewingIteration ?? totalIterations);

  // Extract score history for the ReviewScoreCard
  const allScores = extractReviewScores(logs);
  const previousScores: number[] = [];
  for (let i = 1; i < totalIterations; i++) {
    const s = allScores.get(i);
    if (s != null) previousScores.push(s);
  }

  // Determine selected iteration for the current tab
  const getSelectedIteration = (step: PipelineStep): number | undefined => {
    if (totalIterations <= 1) return undefined;
    if (step === "coding") return codingIteration ?? totalIterations;
    if (step === "reviewing") return reviewingIteration ?? totalIterations;
    return undefined;
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/pipelines")}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Pipeline Run</h1>
              <span className="text-xs text-zinc-600 font-mono bg-zinc-800 px-2 py-0.5 rounded">
                {runId.slice(0, 8)}
              </span>
            </div>
            {run && (
              <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
                <span>Started {new Date(run.createdAt).toLocaleString()}</span>
                {specInfo ? (
                  <>
                    <span className="text-zinc-700">·</span>
                    <Link
                      href={`/specifications/${run.specificationId}`}
                      className="text-blue-400 hover:text-blue-300 transition-colors truncate max-w-[300px]"
                      title={`${specInfo.title} (v${specInfo.versionNumber})`}
                    >
                      {specInfo.title} (v{specInfo.versionNumber})
                    </Link>
                  </>
                ) : specInfoLoading ? null : run.specificationId ? (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">Unknown spec</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PipelineSteps status={displayStatus} currentStep={displayStep} stepTimings={stepTimings} iteration={iteration} maxRetries={maxRetries > 0 ? maxRetries : (run?.maxRetries ?? 0)} />

          {canRetryMerge && (
            <button
              onClick={handleRetryMerge}
              disabled={retrying}
              className="ml-4 rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? "Retrying..." : status === "rejected" ? "Force Merge" : "Retry Merge"}
            </button>
          )}
          {isActive && !cancelling && (
            <button
              onClick={handleCancel}
              className="ml-4 rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50"
            >
              Cancel
            </button>
          )}
          {cancelling && (
            <span className="ml-4 text-sm text-zinc-500">Cancelling...</span>
          )}
        </div>
      </header>

      {/* Review score card */}
      {displayScore != null && (
        <div className="px-8 pt-5">
          <ReviewScoreCard
            score={displayScore}
            threshold={threshold}
            summary={reviewSummary}
            issues={reviewIssues}
            runId={runId}
            specificationId={run?.specificationId}
            previousScores={previousScores.length > 0 ? previousScores : undefined}
          />
        </div>
      )}

      {/* Error message */}
      {run?.errorMessage && (status === "failed" || status === "rejected") && (
        <div className="mx-8 mt-5 rounded-lg border border-red-800 bg-red-950/30 px-4 py-3">
          <p className="text-sm text-red-400">{run.errorMessage}</p>
        </div>
      )}

      {/* Step tabs + log viewer */}
      <div className="flex flex-1 flex-col overflow-hidden p-6 gap-3">
        <div className="flex items-center gap-1">
          {STEPS.map((step) => {
            const stepLogs = logs.filter((l) => l.step === step);
            const stepIdx = STEPS.indexOf(step);
            const currentIdx = currentStep ? STEPS.indexOf(currentStep) : -1;
            const selectedIter = getSelectedIteration(step);
            // When an iteration-aware step (coding/reviewing) has a non-final iteration
            // selected, that iteration completed successfully — show green even if the
            // overall pipeline failed on a later iteration.
            const isNonFinalIteration = (step === "coding" || step === "reviewing") && totalIterations > 1 && selectedIter != null && selectedIter < totalIterations;
            const stepState =
              status === "success" ? "complete"
              : (status === "failed" || status === "cancelled" || status === "rejected")
                ? isNonFinalIteration
                  ? "complete"
                  : (stepIdx < currentIdx ? "complete" : stepIdx === currentIdx ? "failed" : "pending")
              : stepIdx < currentIdx ? "complete"
              : stepIdx === currentIdx ? "active"
              : "pending";
            const timing = getTabTiming(step, stepTimings, selectedIter);

            return (
              <button
                key={step}
                onClick={() => setActiveTab(step)}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === step
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                {stepState === "complete" && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
                {stepState === "active" && (
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                )}
                {stepState === "failed" && (
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                )}
                {step.charAt(0).toUpperCase() + step.slice(1)}
                {timing && (
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    ({formatStepDuration(timing.startedAt, timing.endedAt)})
                  </span>
                )}
                {!timing && stepLogs.length > 0 && (
                  <span className="text-[10px] text-zinc-600">
                    ({stepLogs.length})
                  </span>
                )}
              </button>
            );
          })}

          {/* Iteration dropdown for coding/reviewing tabs */}
          {totalIterations > 1 && (activeTab === "coding" || activeTab === "reviewing") && (
            <select
              value={(activeTab === "coding" ? codingIteration : reviewingIteration) ?? totalIterations}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (activeTab === "coding") setCodingIteration(val);
                else setReviewingIteration(val);
              }}
              className="ml-auto rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
            >
              {Array.from({ length: totalIterations }, (_, i) => i + 1).map((iter) => (
                <option key={iter} value={iter}>
                  Iteration {iter}
                </option>
              ))}
            </select>
          )}
        </div>
        <StepLogViewer
          logs={logs}
          step={activeTab}
          selectedIteration={getSelectedIteration(activeTab)}
        />
      </div>
    </div>
  );
}
