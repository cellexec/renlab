"use client";

import { useState, type ReactNode } from "react";

// =============================================================================
// Shared Props Interface
// =============================================================================

export interface StepDesignProps {
  steps: readonly string[];
  activeTab: string;
  setActiveTab: (step: string) => void;
  getStepState: (step: string) => "complete" | "active" | "failed" | "pending";
  getTabTiming: (step: string) => { startedAt: number; endedAt: number | null } | undefined;
  formatStepDuration: (startedAt: number, endedAt: number | null) => string;
  getStepLogCount: (step: string) => number;
  totalIterations: number;
  codingIteration: number | null;
  reviewingIteration: number | null;
  setCodingIteration: (iter: number) => void;
  setReviewingIteration: (iter: number) => void;
}

// =============================================================================
// Shared Utilities
// =============================================================================

const MONO_FONT = "var(--font-geist-mono), ui-monospace, monospace";

const STEP_ICONS: Record<string, (cls: string) => ReactNode> = {
  worktree: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" />
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
  retrieving: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  updating: (cls) => (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
  ),
};

function StepIcon({ step, className }: { step: string; className: string }) {
  const icon = STEP_ICONS[step];
  return icon ? icon(className) : null;
}

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

const STATE_GLOW: Record<string, string> = {
  complete: "shadow-[0_0_12px_rgba(16,185,129,0.15)]",
  active: "shadow-[0_0_12px_rgba(251,191,36,0.15)]",
  failed: "shadow-[0_0_12px_rgba(239,68,68,0.15)]",
  pending: "",
};

const STATE_BORDER: Record<string, string> = {
  complete: "border-emerald-500/30",
  active: "border-amber-500/30",
  failed: "border-red-500/30",
  pending: "border-white/[0.06]",
};

const STATE_BG: Record<string, string> = {
  complete: "bg-emerald-500/10",
  active: "bg-amber-500/10",
  failed: "bg-red-500/10",
  pending: "bg-white/[0.02]",
};

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusIndicator({ state, size = "sm" }: { state: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3 w-3";
  const dot = size === "lg" ? "h-2 w-2" : size === "md" ? "h-1.5 w-1.5" : "h-1 w-1";
  if (state === "complete") return <CheckIcon className={`${s} text-emerald-400`} />;
  if (state === "failed") return <XIcon className={`${s} text-red-400`} />;
  if (state === "active") return <SpinnerIcon className={`${s} text-amber-400`} />;
  return <div className={`${dot} rounded-full bg-zinc-600`} />;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hasIterations(step: string): boolean {
  return step === "coding" || step === "reviewing";
}

function IterationSelector({
  step,
  totalIterations,
  codingIteration,
  reviewingIteration,
  setCodingIteration,
  setReviewingIteration,
  variant = "pills",
}: {
  step: string;
  totalIterations: number;
  codingIteration: number | null;
  reviewingIteration: number | null;
  setCodingIteration: (iter: number) => void;
  setReviewingIteration: (iter: number) => void;
  variant?: "pills" | "dots" | "dropdown" | "vertical" | "stacked" | "timeline";
}) {
  if (totalIterations <= 1 || !hasIterations(step)) return null;
  const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
  const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
  const iters = Array.from({ length: totalIterations }, (_, j) => j + 1);

  if (variant === "dots") {
    return (
      <div className="flex items-center gap-1">
        {iters.map((iter) => (
          <button
            key={iter}
            onClick={(e) => { e.stopPropagation(); setIter(iter); }}
            className={`h-2 w-2 rounded-full transition-all duration-200 ${
              iter === currentIter
                ? "bg-white/80 scale-125"
                : "bg-white/20 hover:bg-white/40"
            }`}
            title={`Iteration ${iter}`}
          />
        ))}
      </div>
    );
  }

  if (variant === "dropdown") {
    return (
      <select
        value={currentIter}
        onChange={(e) => { e.stopPropagation(); setIter(Number(e.target.value)); }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white/[0.04] border border-white/[0.08] rounded-md text-[10px] text-zinc-400 px-1.5 py-0.5 appearance-none cursor-pointer hover:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-white/[0.15]"
        style={{ fontFamily: MONO_FONT }}
      >
        {iters.map((iter) => (
          <option key={iter} value={iter} className="bg-zinc-900 text-zinc-300">
            iter {iter}
          </option>
        ))}
      </select>
    );
  }

  if (variant === "vertical") {
    return (
      <div className="flex flex-col items-center gap-0.5 mt-1">
        {iters.map((iter) => (
          <button
            key={iter}
            onClick={(e) => { e.stopPropagation(); setIter(iter); }}
            className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-medium tabular-nums transition-all duration-150 ${
              iter === currentIter
                ? "bg-white/[0.12] text-zinc-100 ring-1 ring-white/[0.2]"
                : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"
            }`}
            style={{ fontFamily: MONO_FONT }}
          >
            {iter}
          </button>
        ))}
      </div>
    );
  }

  if (variant === "stacked") {
    return (
      <div className="flex items-center gap-0.5">
        {iters.map((iter) => (
          <button
            key={iter}
            onClick={(e) => { e.stopPropagation(); setIter(iter); }}
            className={`relative flex h-6 items-center rounded-md px-2 text-[10px] font-medium tabular-nums transition-all duration-200 ${
              iter === currentIter
                ? "bg-white/[0.1] text-zinc-200 z-10"
                : "bg-white/[0.02] text-zinc-600 hover:text-zinc-400 -ml-1"
            }`}
            style={{
              fontFamily: MONO_FONT,
              ...(iter !== currentIter ? { marginLeft: iter > 1 ? "-4px" : "0" } : {}),
            }}
          >
            #{iter}
          </button>
        ))}
      </div>
    );
  }

  if (variant === "timeline") {
    return (
      <div className="flex items-center gap-0">
        {iters.map((iter, i) => (
          <div key={iter} className="flex items-center">
            <button
              onClick={(e) => { e.stopPropagation(); setIter(iter); }}
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold tabular-nums transition-all duration-200 ${
                iter === currentIter
                  ? "bg-violet-500/30 text-violet-300 ring-1 ring-violet-500/40"
                  : iter < currentIter
                    ? "bg-white/[0.08] text-zinc-500"
                    : "bg-white/[0.03] text-zinc-700"
              }`}
              style={{ fontFamily: MONO_FONT }}
            >
              {iter}
            </button>
            {i < iters.length - 1 && (
              <div className={`h-[1px] w-2 ${iter < currentIter ? "bg-white/[0.1]" : "bg-white/[0.04]"}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Default: pills
  return (
    <div className="flex items-center gap-0.5">
      {iters.map((iter) => (
        <button
          key={iter}
          onClick={(e) => { e.stopPropagation(); setIter(iter); }}
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium tabular-nums transition-all duration-150 ${
            iter === currentIter
              ? "bg-white/[0.12] text-zinc-100 ring-1 ring-white/[0.2]"
              : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"
          }`}
          style={{ fontFamily: MONO_FONT }}
        >
          {iter}
        </button>
      ))}
    </div>
  );
}


// =============================================================================
// Design 1: Horizontal Stepper with Connected Nodes
// -----------------------------------------------------------------------------
// Classic stepper UI — large circles connected by animated lines that fill in
// as steps complete. Iterations branch off below as a mini-timeline with
// smaller connected dots. The active node pulses with a soft glow. Clean,
// professional, immediately understandable.
// =============================================================================

export function StepDesign1(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl px-8 py-6">
      <div className="flex items-start justify-between">
        {steps.map((step, i) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);

          const nodeSize = "h-12 w-12";
          const nodeBg = state === "complete"
            ? "bg-emerald-500/15 border-emerald-500/40"
            : state === "active"
              ? "bg-amber-500/15 border-amber-500/40"
              : state === "failed"
                ? "bg-red-500/15 border-red-500/40"
                : "bg-zinc-800/50 border-zinc-700/50";

          return (
            <div key={step} className="flex items-start flex-1">
              {/* Node column */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setActiveTab(step)}
                  className={`
                    ${nodeSize} rounded-full border-2 ${nodeBg}
                    flex items-center justify-center cursor-pointer
                    transition-all duration-300
                    ${isSelected ? `ring-2 ring-offset-2 ring-offset-zinc-950 ${
                      state === "complete" ? "ring-emerald-500/30" : state === "active" ? "ring-amber-500/30" : state === "failed" ? "ring-red-500/30" : "ring-white/[0.1]"
                    } ${STATE_GLOW[state]}` : "hover:scale-105"}
                  `}
                >
                  <StatusIndicator state={state} size="lg" />
                </button>

                {/* Step label */}
                <button
                  onClick={() => setActiveTab(step)}
                  className="mt-2.5 cursor-pointer group"
                >
                  <span className={`text-xs font-medium transition-colors ${
                    isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]
                  } group-hover:text-zinc-200`}>
                    {capitalize(step)}
                  </span>
                </button>

                {/* Duration */}
                <span
                  className="mt-0.5 text-[10px] text-zinc-600 tabular-nums"
                  style={{ fontFamily: MONO_FONT }}
                >
                  {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount} logs` : "--:--"}
                </span>

                {/* Iteration branch below */}
                {hasIterations(step) && totalIterations > 1 && (
                  <div className="mt-3 flex flex-col items-center">
                    <div className="h-3 w-[1px] bg-white/[0.08]" />
                    <IterationSelector
                      step={step}
                      totalIterations={totalIterations}
                      codingIteration={codingIteration}
                      reviewingIteration={reviewingIteration}
                      setCodingIteration={setCodingIteration}
                      setReviewingIteration={setReviewingIteration}
                      variant="timeline"
                    />
                  </div>
                )}
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="flex-1 flex items-center pt-6">
                  <div
                    className={`h-[2px] w-full rounded-full transition-all duration-500 ${
                      state === "complete" ? "bg-emerald-500/40" : "bg-white/[0.06]"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 2: Vertical Timeline
// -----------------------------------------------------------------------------
// A left-aligned vertical timeline with a continuous line running down. Each
// step is a node on the line with content expanding to the right. Iterations
// appear as indented sub-nodes branching off the main timeline — like a git
// log visualization. Elegant for long pipelines with many future steps.
// =============================================================================

export function StepDesign2(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-6">
      <div className="flex flex-col">
        {steps.map((step, i) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = Array.from({ length: totalIterations }, (_, j) => j + 1);

          return (
            <div key={step} className="flex gap-0">
              {/* Timeline column */}
              <div className="flex flex-col items-center w-8 shrink-0">
                {/* Top connector */}
                {i > 0 && (
                  <div className={`w-[2px] h-3 ${
                    getStepState(steps[i - 1]) === "complete" ? "bg-emerald-500/40" : "bg-white/[0.06]"
                  }`} />
                )}
                {i === 0 && <div className="h-3" />}

                {/* Node */}
                <button
                  onClick={() => setActiveTab(step)}
                  className={`
                    flex h-8 w-8 items-center justify-center rounded-full
                    border-2 shrink-0 cursor-pointer transition-all duration-300
                    ${state === "complete" ? "border-emerald-500/40 bg-emerald-500/10" :
                      state === "active" ? "border-amber-500/40 bg-amber-500/10" :
                      state === "failed" ? "border-red-500/40 bg-red-500/10" :
                      "border-zinc-700 bg-zinc-800/50"}
                    ${isSelected ? STATE_GLOW[state] : "hover:brightness-125"}
                  `}
                >
                  <StatusIndicator state={state} size="md" />
                </button>

                {/* Bottom connector */}
                <div className={`w-[2px] flex-1 min-h-3 ${
                  state === "complete" ? "bg-emerald-500/40" : "bg-white/[0.06]"
                } ${i === steps.length - 1 && !showIter ? "opacity-0" : ""}`} />

                {/* Iteration branch */}
                {showIter && (
                  <div className="flex flex-col items-center">
                    {iters.map((iter, j) => (
                      <div key={iter} className="flex flex-col items-center">
                        <div className={`w-[2px] h-2 ${
                          iter <= currentIter ? "bg-violet-500/30" : "bg-white/[0.04]"
                        }`} />
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveTab(step); setIter(iter); }}
                          className={`
                            flex h-5 w-5 items-center justify-center rounded-full
                            text-[9px] font-medium tabular-nums transition-all duration-200
                            ${iter === currentIter
                              ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30"
                              : "bg-white/[0.03] text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-400"}
                          `}
                          style={{ fontFamily: MONO_FONT }}
                        >
                          {iter}
                        </button>
                      </div>
                    ))}
                    {i < steps.length - 1 && <div className="w-[2px] h-3 bg-white/[0.06]" />}
                  </div>
                )}
              </div>

              {/* Content */}
              <button
                onClick={() => setActiveTab(step)}
                className={`
                  flex-1 ml-4 mb-1 rounded-xl px-4 py-3 cursor-pointer
                  transition-all duration-200 text-left
                  ${isSelected
                    ? `border ${STATE_BORDER[state]} ${STATE_BG[state]} ${STATE_GLOW[state]}`
                    : "border border-transparent hover:bg-white/[0.02]"}
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StepIcon step={step} className={`h-4 w-4 ${STATE_TEXT_COLOR[state]}`} />
                    <span className={`text-sm font-medium ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                      {capitalize(step)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {timing && (
                      <span className="text-[11px] text-zinc-500 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                        {formatStepDuration(timing.startedAt, timing.endedAt)}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                      {logCount > 0 ? `${logCount} lines` : ""}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 3: Segmented Progress Bar
// -----------------------------------------------------------------------------
// A single continuous horizontal bar divided into segments — one per step.
// Each segment is colored by its state and sized proportionally. The active
// segment features a shimmer animation. Below the bar, step labels align under
// their segment. Iteration selector appears as a subtle range-style control
// below the coding/reviewing segments. Minimal, information-dense.
// =============================================================================

export function StepDesign3(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const segmentColors: Record<string, string> = {
    complete: "bg-emerald-500/50",
    active: "bg-amber-500/50",
    failed: "bg-red-500/50",
    pending: "bg-zinc-800",
  };

  const shimmer = `
    @keyframes shimmer-3 {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-6">
      <style>{shimmer}</style>

      {/* Progress bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-900 border border-white/[0.04] gap-[2px] p-[2px]">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;

          return (
            <button
              key={step}
              onClick={() => setActiveTab(step)}
              className={`
                flex-1 rounded-full cursor-pointer transition-all duration-300
                ${segmentColors[state]}
                ${isSelected ? "ring-1 ring-white/[0.2] ring-offset-1 ring-offset-zinc-950" : "hover:brightness-125"}
                ${state === "active" ? "relative overflow-hidden" : ""}
              `}
            >
              {state === "active" && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer-3 2s ease-in-out infinite",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Labels row */}
      <div className="flex mt-3">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);

          return (
            <button
              key={step}
              onClick={() => setActiveTab(step)}
              className="flex-1 flex flex-col items-center cursor-pointer group"
            >
              <span className={`text-[11px] font-medium transition-colors ${
                isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]
              } group-hover:text-zinc-200`}>
                {capitalize(step)}
              </span>
              <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : "--:--"}
              </span>

              {/* Iteration control */}
              {hasIterations(step) && totalIterations > 1 && (
                <div className="mt-1.5">
                  <IterationSelector
                    step={step}
                    totalIterations={totalIterations}
                    codingIteration={codingIteration}
                    reviewingIteration={reviewingIteration}
                    setCodingIteration={setCodingIteration}
                    setReviewingIteration={setReviewingIteration}
                    variant="dots"
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 4: Card Grid
// -----------------------------------------------------------------------------
// Each step is a distinct mini card in a responsive grid. Cards have a subtle
// glow based on state. The active card is visually elevated with a brighter
// border and shadow. For steps with iterations, the card shows a tabbed
// footer — stacked card edges peek out behind the main card to suggest depth.
// Perfect for dashboards where each step might contain rich info later.
// =============================================================================

export function StepDesign4(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="grid grid-cols-4 gap-3">
      {steps.map((step) => {
        const state = getStepState(step);
        const isSelected = activeTab === step;
        const timing = getTabTiming(step);
        const logCount = getStepLogCount(step);
        const showIter = hasIterations(step) && totalIterations > 1;
        const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
        const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
        const iters = Array.from({ length: totalIterations }, (_, j) => j + 1);

        return (
          <div key={step} className="relative">
            {/* Stacked card effect for iterations */}
            {showIter && totalIterations > 1 && (
              <>
                <div className="absolute inset-x-2 -bottom-1 h-full rounded-xl border border-white/[0.03] bg-white/[0.01]" />
                {totalIterations > 2 && (
                  <div className="absolute inset-x-4 -bottom-2 h-full rounded-xl border border-white/[0.02] bg-white/[0.005]" />
                )}
              </>
            )}

            <button
              onClick={() => setActiveTab(step)}
              className={`
                relative w-full rounded-2xl border p-4 text-left cursor-pointer
                transition-all duration-300 backdrop-blur-xl
                ${isSelected
                  ? `${STATE_BORDER[state]} ${STATE_BG[state]} ${STATE_GLOW[state]}`
                  : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]"}
              `}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${STATE_BG[state]}`}>
                  <StepIcon step={step} className={`h-4.5 w-4.5 ${STATE_TEXT_COLOR[state]}`} />
                </div>
                <StatusIndicator state={state} size="md" />
              </div>

              {/* Label */}
              <div className="text-sm font-medium text-zinc-200 mb-1">{capitalize(step)}</div>

              {/* Meta */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                  {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : "--:--"}
                </span>
                {logCount > 0 && (
                  <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                    {logCount} lines
                  </span>
                )}
              </div>

              {/* Iteration tabs */}
              {showIter && (
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-white/[0.06]">
                  {iters.map((iter) => (
                    <button
                      key={iter}
                      onClick={(e) => { e.stopPropagation(); setIter(iter); }}
                      className={`
                        flex-1 py-1 rounded-md text-[10px] font-medium tabular-nums text-center
                        transition-all duration-150
                        ${iter === currentIter
                          ? "bg-white/[0.1] text-zinc-200"
                          : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"}
                      `}
                      style={{ fontFamily: MONO_FONT }}
                    >
                      #{iter}
                    </button>
                  ))}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}


// =============================================================================
// Design 5: Tab Strip with Expanding Sub-Tabs
// -----------------------------------------------------------------------------
// A horizontal tab strip that mimics a browser tab bar. The selected step
// tab is elevated and connects to the content below. When a step with
// iterations is selected, a secondary row of sub-tabs slides in from below
// with a smooth height animation. The sub-tabs show iteration number and
// timing. Clean hierarchy: step > iteration.
// =============================================================================

export function StepDesign5(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const showSubTabs = hasIterations(activeTab) && totalIterations > 1;
  const currentIter = activeTab === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
  const setIter = activeTab === "coding" ? setCodingIteration : setReviewingIteration;
  const iters = Array.from({ length: totalIterations }, (_, j) => j + 1);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      {/* Primary tab strip */}
      <div className="flex border-b border-white/[0.06]">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);

          return (
            <button
              key={step}
              onClick={() => setActiveTab(step)}
              className={`
                flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5
                cursor-pointer transition-all duration-200 relative
                ${isSelected
                  ? "bg-white/[0.04]"
                  : "hover:bg-white/[0.02]"}
              `}
            >
              {/* Active indicator bar */}
              {isSelected && (
                <div className={`absolute bottom-0 left-2 right-2 h-[2px] rounded-full ${
                  state === "complete" ? "bg-emerald-500" :
                  state === "active" ? "bg-amber-500" :
                  state === "failed" ? "bg-red-500" :
                  "bg-zinc-600"
                }`} />
              )}

              {/* Status dot */}
              <div className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 ${
                state === "complete" ? "bg-emerald-500/15" :
                state === "active" ? "bg-amber-500/15" :
                state === "failed" ? "bg-red-500/15" :
                "bg-zinc-800"
              }`}>
                {state === "complete" ? (
                  <CheckIcon className="w-2.5 h-2.5 text-emerald-400" />
                ) : state === "failed" ? (
                  <XIcon className="w-2.5 h-2.5 text-red-400" />
                ) : state === "active" ? (
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                ) : (
                  <div className="h-1 w-1 rounded-full bg-zinc-600" />
                )}
              </div>

              <div className="flex flex-col items-start">
                <span className={`text-xs font-medium ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                  {capitalize(step)}
                </span>
                <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                  {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount} logs` : "pending"}
                </span>
              </div>

              {/* Iteration badge */}
              {hasIterations(step) && totalIterations > 1 && (
                <span className="text-[9px] text-zinc-600 bg-white/[0.04] rounded-full px-1.5 py-0.5 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                  x{totalIterations}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab strip for iterations */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: showSubTabs ? "48px" : "0px" }}
      >
        <div className="flex items-center gap-1 px-4 py-2 bg-white/[0.01] border-b border-white/[0.04]">
          <span className="text-[10px] text-zinc-600 mr-2">Iterations</span>
          {iters.map((iter) => (
            <button
              key={iter}
              onClick={() => setIter(iter)}
              className={`
                flex items-center gap-1.5 rounded-lg px-3 py-1.5
                text-[11px] font-medium tabular-nums cursor-pointer
                transition-all duration-200
                ${iter === currentIter
                  ? "bg-white/[0.08] text-zinc-200 ring-1 ring-white/[0.1]"
                  : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"}
              `}
              style={{ fontFamily: MONO_FONT }}
            >
              <span className="text-[10px]">#{iter}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// Design 6: Radial / Circular Arc
// -----------------------------------------------------------------------------
// Steps arranged in a semicircular arc at the top, rendered as SVG. Each step
// is a node on the arc with connecting lines following the curve. The active
// step is visually highlighted with a glow effect. Below the arc, a small
// panel shows the selected step's details and iteration selector. Futuristic
// and visually striking — great for a command-center aesthetic.
// =============================================================================

export function StepDesign6(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const width = 600;
  const height = 140;
  const cx = width / 2;
  const cy = height + 20;
  const radius = 160;

  // Arc from ~150deg to ~30deg (left to right across the top)
  const startAngle = Math.PI * 0.82;
  const endAngle = Math.PI * 0.18;
  const angleSpan = startAngle - endAngle;

  const positions = steps.map((_, i) => {
    const angle = startAngle - (i / (steps.length - 1)) * angleSpan;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy - radius * Math.sin(angle),
    };
  });

  const stateStrokeColor: Record<string, string> = {
    complete: "#10b981",
    active: "#f59e0b",
    failed: "#ef4444",
    pending: "#3f3f46",
  };

  const stateFillColor: Record<string, string> = {
    complete: "rgba(16,185,129,0.15)",
    active: "rgba(245,158,11,0.15)",
    failed: "rgba(239,68,68,0.15)",
    pending: "rgba(63,63,70,0.3)",
  };

  const selectedStep = activeTab;
  const selectedTiming = getTabTiming(selectedStep);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto max-w-[600px]">
        <defs>
          {steps.map((step) => {
            const state = getStepState(step);
            const color = stateStrokeColor[state];
            return (
              <filter key={`glow-${step}`} id={`glow-6-${step}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.4" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feComposite in="SourceGraphic" in2="glow" operator="over" />
              </filter>
            );
          })}
        </defs>

        {/* Arc path (background) */}
        <path
          d={`M ${positions[0].x} ${positions[0].y} A ${radius} ${radius} 0 0 1 ${positions[positions.length - 1].x} ${positions[positions.length - 1].y}`}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="2"
        />

        {/* Connector segments */}
        {positions.map((pos, i) => {
          if (i === positions.length - 1) return null;
          const next = positions[i + 1];
          const state = getStepState(steps[i]);
          return (
            <line
              key={`conn-${i}`}
              x1={pos.x} y1={pos.y}
              x2={next.x} y2={next.y}
              stroke={state === "complete" ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.06)"}
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}

        {/* Step nodes */}
        {steps.map((step, i) => {
          const pos = positions[i];
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const nodeRadius = isSelected ? 22 : 18;

          return (
            <g
              key={step}
              className="cursor-pointer"
              onClick={() => setActiveTab(step)}
              filter={isSelected ? `url(#glow-6-${step})` : undefined}
            >
              {/* Outer ring on selected */}
              {isSelected && (
                <circle
                  cx={pos.x} cy={pos.y}
                  r={nodeRadius + 4}
                  fill="none"
                  stroke={stateStrokeColor[state]}
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  strokeDasharray="4 3"
                />
              )}

              <circle
                cx={pos.x} cy={pos.y}
                r={nodeRadius}
                fill={stateFillColor[state]}
                stroke={stateStrokeColor[state]}
                strokeWidth={isSelected ? 2 : 1.5}
                strokeOpacity={isSelected ? 0.8 : 0.5}
              />

              {/* Status icon via circle/check */}
              {state === "complete" && (
                <path
                  d={`M ${pos.x - 5} ${pos.y} l 3.5 3.5 7 -7`}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {state === "failed" && (
                <>
                  <line x1={pos.x - 4} y1={pos.y - 4} x2={pos.x + 4} y2={pos.y + 4} stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                  <line x1={pos.x + 4} y1={pos.y - 4} x2={pos.x - 4} y2={pos.y + 4} stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
              {state === "active" && (
                <circle cx={pos.x} cy={pos.y} r="3" fill="#f59e0b" opacity="0.8">
                  <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {state === "pending" && (
                <circle cx={pos.x} cy={pos.y} r="2.5" fill="#52525b" />
              )}

              {/* Label below node */}
              <text
                x={pos.x}
                y={pos.y + nodeRadius + 14}
                textAnchor="middle"
                fill={isSelected ? "#e4e4e7" : stateStrokeColor[state]}
                fontSize="11"
                fontWeight={isSelected ? "500" : "400"}
              >
                {capitalize(step)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Detail strip below arc */}
      <div className="flex items-center justify-center gap-4 mt-2">
        {selectedTiming && (
          <span className="text-[11px] text-zinc-500 tabular-nums" style={{ fontFamily: MONO_FONT }}>
            {formatStepDuration(selectedTiming.startedAt, selectedTiming.endedAt)}
          </span>
        )}
        {hasIterations(selectedStep) && totalIterations > 1 && (
          <IterationSelector
            step={selectedStep}
            totalIterations={totalIterations}
            codingIteration={codingIteration}
            reviewingIteration={reviewingIteration}
            setCodingIteration={setCodingIteration}
            setReviewingIteration={setReviewingIteration}
            variant="pills"
          />
        )}
      </div>
    </div>
  );
}


// =============================================================================
// Design 7: Kanban-Style Columns
// -----------------------------------------------------------------------------
// Four columns side by side, each representing a step — like a kanban board.
// Each column has a header showing the step name and status, with a subtle
// background tint. The column body shows log count and timing. Iterations
// appear as cards stacked inside the column body for coding/reviewing.
// Familiar project-management feel, excellent for showing "work in progress."
// =============================================================================

export function StepDesign7(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((step) => {
        const state = getStepState(step);
        const isSelected = activeTab === step;
        const timing = getTabTiming(step);
        const logCount = getStepLogCount(step);
        const showIter = hasIterations(step) && totalIterations > 1;
        const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
        const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
        const iters = Array.from({ length: totalIterations }, (_, j) => j + 1);

        const headerAccent = state === "complete" ? "border-emerald-500/40" :
          state === "active" ? "border-amber-500/40" :
          state === "failed" ? "border-red-500/40" :
          "border-zinc-700/40";

        return (
          <button
            key={step}
            onClick={() => setActiveTab(step)}
            className={`
              flex flex-col rounded-xl border overflow-hidden cursor-pointer
              transition-all duration-300 text-left
              ${isSelected
                ? `${STATE_BORDER[state]} ${STATE_GLOW[state]} bg-white/[0.03]`
                : "border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/[0.1]"}
            `}
          >
            {/* Column header with top accent */}
            <div className={`border-t-2 ${headerAccent} px-3 py-2.5 bg-white/[0.01]`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIndicator state={state} size="sm" />
                  <span className={`text-xs font-medium ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                    {capitalize(step)}
                  </span>
                </div>
                {logCount > 0 && (
                  <span className="text-[9px] text-zinc-600 bg-white/[0.04] rounded-full px-1.5 py-0.5 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                    {logCount}
                  </span>
                )}
              </div>
            </div>

            {/* Column body */}
            <div className="flex-1 px-3 py-2.5">
              {/* Timing */}
              <div className="text-[11px] text-zinc-500 tabular-nums mb-2" style={{ fontFamily: MONO_FONT }}>
                {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : "--:--"}
              </div>

              {/* Iteration cards */}
              {showIter && (
                <div className="flex flex-col gap-1">
                  {iters.map((iter) => (
                    <div
                      key={iter}
                      onClick={(e) => { e.stopPropagation(); setActiveTab(step); setIter(iter); }}
                      className={`
                        rounded-lg px-2.5 py-1.5 text-[10px] tabular-nums cursor-pointer
                        transition-all duration-150 border
                        ${iter === currentIter
                          ? "bg-white/[0.06] border-white/[0.1] text-zinc-300"
                          : "bg-white/[0.01] border-white/[0.03] text-zinc-600 hover:bg-white/[0.04]"}
                      `}
                      style={{ fontFamily: MONO_FONT }}
                    >
                      Iteration {iter}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}


// =============================================================================
// Design 8: Breadcrumb Trail
// -----------------------------------------------------------------------------
// Steps displayed as a chevron breadcrumb — each step is a segment with an
// angled right edge that connects to the next, like a folder path or a
// wizard progress indicator. The active step is highlighted with the state
// color. Clicking a step with iterations reveals a compact dropdown below
// the breadcrumb. Space-efficient and instantly familiar.
// =============================================================================

export function StepDesign8(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4">
      {/* Breadcrumb */}
      <div className="flex items-stretch">
        {steps.map((step, i) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const showIter = hasIterations(step) && totalIterations > 1;

          const bgColor = isSelected
            ? state === "complete" ? "bg-emerald-500/10" :
              state === "active" ? "bg-amber-500/10" :
              state === "failed" ? "bg-red-500/10" :
              "bg-white/[0.04]"
            : "bg-white/[0.01] hover:bg-white/[0.03]";

          const chevronColor = isSelected
            ? state === "complete" ? "#10b981" :
              state === "active" ? "#f59e0b" :
              state === "failed" ? "#ef4444" :
              "rgba(255,255,255,0.06)"
            : "rgba(255,255,255,0.04)";

          return (
            <div key={step} className="flex items-stretch flex-1">
              <button
                onClick={() => {
                  setActiveTab(step);
                  if (showIter) {
                    setOpenDropdown(openDropdown === step ? null : step);
                  } else {
                    setOpenDropdown(null);
                  }
                }}
                className={`
                  flex-1 flex items-center gap-2 px-4 py-3 cursor-pointer
                  transition-all duration-200 relative
                  ${bgColor}
                  ${i === 0 ? "rounded-l-xl" : ""}
                  ${i === steps.length - 1 ? "rounded-r-xl" : ""}
                `}
              >
                <StatusIndicator state={state} size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className={`text-[11px] font-medium truncate ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                    {capitalize(step)}
                  </span>
                  <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                    {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : "pending"}
                  </span>
                </div>

                {/* Iteration badge */}
                {showIter && (
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[9px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                      x{totalIterations}
                    </span>
                    <svg className={`w-3 h-3 text-zinc-600 transition-transform duration-200 ${openDropdown === step ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                )}
              </button>

              {/* Chevron separator */}
              {i < steps.length - 1 && (
                <div className="flex items-center -mx-[1px] z-10">
                  <svg width="12" height="100%" viewBox="0 0 12 40" preserveAspectRatio="none" className="h-full">
                    <path d="M 0 0 L 10 20 L 0 40" fill="none" stroke={chevronColor} strokeWidth="2" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Iteration dropdown */}
      {openDropdown && hasIterations(openDropdown) && totalIterations > 1 && (
        <div className="mt-2 flex items-center gap-1.5 px-2 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <span className="text-[10px] text-zinc-600 mr-1">Iterations:</span>
          {Array.from({ length: totalIterations }, (_, j) => j + 1).map((iter) => {
            const currentIter = openDropdown === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
            const setIter = openDropdown === "coding" ? setCodingIteration : setReviewingIteration;

            return (
              <button
                key={iter}
                onClick={() => setIter(iter)}
                className={`
                  flex items-center gap-1 rounded-md px-2.5 py-1
                  text-[10px] font-medium tabular-nums cursor-pointer
                  transition-all duration-150
                  ${iter === currentIter
                    ? "bg-white/[0.08] text-zinc-200 ring-1 ring-white/[0.12]"
                    : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"}
                `}
                style={{ fontFamily: MONO_FONT }}
              >
                #{iter}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// =============================================================================
// Design 9: Metro / Transit Line
// -----------------------------------------------------------------------------
// Inspired by a subway/metro map. A thick colored line runs horizontally with
// station markers at each step. The line color transitions based on progress.
// Active station has a pulsing ring animation. Station names are below,
// durations above. Iterations appear as branching "transfer lines" that
// diverge below the station with their own smaller stops. Fun, memorable,
// and scalable for many steps.
// =============================================================================

export function StepDesign9(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const lineColor = (state: string) => {
    if (state === "complete") return "bg-emerald-500/60";
    if (state === "active") return "bg-amber-500/60";
    return "bg-zinc-800";
  };

  const stationRing = (state: string, isSelected: boolean) => {
    const base = state === "complete" ? "border-emerald-500" :
      state === "active" ? "border-amber-500" :
      state === "failed" ? "border-red-500" :
      "border-zinc-700";
    return `${base} ${isSelected ? "ring-4 ring-offset-2 ring-offset-zinc-950 " + (
      state === "complete" ? "ring-emerald-500/20" :
      state === "active" ? "ring-amber-500/20" :
      state === "failed" ? "ring-red-500/20" :
      "ring-zinc-700/20"
    ) : ""}`;
  };

  const stationFill = (state: string) => {
    if (state === "complete") return "bg-emerald-500";
    if (state === "active") return "bg-amber-500";
    if (state === "failed") return "bg-red-500";
    return "bg-zinc-700";
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl px-8 py-6">
      {/* Duration row (above line) */}
      <div className="flex mb-2">
        {steps.map((step, i) => {
          const timing = getTabTiming(step);
          return (
            <div key={step} className={`flex-1 text-center ${i > 0 ? "" : ""}`}>
              <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Metro line and stations */}
      <div className="relative flex items-center h-10">
        {/* Background line */}
        <div className="absolute left-4 right-4 h-1 rounded-full bg-zinc-800 top-1/2 -translate-y-1/2" />

        {/* Progress line segments */}
        {steps.map((step, i) => {
          const state = getStepState(step);
          if (state === "pending") return null;
          const leftPct = (i / (steps.length - 1)) * 100;
          const nextPct = i < steps.length - 1 ? ((i + 1) / (steps.length - 1)) * 100 : leftPct;
          const widthPct = state === "complete" ? nextPct - leftPct : 0;

          return widthPct > 0 ? (
            <div
              key={`seg-${step}`}
              className={`absolute h-1 rounded-full ${lineColor(state)} transition-all duration-500`}
              style={{
                left: `calc(${leftPct}% + 16px)`,
                width: `calc(${widthPct}% - 32px * ${widthPct / 100})`,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
          ) : null;
        })}

        {/* Station dots */}
        <div className="relative flex items-center justify-between w-full px-4">
          {steps.map((step) => {
            const state = getStepState(step);
            const isSelected = activeTab === step;

            return (
              <button
                key={step}
                onClick={() => setActiveTab(step)}
                className={`
                  relative flex h-6 w-6 items-center justify-center rounded-full
                  border-[3px] cursor-pointer transition-all duration-300
                  ${stationRing(state, isSelected)}
                  ${stationFill(state)}
                `}
              >
                {state === "complete" && (
                  <CheckIcon className="w-3 h-3 text-white" />
                )}
                {state === "failed" && (
                  <XIcon className="w-3 h-3 text-white" />
                )}
                {state === "active" && (
                  <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-30" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Labels row + iteration branches */}
      <div className="flex mt-2">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const showIter = hasIterations(step) && totalIterations > 1;

          return (
            <div key={step} className="flex-1 flex flex-col items-center">
              <button
                onClick={() => setActiveTab(step)}
                className={`text-[11px] font-medium cursor-pointer transition-colors ${
                  isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]
                } hover:text-zinc-200`}
              >
                {capitalize(step)}
              </button>

              {/* Transfer line / iteration branch */}
              {showIter && (
                <div className="flex flex-col items-center mt-2">
                  <div className="w-[2px] h-2 bg-violet-500/20" />
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalIterations }, (_, j) => j + 1).map((iter, j, arr) => {
                      const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
                      const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;

                      return (
                        <div key={iter} className="flex items-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveTab(step); setIter(iter); }}
                            className={`
                              flex h-4 w-4 items-center justify-center rounded-full
                              text-[8px] font-bold tabular-nums cursor-pointer
                              transition-all duration-200 border
                              ${iter === currentIter
                                ? "bg-violet-500/25 border-violet-500/50 text-violet-300"
                                : "bg-zinc-900 border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400"}
                            `}
                            style={{ fontFamily: MONO_FONT }}
                          >
                            {iter}
                          </button>
                          {j < arr.length - 1 && (
                            <div className="w-1.5 h-[2px] bg-violet-500/15" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 10: Compact Chip Row
// -----------------------------------------------------------------------------
// Ultra-minimal horizontal row of status chips. Each chip is a small rounded
// rectangle showing the step name, a status dot, and timing — all in a
// single line. The active chip is slightly larger with a border accent.
// Iterations appear as a micro-count badge on the right edge of the chip,
// clicking it cycles through iterations. Designed for maximum density —
// takes up as little vertical space as possible.
// =============================================================================

export function StepDesign10(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {steps.map((step, i) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;

          const dotColor = state === "complete" ? "bg-emerald-500" :
            state === "active" ? "bg-amber-400 animate-pulse" :
            state === "failed" ? "bg-red-500" :
            "bg-zinc-600";

          const handleIterClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            const nextIter = currentIter >= totalIterations ? 1 : currentIter + 1;
            setIter(nextIter);
          };

          return (
            <div key={step} className="flex items-center">
              <button
                onClick={() => setActiveTab(step)}
                className={`
                  flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer
                  transition-all duration-200
                  ${isSelected
                    ? `border ${STATE_BORDER[state]} ${STATE_BG[state]}`
                    : "border border-transparent hover:bg-white/[0.03]"}
                `}
              >
                {/* Status dot */}
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />

                {/* Label */}
                <span className={`text-xs font-medium ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                  {capitalize(step)}
                </span>

                {/* Duration */}
                <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                  {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount}` : "--:--"}
                </span>

                {/* Iteration cycle badge */}
                {showIter && (
                  <span
                    onClick={handleIterClick}
                    className={`
                      inline-flex items-center justify-center h-5 min-w-5 rounded-md
                      text-[9px] font-medium tabular-nums cursor-pointer
                      transition-all duration-150 ml-0.5
                      ${isSelected
                        ? "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                        : "bg-white/[0.04] text-zinc-600 hover:bg-white/[0.08] hover:text-zinc-400"}
                    `}
                    style={{ fontFamily: MONO_FONT }}
                    title={`Iteration ${currentIter}/${totalIterations} (click to cycle)`}
                  >
                    {currentIter}/{totalIterations}
                  </span>
                )}
              </button>

              {/* Connector dot */}
              {i < steps.length - 1 && (
                <div className={`mx-0.5 h-[2px] w-3 rounded-full shrink-0 ${
                  state === "complete" ? "bg-emerald-500/30" : "bg-white/[0.06]"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 11: Classic CI Columns
// -----------------------------------------------------------------------------
// Direct adaptation of the CI/CD pipeline reference. Each step is a column
// with a header bar containing the step name and an arrow indicator. Inside
// each column, iteration cards are stacked vertically with a connector line
// running down the left edge. Each card shows a status icon, iteration name,
// and duration. Active column gets a subtle top border accent. Clean,
// professional, immediately maps to a Jenkins/GitLab CI mental model.
// =============================================================================

export function StepDesign11(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4 overflow-x-auto">
      <div className="flex gap-3 min-w-0">
        {steps.map((step, i) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          const topBorder = state === "complete" ? "border-t-emerald-500/60"
            : state === "active" ? "border-t-amber-500/60"
            : state === "failed" ? "border-t-red-500/60"
            : "border-t-zinc-700/60";

          return (
            <div key={step} className="flex items-start gap-3 flex-1 min-w-[180px]">
              {/* Column */}
              <div
                className={`
                  flex-1 rounded-xl border border-white/[0.06] border-t-2 ${topBorder}
                  transition-all duration-300
                  ${isSelected ? `${STATE_BG[state]} ${STATE_GLOW[state]}` : "bg-white/[0.01] hover:bg-white/[0.02]"}
                `}
              >
                {/* Column Header */}
                <button
                  onClick={() => setActiveTab(step)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 cursor-pointer border-b border-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5">
                    <StatusIndicator state={state} size="md" />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${
                      isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]
                    }`}>
                      {capitalize(step)}
                    </span>
                  </div>
                  <svg className={`h-3.5 w-3.5 ${isSelected ? "text-zinc-400" : "text-zinc-700"} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                {/* Stacked Cards */}
                <div className="p-2 space-y-0">
                  {iters.map((iter, j) => {
                    const isActiveIter = showIter ? iter === currentIter : true;
                    const cardLabel = showIter ? `Iteration ${iter}` : capitalize(step);
                    return (
                      <div key={iter} className="flex">
                        {/* Vertical connector line */}
                        <div className="flex flex-col items-center w-5 shrink-0 pt-1">
                          {j > 0 && (
                            <div className={`w-[2px] h-2 ${state === "complete" ? "bg-emerald-500/30" : "bg-white/[0.06]"}`} />
                          )}
                          <div className={`h-2 w-2 rounded-full shrink-0 ${
                            state === "complete" ? "bg-emerald-500/60" :
                            state === "active" ? "bg-amber-400/60" :
                            state === "failed" ? "bg-red-500/60" :
                            "bg-zinc-700"
                          }`} />
                          {j < iters.length - 1 && (
                            <div className={`w-[2px] flex-1 ${state === "complete" ? "bg-emerald-500/30" : "bg-white/[0.06]"}`} />
                          )}
                        </div>
                        {/* Card */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab(step);
                            if (showIter) setIter(iter);
                          }}
                          className={`
                            flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-lg ml-1
                            cursor-pointer transition-all duration-200 text-left
                            ${isActiveIter && isSelected
                              ? "bg-white/[0.06] ring-1 ring-white/[0.1]"
                              : "hover:bg-white/[0.03]"}
                          `}
                        >
                          <span className={`text-[11px] font-medium truncate ${
                            isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                          }`}>
                            {cardLabel}
                          </span>
                          <span className="text-[10px] text-zinc-600 tabular-nums shrink-0" style={{ fontFamily: MONO_FONT }}>
                            {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount}` : "--:--"}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Arrow connector between columns */}
              {i < steps.length - 1 && (
                <div className="flex items-center self-center pt-2">
                  <svg className={`h-4 w-4 shrink-0 ${state === "complete" ? "text-emerald-500/40" : "text-zinc-700"} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 12: Glass Columns
// -----------------------------------------------------------------------------
// Glassmorphism columns with frosted card rows. Each column floats on a
// translucent backdrop with soft blur and no hard borders — just subtle
// white/[0.04] outlines. Active iteration cards glow with a colored halo.
// The overall effect is ethereal and premium, like frosted glass panels
// floating above a dark surface. Hover states reveal depth through
// increased blur and brightness.
// =============================================================================

export function StepDesign12(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const glassGlow: Record<string, string> = {
    complete: "shadow-[0_0_20px_rgba(16,185,129,0.08)]",
    active: "shadow-[0_0_20px_rgba(251,191,36,0.08)]",
    failed: "shadow-[0_0_20px_rgba(239,68,68,0.08)]",
    pending: "",
  };

  const cardGlow: Record<string, string> = {
    complete: "shadow-[0_0_12px_rgba(16,185,129,0.12)]",
    active: "shadow-[0_0_12px_rgba(251,191,36,0.12)]",
    failed: "shadow-[0_0_12px_rgba(239,68,68,0.12)]",
    pending: "",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-5 overflow-x-auto">
      <div className="flex gap-4 min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          return (
            <div
              key={step}
              className={`
                flex-1 min-w-[170px] rounded-2xl
                backdrop-blur-md border transition-all duration-400
                ${isSelected
                  ? `border-white/[0.08] bg-white/[0.04] ${glassGlow[state]}`
                  : "border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/[0.06]"}
              `}
            >
              {/* Frosted Header */}
              <button
                onClick={() => setActiveTab(step)}
                className="w-full px-4 py-3.5 cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    flex h-7 w-7 items-center justify-center rounded-full
                    backdrop-blur-sm transition-all duration-300
                    ${isSelected ? `${STATE_BG[state]} ring-1 ${STATE_BORDER[state]}` : "bg-white/[0.04]"}
                  `}>
                    <StepIcon step={step} className={`h-3.5 w-3.5 ${isSelected ? STATE_TEXT_COLOR[state] : "text-zinc-500"}`} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className={`text-xs font-medium transition-colors ${
                      isSelected ? "text-zinc-100" : "text-zinc-400 group-hover:text-zinc-300"
                    }`}>
                      {capitalize(step)}
                    </span>
                    <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                      {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount} lines` : "waiting"}
                    </span>
                  </div>
                </div>
              </button>

              {/* Frosted Card Rows */}
              <div className="px-2.5 pb-2.5 space-y-1.5">
                {iters.map((iter) => {
                  const isActiveIter = showIter ? iter === currentIter : true;
                  const cardLabel = showIter ? `Iteration ${iter}` : "Task";

                  return (
                    <button
                      key={iter}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab(step);
                        if (showIter) setIter(iter);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                        backdrop-blur-sm border cursor-pointer
                        transition-all duration-300 text-left
                        ${isActiveIter && isSelected
                          ? `border-white/[0.1] bg-white/[0.06] ${cardGlow[state]}`
                          : "border-white/[0.03] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.06]"}
                      `}
                    >
                      <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                      <span className={`text-[11px] font-medium flex-1 ${
                        isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                      }`}>
                        {cardLabel}
                      </span>
                      {isActiveIter && state === "active" && (
                        <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 13: Timeline Columns
// -----------------------------------------------------------------------------
// Each column has a vertical timeline line running down its center. Iteration
// cards alternate left and right of this central line, connected by horizontal
// branches. The effect is like a zigzag timeline within each column. Active
// cards have a colored node on the timeline. The central line pulses for the
// active step. Creates an organic, flowing layout that shows progression
// within each step.
// =============================================================================

export function StepDesign13(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-5 overflow-x-auto">
      <div className="flex gap-3 min-w-0">
        {steps.map((step, colIdx) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          const lineColor = state === "complete" ? "bg-emerald-500/30"
            : state === "active" ? "bg-amber-500/30 animate-pulse"
            : state === "failed" ? "bg-red-500/30"
            : "bg-white/[0.06]";

          const nodeColor = state === "complete" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
            : state === "active" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
            : state === "failed" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
            : "bg-zinc-700";

          return (
            <div key={step} className="flex items-start flex-1 min-w-[190px]">
              <div className={`
                flex-1 rounded-xl border transition-all duration-300
                ${isSelected
                  ? `${STATE_BORDER[state]} ${STATE_BG[state]}`
                  : "border-white/[0.06] hover:border-white/[0.1]"}
              `}>
                {/* Header */}
                <button
                  onClick={() => setActiveTab(step)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer border-b border-white/[0.06]"
                >
                  <StepIcon step={step} className={`h-4 w-4 ${STATE_TEXT_COLOR[state]}`} />
                  <span className={`text-xs font-semibold ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                    {capitalize(step)}
                  </span>
                  <span className="ml-auto text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                    {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : ""}
                  </span>
                </button>

                {/* Timeline body */}
                <div className="relative py-3 px-2">
                  {/* Central vertical line */}
                  <div className={`absolute left-1/2 top-3 bottom-3 w-[2px] -translate-x-1/2 ${lineColor} rounded-full`} />

                  <div className="relative space-y-2">
                    {iters.map((iter, j) => {
                      const isActiveIter = showIter ? iter === currentIter : true;
                      const isLeft = j % 2 === 0;
                      const cardLabel = showIter ? `Iter ${iter}` : capitalize(step);

                      return (
                        <div key={iter} className={`flex items-center gap-0 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
                          {/* Card */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab(step);
                              if (showIter) setIter(iter);
                            }}
                            className={`
                              flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg
                              cursor-pointer transition-all duration-200 text-left
                              ${isActiveIter && isSelected
                                ? "bg-white/[0.08] ring-1 ring-white/[0.12]"
                                : "bg-white/[0.02] hover:bg-white/[0.05]"}
                            `}
                          >
                            <StatusIndicator state={isActiveIter ? state : "pending"} size="sm" />
                            <span className={`text-[10px] font-medium ${
                              isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                            }`}>
                              {cardLabel}
                            </span>
                          </button>

                          {/* Horizontal branch to center node */}
                          <div className={`w-3 h-[2px] shrink-0 ${isActiveIter ? lineColor : "bg-white/[0.04]"}`} />

                          {/* Center node */}
                          <div className={`
                            h-2.5 w-2.5 rounded-full shrink-0 z-10 transition-all duration-300
                            ${isActiveIter ? nodeColor : "bg-zinc-800 ring-1 ring-white/[0.08]"}
                          `} />

                          {/* Spacer for opposite side */}
                          <div className="flex-1" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Inter-column connector */}
              {colIdx < steps.length - 1 && (
                <div className="flex items-center self-center px-1 pt-2">
                  <div className={`h-[2px] w-4 rounded-full ${state === "complete" ? "bg-emerald-500/30" : "bg-white/[0.06]"}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 14: Compact Columns
// -----------------------------------------------------------------------------
// Minimal height columns with iterations as thin single-line rows. Each row
// is just: status icon + name + duration — all on one line with no padding
// waste. Column headers are tiny uppercase labels. Designed for maximum
// information density with minimum vertical space. The entire component
// stays as short as possible while still being fully interactive. Think
// dense monitoring dashboard.
// =============================================================================

export function StepDesign14(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl px-3 py-2 overflow-x-auto">
      <div className="flex gap-2 min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          return (
            <div
              key={step}
              className={`
                flex-1 min-w-[150px] rounded-lg border transition-all duration-200
                ${isSelected
                  ? `${STATE_BORDER[state]} bg-white/[0.03]`
                  : "border-transparent hover:bg-white/[0.02]"}
              `}
            >
              {/* Compact Header */}
              <button
                onClick={() => setActiveTab(step)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATE_DOT_COLOR[state]}`} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                    isSelected ? "text-zinc-300" : "text-zinc-600"
                  }`}>
                    {step}
                  </span>
                </div>
                <span className="text-[9px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                  {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : ""}
                </span>
              </button>

              {/* Single-line rows */}
              <div className="px-1 pb-1">
                {iters.map((iter) => {
                  const isActiveIter = showIter ? iter === currentIter : true;
                  const rowLabel = showIter ? `iter-${iter}` : "run";

                  return (
                    <button
                      key={iter}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab(step);
                        if (showIter) setIter(iter);
                      }}
                      className={`
                        w-full flex items-center gap-1.5 px-2 py-1 rounded
                        cursor-pointer transition-all duration-150 text-left
                        ${isActiveIter && isSelected
                          ? "bg-white/[0.06]"
                          : "hover:bg-white/[0.03]"}
                      `}
                    >
                      <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                      <span
                        className={`text-[10px] flex-1 truncate ${
                          isActiveIter && isSelected ? "text-zinc-300" : "text-zinc-600"
                        }`}
                        style={{ fontFamily: MONO_FONT }}
                      >
                        {rowLabel}
                      </span>
                      <span className="text-[9px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                        {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount}` : "--"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 15: Accordion Columns
// -----------------------------------------------------------------------------
// Column headers are always visible in a horizontal row. Clicking a column
// header expands it to reveal the iteration cards below with a smooth
// max-height transition. Collapsed columns show only the header with a
// status badge. Expanded column shows stacked iteration cards with a slide-
// down animation. Only one column expands at a time (the active tab).
// Creates a clean accordion-within-columns interaction.
// =============================================================================

export function StepDesign15(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4 overflow-x-auto">
      <div className="flex gap-3 items-start min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          return (
            <div
              key={step}
              className={`
                flex-1 min-w-[170px] rounded-xl border overflow-hidden
                transition-all duration-300
                ${isSelected
                  ? `${STATE_BORDER[state]} ${STATE_BG[state]}`
                  : "border-white/[0.06]"}
              `}
            >
              {/* Always-visible header */}
              <button
                onClick={() => setActiveTab(step)}
                className="w-full flex items-center justify-between px-4 py-3 cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <StatusIndicator state={state} size="md" />
                  <span className={`text-xs font-semibold ${
                    isSelected ? "text-zinc-100" : "text-zinc-400 group-hover:text-zinc-300"
                  }`}>
                    {capitalize(step)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {timing && (
                    <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                      {formatStepDuration(timing.startedAt, timing.endedAt)}
                    </span>
                  )}
                  {/* Chevron rotates when expanded */}
                  <svg
                    className={`h-3 w-3 text-zinc-600 transition-transform duration-300 ${isSelected ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {/* Expandable card area with max-height transition */}
              <div
                className="transition-all duration-400 ease-in-out overflow-hidden"
                style={{
                  maxHeight: isSelected ? `${iters.length * 52 + 16}px` : "0px",
                  opacity: isSelected ? 1 : 0,
                }}
              >
                <div className="px-2.5 pb-2.5 space-y-1">
                  {iters.map((iter) => {
                    const isActiveIter = showIter ? iter === currentIter : true;
                    const cardLabel = showIter ? `Iteration ${iter}` : "Pipeline task";

                    return (
                      <button
                        key={iter}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab(step);
                          if (showIter) setIter(iter);
                        }}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                          cursor-pointer transition-all duration-200 text-left
                          ${isActiveIter
                            ? `bg-white/[0.06] border border-white/[0.08] ${STATE_GLOW[state]}`
                            : "bg-white/[0.02] border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]"}
                        `}
                      >
                        <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                        <span className={`text-[11px] font-medium flex-1 ${
                          isActiveIter ? "text-zinc-200" : "text-zinc-500"
                        }`}>
                          {cardLabel}
                        </span>
                        <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                          {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : "--:--"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 16: Status Board
// -----------------------------------------------------------------------------
// Wide horizontal layout where each column has a colored status strip on top
// (green for complete, amber for active, red for failed, dim for pending).
// Iteration cards show mini progress bar indicators that fill based on state.
// The strip creates a strong visual signal — you can see pipeline health at
// a glance from across the room. Cards have a subtle left border accent
// matching the strip color. Dashboard / war-room aesthetic.
// =============================================================================

export function StepDesign16(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const stripColor: Record<string, string> = {
    complete: "bg-emerald-500",
    active: "bg-amber-500",
    failed: "bg-red-500",
    pending: "bg-zinc-700",
  };

  const stripGlow: Record<string, string> = {
    complete: "shadow-[0_2px_12px_rgba(16,185,129,0.2)]",
    active: "shadow-[0_2px_12px_rgba(251,191,36,0.2)]",
    failed: "shadow-[0_2px_12px_rgba(239,68,68,0.2)]",
    pending: "",
  };

  const leftBorder: Record<string, string> = {
    complete: "border-l-emerald-500/50",
    active: "border-l-amber-500/50",
    failed: "border-l-red-500/50",
    pending: "border-l-zinc-700/50",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4 overflow-x-auto">
      <div className="flex gap-3 min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          // Progress percentage for the mini bar
          const progressPct = state === "complete" ? 100
            : state === "active" ? 60
            : state === "failed" ? 100
            : 0;

          return (
            <div
              key={step}
              className={`
                flex-1 min-w-[175px] rounded-xl overflow-hidden border
                transition-all duration-300
                ${isSelected
                  ? `border-white/[0.1] ${STATE_GLOW[state]}`
                  : "border-white/[0.06] hover:border-white/[0.08]"}
              `}
            >
              {/* Colored Status Strip */}
              <div className={`h-1.5 ${stripColor[state]} ${isSelected ? stripGlow[state] : ""} transition-all duration-300`} />

              {/* Header */}
              <button
                onClick={() => setActiveTab(step)}
                className="w-full flex items-center justify-between px-4 py-3 cursor-pointer bg-white/[0.02]"
              >
                <div className="flex items-center gap-2.5">
                  <StepIcon step={step} className={`h-4 w-4 ${STATE_TEXT_COLOR[state]}`} />
                  <span className={`text-xs font-semibold ${isSelected ? "text-zinc-100" : "text-zinc-400"}`}>
                    {capitalize(step)}
                  </span>
                </div>
                {timing && (
                  <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                    {formatStepDuration(timing.startedAt, timing.endedAt)}
                  </span>
                )}
              </button>

              {/* Cards with left border accent */}
              <div className="px-2 pb-2 space-y-1">
                {iters.map((iter) => {
                  const isActiveIter = showIter ? iter === currentIter : true;
                  const cardLabel = showIter ? `Iteration ${iter}` : "Execute";

                  return (
                    <button
                      key={iter}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab(step);
                        if (showIter) setIter(iter);
                      }}
                      className={`
                        w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-lg
                        border-l-2 ${leftBorder[state]}
                        cursor-pointer transition-all duration-200 text-left
                        ${isActiveIter && isSelected
                          ? "bg-white/[0.06]"
                          : "bg-white/[0.01] hover:bg-white/[0.04]"}
                      `}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                          <span className={`text-[11px] font-medium ${
                            isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                          }`}>
                            {cardLabel}
                          </span>
                        </div>
                        <span className="text-[9px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                          {logCount > 0 ? `${logCount}` : ""}
                        </span>
                      </div>
                      {/* Mini progress bar */}
                      <div className="w-full h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${stripColor[state]}`}
                          style={{ width: `${isActiveIter ? progressPct : (state === "complete" ? 100 : 0)}%`, opacity: 0.6 }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 17: Terminal Columns
// -----------------------------------------------------------------------------
// Monospace aesthetic where columns look like terminal windows with classic
// title bars (three dots + window title). Iteration entries are styled as
// terminal command lines with a prompt character. Active entries have a
// blinking cursor. The font is fully monospace, colors are terminal-green
// for success, amber for active, red for failure. Output counts display as
// "123 lines" like stdout. Dark terminal background with scanline overlay.
// =============================================================================

export function StepDesign17(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const termColor: Record<string, string> = {
    complete: "text-green-400",
    active: "text-amber-400",
    failed: "text-red-400",
    pending: "text-zinc-600",
  };

  const termDotColor: Record<string, string> = {
    complete: "bg-green-500",
    active: "bg-amber-500",
    failed: "bg-red-500",
    pending: "bg-zinc-700",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4 overflow-x-auto">
      <div className="flex gap-3 min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          return (
            <div
              key={step}
              className={`
                flex-1 min-w-[180px] rounded-lg border overflow-hidden
                transition-all duration-200
                ${isSelected
                  ? `${STATE_BORDER[state]} ${STATE_GLOW[state]}`
                  : "border-white/[0.08] hover:border-white/[0.12]"}
              `}
              style={{ fontFamily: MONO_FONT }}
            >
              {/* Terminal title bar */}
              <button
                onClick={() => setActiveTab(step)}
                className="w-full flex items-center gap-3 px-3 py-2 cursor-pointer bg-white/[0.04] border-b border-white/[0.06]"
              >
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className={`text-[10px] font-medium ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                  {step}.sh
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${termDotColor[state]}`} />
                </div>
              </button>

              {/* Terminal body */}
              <div className="bg-zinc-950/80 px-3 py-2 space-y-0.5">
                {/* Status line */}
                <div className="flex items-center gap-1 text-[9px] text-zinc-700 mb-1">
                  <span>$</span>
                  <span>status:</span>
                  <span className={termColor[state]}>{state}</span>
                  {timing && (
                    <>
                      <span className="text-zinc-800">|</span>
                      <span>{formatStepDuration(timing.startedAt, timing.endedAt)}</span>
                    </>
                  )}
                  {logCount > 0 && (
                    <>
                      <span className="text-zinc-800">|</span>
                      <span>{logCount} lines</span>
                    </>
                  )}
                </div>

                {/* Command entries */}
                {iters.map((iter) => {
                  const isActiveIter = showIter ? iter === currentIter : true;
                  const cmdLabel = showIter ? `run --iter=${iter}` : "run --exec";

                  return (
                    <button
                      key={iter}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab(step);
                        if (showIter) setIter(iter);
                      }}
                      className={`
                        w-full flex items-center gap-1.5 px-2 py-1.5 rounded
                        cursor-pointer transition-all duration-150 text-left
                        ${isActiveIter && isSelected
                          ? "bg-white/[0.06]"
                          : "hover:bg-white/[0.03]"}
                      `}
                    >
                      <span className={`text-[10px] ${isActiveIter ? termColor[state] : "text-zinc-700"}`}>
                        {isActiveIter && state === "active" ? ">" : "$"}
                      </span>
                      <span className={`text-[10px] flex-1 ${
                        isActiveIter && isSelected ? "text-zinc-300" : "text-zinc-600"
                      }`}>
                        {cmdLabel}
                      </span>
                      {isActiveIter && state === "active" && (
                        <span className="text-amber-400 text-[10px] animate-pulse">_</span>
                      )}
                      {isActiveIter && state === "complete" && (
                        <span className="text-green-500/60 text-[9px]">0</span>
                      )}
                      {isActiveIter && state === "failed" && (
                        <span className="text-red-500/60 text-[9px]">1</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 18: Node Graph
// -----------------------------------------------------------------------------
// Columns connected by horizontal arrow lines between them, evoking a node-
// based workflow graph. Each iteration card has connection dots (small circles)
// on its left and right edges that visually "plug into" the lines between
// columns. The active column's cards have their connection dots filled with
// color. Lines animate with a gradient flow on the active segment. Creates
// a visual language of data flowing through connected processing nodes.
// =============================================================================

export function StepDesign18(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const dotFillColor: Record<string, string> = {
    complete: "bg-emerald-400",
    active: "bg-amber-400",
    failed: "bg-red-400",
    pending: "bg-zinc-700",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-5 overflow-x-auto">
      <div className="flex items-start min-w-0">
        {steps.map((step, colIdx) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          const nextState = colIdx < steps.length - 1 ? getStepState(steps[colIdx + 1]) : "pending";
          const lineActive = state === "complete";

          return (
            <div key={step} className="flex items-stretch flex-1 min-w-[180px]">
              {/* Column node */}
              <div className={`
                flex-1 rounded-xl border transition-all duration-300
                ${isSelected
                  ? `${STATE_BORDER[state]} ${STATE_BG[state]} ${STATE_GLOW[state]}`
                  : "border-white/[0.06] hover:border-white/[0.1]"}
              `}>
                {/* Node header */}
                <button
                  onClick={() => setActiveTab(step)}
                  className="w-full flex items-center justify-between px-4 py-3 cursor-pointer border-b border-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`
                      flex h-6 w-6 items-center justify-center rounded-md
                      ${isSelected ? STATE_BG[state] : "bg-white/[0.04]"}
                      transition-all duration-200
                    `}>
                      <StepIcon step={step} className={`h-3 w-3 ${STATE_TEXT_COLOR[state]}`} />
                    </div>
                    <span className={`text-xs font-semibold ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                      {capitalize(step)}
                    </span>
                  </div>
                  {timing && (
                    <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                      {formatStepDuration(timing.startedAt, timing.endedAt)}
                    </span>
                  )}
                </button>

                {/* Cards with connection dots */}
                <div className="p-2 space-y-1">
                  {iters.map((iter) => {
                    const isActiveIter = showIter ? iter === currentIter : true;
                    const cardLabel = showIter ? `Iteration ${iter}` : capitalize(step);

                    return (
                      <button
                        key={iter}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab(step);
                          if (showIter) setIter(iter);
                        }}
                        className={`
                          w-full flex items-center gap-2.5 rounded-lg relative
                          cursor-pointer transition-all duration-200 text-left
                          py-2.5 px-3
                          ${isActiveIter && isSelected
                            ? "bg-white/[0.06] ring-1 ring-white/[0.1]"
                            : "bg-white/[0.02] hover:bg-white/[0.04]"}
                          ${showIter && !isActiveIter ? "opacity-40" : ""}
                        `}
                      >
                        {/* Left connection dot */}
                        <div className={`
                          absolute -left-[5px] top-1/2 -translate-y-1/2
                          h-2.5 w-2.5 rounded-full border-2 border-zinc-900
                          transition-all duration-300
                          ${isActiveIter ? dotFillColor[state] : "bg-zinc-800"}
                        `} />

                        {/* Right connection dot */}
                        <div className={`
                          absolute -right-[5px] top-1/2 -translate-y-1/2
                          h-2.5 w-2.5 rounded-full border-2 border-zinc-900
                          transition-all duration-300
                          ${isActiveIter ? dotFillColor[state] : "bg-zinc-800"}
                        `} />

                        <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                        <span className={`text-[11px] font-medium flex-1 ${
                          isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                        }`}>
                          {cardLabel}
                        </span>
                        {logCount > 0 && (
                          <span className="text-[9px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                            {logCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Horizontal connector line with arrow */}
              {colIdx < steps.length - 1 && (
                <div className="flex flex-col items-center justify-center w-8 shrink-0 py-8">
                  <div className="flex items-center">
                    <div className={`h-[2px] w-4 rounded-l-full transition-colors duration-300 ${
                      lineActive ? "bg-emerald-500/40" : "bg-white/[0.06]"
                    }`} />
                    <svg className={`h-3 w-3 -ml-0.5 transition-colors duration-300 ${
                      lineActive ? "text-emerald-500/40" : "text-white/[0.06]"
                    }`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 6l6 6-6 6V6z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 19: Layered Cards
// -----------------------------------------------------------------------------
// Each column is a stack where iteration cards have a subtle offset and
// shadow to create depth — like a pile of papers or stacked playing cards.
// The active iteration card is raised to the top with a stronger shadow.
// Non-active cards peek out from behind with a small vertical and horizontal
// offset. Hovering a card lifts it slightly. Creates a tactile, physical
// metaphor for iterations stacking up within each step.
// =============================================================================

export function StepDesign19(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-5 overflow-x-auto">
      <div className="flex gap-4 min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          return (
            <div key={step} className="flex-1 min-w-[180px]">
              {/* Column Header */}
              <button
                onClick={() => setActiveTab(step)}
                className={`
                  w-full flex items-center justify-between px-4 py-2.5 rounded-t-xl
                  cursor-pointer transition-all duration-200
                  border border-b-0 border-white/[0.06]
                  ${isSelected
                    ? `${STATE_BG[state]} border-t-2 ${STATE_BORDER[state]}`
                    : "bg-white/[0.02] hover:bg-white/[0.04]"}
                `}
              >
                <div className="flex items-center gap-2">
                  <StatusIndicator state={state} size="md" />
                  <span className={`text-xs font-semibold ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                    {capitalize(step)}
                  </span>
                </div>
                {timing && (
                  <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                    {formatStepDuration(timing.startedAt, timing.endedAt)}
                  </span>
                )}
              </button>

              {/* Stacked/layered cards area */}
              <div
                className={`
                  relative rounded-b-xl border border-t-0 border-white/[0.06] p-3
                  ${isSelected ? STATE_BG[state] : "bg-white/[0.01]"}
                  transition-all duration-300
                `}
                style={{ minHeight: `${iters.length * 44 + (iters.length - 1) * 6 + 8}px` }}
              >
                {iters.map((iter, idx) => {
                  const isActiveIter = showIter ? iter === currentIter : true;
                  const cardLabel = showIter ? `Iteration ${iter}` : capitalize(step);
                  // Stacking: non-active cards get offset
                  const zIndex = isActiveIter ? 20 : 10 - idx;
                  const offsetX = isActiveIter ? 0 : (idx % 2 === 0 ? 2 : -2);
                  const offsetY = idx * 50;

                  return (
                    <button
                      key={iter}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab(step);
                        if (showIter) setIter(iter);
                      }}
                      className={`
                        absolute left-3 right-3 flex items-center gap-3 px-3 py-2.5
                        rounded-xl border cursor-pointer
                        transition-all duration-300 text-left
                        hover:-translate-y-0.5
                        ${isActiveIter && isSelected
                          ? `bg-zinc-900/90 border-white/[0.12] ${STATE_GLOW[state]} shadow-lg`
                          : "bg-zinc-900/70 border-white/[0.06] shadow-md hover:shadow-lg"}
                      `}
                      style={{
                        zIndex,
                        transform: `translateX(${offsetX}px) translateY(${offsetY}px)`,
                      }}
                    >
                      <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                      <span className={`text-[11px] font-medium flex-1 ${
                        isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                      }`}>
                        {cardLabel}
                      </span>
                      <span className="text-[10px] text-zinc-600 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                        {timing ? formatStepDuration(timing.startedAt, timing.endedAt) : logCount > 0 ? `${logCount}` : "--:--"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// =============================================================================
// Design 20: Progress Lanes
// -----------------------------------------------------------------------------
// Horizontal swim lanes — each step is a horizontal lane/row with iteration
// cards flowing left-to-right within it. Progress arrows connect iterations
// within the same lane. The lane header is a vertical strip on the left side.
// Active lane is highlighted with a subtle background. This rotates the
// typical column layout 90 degrees — steps are rows, iterations are columns
// within each row. Creates a Gantt-chart or Kanban-lane feel, excellent for
// visualizing iteration progression over time.
// =============================================================================

export function StepDesign20(props: StepDesignProps) {
  const {
    steps, activeTab, setActiveTab, getStepState, getTabTiming,
    formatStepDuration, getStepLogCount, totalIterations,
    codingIteration, reviewingIteration, setCodingIteration, setReviewingIteration,
  } = props;

  const laneAccent: Record<string, string> = {
    complete: "bg-emerald-500",
    active: "bg-amber-500",
    failed: "bg-red-500",
    pending: "bg-zinc-700",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-4 overflow-x-auto">
      <div className="flex flex-col gap-2 min-w-0">
        {steps.map((step) => {
          const state = getStepState(step);
          const isSelected = activeTab === step;
          const timing = getTabTiming(step);
          const logCount = getStepLogCount(step);
          const showIter = hasIterations(step) && totalIterations > 1;
          const currentIter = step === "coding" ? (codingIteration ?? totalIterations) : (reviewingIteration ?? totalIterations);
          const setIter = step === "coding" ? setCodingIteration : setReviewingIteration;
          const iters = showIter ? Array.from({ length: totalIterations }, (_, j) => j + 1) : [1];

          return (
            <div
              key={step}
              className={`
                flex items-stretch rounded-xl border overflow-hidden
                transition-all duration-300
                ${isSelected
                  ? `${STATE_BORDER[state]} ${STATE_BG[state]}`
                  : "border-white/[0.06] hover:bg-white/[0.01]"}
              `}
            >
              {/* Lane accent strip (vertical left bar) */}
              <div className={`w-1 shrink-0 ${laneAccent[state]} transition-all duration-300`} />

              {/* Lane header */}
              <button
                onClick={() => setActiveTab(step)}
                className="flex flex-col items-start justify-center gap-0.5 px-4 py-3 w-[130px] shrink-0 cursor-pointer border-r border-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <StatusIndicator state={state} size="md" />
                  <span className={`text-xs font-semibold ${isSelected ? "text-zinc-100" : STATE_TEXT_COLOR[state]}`}>
                    {capitalize(step)}
                  </span>
                </div>
                {timing && (
                  <span className="text-[10px] text-zinc-600 tabular-nums ml-6" style={{ fontFamily: MONO_FONT }}>
                    {formatStepDuration(timing.startedAt, timing.endedAt)}
                  </span>
                )}
              </button>

              {/* Iteration cards flowing left-to-right */}
              <div className="flex items-center gap-0 px-3 py-2 overflow-x-auto flex-1">
                {iters.map((iter, j) => {
                  const isActiveIter = showIter ? iter === currentIter : true;
                  const cardLabel = showIter ? `Iter ${iter}` : "Run";

                  return (
                    <div key={iter} className="flex items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab(step);
                          if (showIter) setIter(iter);
                        }}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded-lg
                          cursor-pointer transition-all duration-200 text-left
                          shrink-0
                          ${isActiveIter && isSelected
                            ? `bg-white/[0.08] ring-1 ring-white/[0.12] ${STATE_GLOW[state]}`
                            : "bg-white/[0.02] hover:bg-white/[0.05]"}
                        `}
                      >
                        <StatusIndicator state={isActiveIter ? state : (state === "complete" ? "complete" : "pending")} size="sm" />
                        <span className={`text-[11px] font-medium whitespace-nowrap ${
                          isActiveIter && isSelected ? "text-zinc-200" : "text-zinc-500"
                        }`}>
                          {cardLabel}
                        </span>
                        {logCount > 0 && isActiveIter && (
                          <span className="text-[9px] text-zinc-700 tabular-nums" style={{ fontFamily: MONO_FONT }}>
                            {logCount}
                          </span>
                        )}
                      </button>

                      {/* Arrow between iteration cards */}
                      {j < iters.length - 1 && (
                        <div className="flex items-center px-1.5 shrink-0">
                          <div className={`h-[2px] w-3 ${state === "complete" ? "bg-emerald-500/30" : "bg-white/[0.08]"}`} />
                          <svg className={`h-2.5 w-2.5 -ml-0.5 ${
                            state === "complete" ? "text-emerald-500/30" : "text-white/[0.08]"
                          }`} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M10 6l6 6-6 6V6z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
