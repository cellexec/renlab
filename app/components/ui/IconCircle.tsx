import type { ReactNode } from "react";

// =============================================================================
// IconCircle
// =============================================================================
//
// Circular icon container used in step indicators and status displays.
// Extracted from the step circles in PipelineSteps.tsx, StatusWidget in
// PipelinePageShell, and the design-pipeline step progress.
//
// Usage:
//   <IconCircle state="complete" />
//   <IconCircle state="active" size="lg">
//     <SpinnerIcon />
//   </IconCircle>
//   <IconCircle color="violet" size="lg">
//     <WarningIcon />
//   </IconCircle>

export type IconCircleState = "pending" | "active" | "complete" | "failed";

export interface IconCircleProps {
  /** Semantic state that determines colors. Ignored when `color` is set. */
  state?: IconCircleState;
  /** Explicit color override (takes precedence over state). */
  color?: "emerald" | "red" | "amber" | "zinc" | "violet" | "indigo" | "cyan" | "purple";
  /** Size of the circle. */
  size?: "sm" | "md" | "lg";
  /** Custom children (icon SVG). Falls back to a default dot or checkmark. */
  children?: ReactNode;
  /** Extra className. */
  className?: string;
}

// -- State-derived styles ---------------------------------------------------

const STATE_CLASSES: Record<IconCircleState, string> = {
  complete: "border-emerald-500 bg-emerald-500/20",
  active:   "border-amber-500 bg-amber-500/20 animate-pulse",
  failed:   "border-red-500 bg-red-500/20",
  pending:  "border-zinc-700 bg-zinc-800",
};

// -- Color-derived styles ---------------------------------------------------

const COLOR_CLASSES: Record<string, string> = {
  emerald: "border-emerald-500/20 bg-emerald-500/10",
  red:     "border-red-500/20 bg-red-500/10",
  amber:   "border-amber-500/20 bg-amber-500/10",
  zinc:    "border-zinc-500/20 bg-zinc-500/10",
  violet:  "border-violet-500/20 bg-violet-500/10",
  indigo:  "border-indigo-500/20 bg-indigo-500/10",
  cyan:    "border-cyan-500/20 bg-cyan-500/10",
  purple:  "border-purple-500/20 bg-purple-500/10",
};

// -- Size presets -----------------------------------------------------------

const SIZE_CLASSES = {
  sm: "h-6 w-6 rounded-lg",
  md: "h-8 w-8 rounded-full",
  lg: "h-14 w-14 rounded-2xl",
} as const;

const BORDER_WIDTH = {
  sm: "border",
  md: "border-2",
  lg: "border",
} as const;

// -- Default icon for each state -------------------------------------------

function DefaultIcon({ state, size }: { state: IconCircleState; size: "sm" | "md" | "lg" }) {
  const iconSize = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  const dotSize = size === "lg" ? "h-3 w-3" : "h-2 w-2";

  if (state === "complete") {
    return (
      <svg className={`${iconSize} text-emerald-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={size === "lg" ? 2.5 : 3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === "failed") {
    return (
      <svg className={`${iconSize} text-red-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={size === "lg" ? 2.5 : 3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  const dotColor = state === "active" ? "bg-amber-400" : "bg-zinc-600";
  return <div className={`rounded-full ${dotSize} ${dotColor}`} />;
}

export function IconCircle({ state = "pending", color, size = "md", children, className = "" }: IconCircleProps) {
  const circleStyle = color ? COLOR_CLASSES[color] : STATE_CLASSES[state];

  return (
    <div
      className={[
        "flex items-center justify-center shrink-0 transition-all",
        SIZE_CLASSES[size],
        BORDER_WIDTH[size],
        circleStyle,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children ?? <DefaultIcon state={state} size={size} />}
    </div>
  );
}
