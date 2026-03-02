"use client";

import { useState, useEffect } from "react";
import type { PipelineStatus, PipelineStep, StepTimings } from "../pipelines";

const ALL_STEPS: { key: PipelineStep; label: string }[] = [
  { key: "worktree", label: "Worktree" },
  { key: "retrieving", label: "Retrieving" },
  { key: "coding", label: "Coding" },
  { key: "reviewing", label: "Reviewing" },
  { key: "merging", label: "Merging" },
  { key: "updating", label: "Updating" },
];

interface PipelineStepsProps {
  status: PipelineStatus;
  currentStep: PipelineStep | null;
  stepTimings?: StepTimings;
  iteration?: number;
  maxRetries?: number;
  hasKnowledge?: boolean;
}

function getStepState(
  stepKey: PipelineStep,
  status: PipelineStatus,
  currentStep: PipelineStep | null,
  steps: { key: PipelineStep; label: string }[],
): "pending" | "active" | "complete" | "failed" {
  const stepOrder = steps.map((s) => s.key);
  const stepIdx = stepOrder.indexOf(stepKey);
  const currentIdx = currentStep ? stepOrder.indexOf(currentStep) : -1;

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

export function formatStepDuration(startedAt: number, endedAt: number | null): string {
  const elapsed = (endedAt ?? Date.now()) - startedAt;
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Get the step timing key — handles iteration-suffixed keys (e.g., coding-2) */
export function getStepTimingKey(step: PipelineStep, stepTimings: StepTimings, selectedIteration?: number): string {
  if (step === "coding" || step === "reviewing") {
    // If a specific iteration is requested, use it
    if (selectedIteration) {
      const key = `${step}-${selectedIteration}`;
      if (stepTimings[key]) return key;
    }
    // Find the latest iteration key
    const keys = Object.keys(stepTimings).filter((k) => k.startsWith(`${step}-`));
    if (keys.length > 0) {
      return keys.sort().pop()!;
    }
    // Fallback to plain key (for older runs without iterations)
    return step;
  }
  return step;
}

const STATE_COLORS: Record<string, string> = {
  complete: "text-emerald-400",
  active: "text-amber-400",
  failed: "text-red-400",
  pending: "text-zinc-600",
};

export function PipelineSteps({ status, currentStep, stepTimings, iteration = 1, maxRetries = 0, hasKnowledge = false }: PipelineStepsProps) {
  const [, setTick] = useState(0);
  const totalAttempts = maxRetries + 1;

  // Filter steps based on whether knowledge base exists
  const STEPS = hasKnowledge
    ? ALL_STEPS
    : ALL_STEPS.filter((s) => s.key !== "retrieving" && s.key !== "updating");

  // Tick every second while there's an active step with timing
  useEffect(() => {
    const hasActive = stepTimings && Object.values(stepTimings).some((t) => t.endedAt == null);
    if (!hasActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [stepTimings]);

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const state = getStepState(step.key, status, currentStep, STEPS);
        const timingKey = stepTimings ? getStepTimingKey(step.key, stepTimings) : step.key;
        const timing = stepTimings?.[timingKey];
        const color = STATE_COLORS[state];

        // Show iteration info for coding/reviewing when in retry loop
        const showIteration = totalAttempts > 1 && (step.key === "coding" || step.key === "reviewing");
        const stepLabel = showIteration && state === "active"
          ? `${step.label} (${iteration}/${totalAttempts})`
          : step.label;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                  state === "complete"
                    ? "border-emerald-500 bg-emerald-500/20"
                    : state === "active"
                    ? "border-amber-500 bg-amber-500/20 animate-pulse"
                    : state === "failed"
                    ? "border-red-500 bg-red-500/20"
                    : "border-zinc-700 bg-zinc-800"
                }`}
              >
                {state === "complete" ? (
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : state === "failed" ? (
                  <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : state === "active" ? (
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-zinc-600" />
                )}
              </div>
              <span className={`text-[11px] font-medium ${color}`}>
                {stepLabel}
              </span>
              {timing ? (
                <span className={`text-[10px] tabular-nums ${color}`}>
                  {formatStepDuration(timing.startedAt, timing.endedAt)}
                </span>
              ) : (
                <span className="text-[10px] tabular-nums text-transparent select-none">
                  00:00
                </span>
              )}
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 self-start mt-4 ${
                  state === "complete" ? "bg-emerald-500/50" : "bg-zinc-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
