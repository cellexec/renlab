import type { ReactNode } from "react";

// =============================================================================
// StatusBadge
// =============================================================================
//
// Color-coded pill badge with a leading dot indicator. Extracted from the
// status badges in PipelinePageShell and design-pipelines.
//
// Usage:
//   <StatusBadge status="success" />
//   <StatusBadge status="running" label="Coding" />
//   <StatusBadge status="failed" size="lg" />

export type BadgeStatus = "success" | "failed" | "cancelled" | "rejected" | "running" | "pending";

export interface StatusBadgeProps {
  /** The semantic status to display. */
  status: BadgeStatus;
  /** Override the label text. Defaults to the capitalized status name. */
  label?: string;
  /** Size variant. "sm" = smaller padding, "lg" = slightly larger. Default = "md". */
  size?: "sm" | "md" | "lg";
  /** Optional className to merge onto the root element. */
  className?: string;
  /** Optional children rendered after the label (e.g. extra metadata). */
  children?: ReactNode;
}

const STATUS_STYLES: Record<BadgeStatus, { bg: string; text: string; dot: string }> = {
  success:   { bg: "bg-emerald-500/10 ring-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" },
  failed:    { bg: "bg-red-500/10 ring-red-500/20",         text: "text-red-400",     dot: "bg-red-400" },
  cancelled: { bg: "bg-zinc-500/10 ring-zinc-500/20",       text: "text-zinc-400",    dot: "bg-zinc-400" },
  rejected:  { bg: "bg-amber-500/10 ring-amber-500/20",     text: "text-amber-400",   dot: "bg-amber-400" },
  running:   { bg: "bg-amber-500/10 ring-amber-500/20",     text: "text-amber-400",   dot: "bg-amber-400 animate-pulse" },
  pending:   { bg: "bg-zinc-500/10 ring-zinc-500/20",       text: "text-zinc-500",    dot: "bg-zinc-500" },
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[11px] gap-1",
  md: "px-2.5 py-0.5 text-xs gap-1.5",
  lg: "px-3 py-1 text-xs gap-1.5",
} as const;

const DOT_SIZES = {
  sm: "h-1 w-1",
  md: "h-1.5 w-1.5",
  lg: "h-2 w-2",
} as const;

const DEFAULT_LABELS: Record<BadgeStatus, string> = {
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  running: "Running",
  pending: "Pending",
};

export function StatusBadge({ status, label, size = "md", className = "", children }: StatusBadgeProps) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ${SIZE_CLASSES[size]} ${s.bg} ${s.text} ${className}`}>
      <span className={`rounded-full ${DOT_SIZES[size]} ${s.dot}`} />
      {label ?? DEFAULT_LABELS[status]}
      {children}
    </span>
  );
}
