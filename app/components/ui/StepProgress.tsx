"use client";

import { useState, useEffect, type ReactNode } from "react";

// =============================================================================
// StepProgress
// =============================================================================
//
// Generic step progress indicator extracted from PipelineSteps.tsx (feature
// pipelines) and the design-pipelines page. Supports four states per step
// (pending, active, complete, failed), connector lines between steps, and
// optional timing display.
//
// Usage:
//   <StepProgress
//     steps={[
//       { key: "worktree", label: "Worktree" },
//       { key: "coding",   label: "Coding" },
//       { key: "reviewing", label: "Reviewing" },
//       { key: "merging",  label: "Merging" },
//     ]}
//     getStepState={(key) => key === "coding" ? "active" : "pending"}
//   />

export type StepState = "pending" | "active" | "complete" | "failed";

export interface StepDef {
  /** Unique key for the step. */
  key: string;
  /** Display label. */
  label: string;
  /** Optional SVG path data for a custom icon. */
  iconPath?: string;
}

export interface StepTiming {
  startedAt: number;
  endedAt: number | null;
}

export interface StepProgressProps {
  /** The ordered list of steps. */
  steps: StepDef[];
  /** Return the state for a given step key. */
  getStepState: (key: string) => StepState;
  /** Optional timing for each step key. Used to show elapsed duration. */
  getStepTiming?: (key: string) => StepTiming | undefined;
  /** The currently active/selected step key (e.g. for click-to-select). */
  activeStep?: string;
  /** Called when a step is clicked. */
  onStepClick?: (key: string) => void;
  /** Layout direction. Default "horizontal". */
  direction?: "horizontal" | "vertical";
  /** Optional className for the root container. */
  className?: string;
}

// -- State-dependent styling ------------------------------------------------

const STATE_CIRCLE_CLASSES: Record<StepState, string> = {
  complete: "border-emerald-500 bg-emerald-500/20",
  active:   "border-amber-500 bg-amber-500/20 animate-pulse",
  failed:   "border-red-500 bg-red-500/20",
  pending:  "border-zinc-700 bg-zinc-800",
};

const STATE_TEXT_CLASSES: Record<StepState, string> = {
  complete: "text-emerald-400",
  active:   "text-amber-400",
  failed:   "text-red-400",
  pending:  "text-zinc-600",
};

const STATE_CONNECTOR_CLASSES: Record<StepState, string> = {
  complete: "bg-emerald-500/50",
  active:   "bg-zinc-700",
  failed:   "bg-zinc-700",
  pending:  "bg-zinc-700",
};

// -- Duration formatter (mm:ss) ---------------------------------------------

export function formatStepDuration(startedAt: number, endedAt: number | null): string {
  const elapsed = (endedAt ?? Date.now()) - startedAt;
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// -- Step icons by state ----------------------------------------------------

function StepIcon({ state, iconPath }: { state: StepState; iconPath?: string }) {
  if (iconPath) {
    const color = STATE_TEXT_CLASSES[state];
    return (
      <svg className={`h-3.5 w-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
      </svg>
    );
  }
  if (state === "complete") {
    return (
      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === "failed") {
    return (
      <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  const dotColor = state === "active" ? "bg-amber-400" : "bg-zinc-600";
  return <div className={`h-2 w-2 rounded-full ${dotColor}`} />;
}

// -- Component --------------------------------------------------------------

export function StepProgress({
  steps,
  getStepState,
  getStepTiming,
  activeStep,
  onStepClick,
  direction = "horizontal",
  className = "",
}: StepProgressProps) {
  // Tick the timer every second when there is an active timing without an end.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!getStepTiming) return;
    const hasRunning = steps.some((s) => {
      const t = getStepTiming(s.key);
      return t && t.endedAt == null;
    });
    if (!hasRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [steps, getStepTiming]);

  const isHorizontal = direction === "horizontal";

  return (
    <div className={`flex ${isHorizontal ? "items-center gap-2" : "flex-col gap-0"} ${className}`}>
      {steps.map((step, i) => {
        const state = getStepState(step.key);
        const timing = getStepTiming?.(step.key);
        const isSelected = activeStep === step.key;
        const clickable = !!onStepClick;

        return (
          <div key={step.key} className={`flex ${isHorizontal ? "items-center gap-2" : "items-start gap-3"}`}>
            {/* Step node */}
            <div
              className={`flex flex-col items-center gap-1 ${clickable ? "cursor-pointer" : ""}`}
              onClick={clickable ? () => onStepClick(step.key) : undefined}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${STATE_CIRCLE_CLASSES[state]} ${
                  isSelected ? "ring-2 ring-white/10" : ""
                }`}
              >
                <StepIcon state={state} iconPath={step.iconPath} />
              </div>
              <span className={`text-[11px] font-medium ${STATE_TEXT_CLASSES[state]}`}>
                {step.label}
              </span>
              {timing ? (
                <span className={`text-[10px] tabular-nums ${STATE_TEXT_CLASSES[state]}`} style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                  {formatStepDuration(timing.startedAt, timing.endedAt)}
                </span>
              ) : (
                <span className="text-[10px] tabular-nums text-transparent select-none">00:00</span>
              )}
            </div>

            {/* Connector */}
            {i < steps.length - 1 && (
              isHorizontal ? (
                <div className={`h-0.5 w-8 self-start mt-4 ${STATE_CONNECTOR_CLASSES[state]}`} />
              ) : (
                <div className={`w-0.5 min-h-[24px] ml-[15px] ${STATE_CONNECTOR_CLASSES[state]}`} />
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
