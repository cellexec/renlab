import type { ReactNode } from "react";

// =============================================================================
// SectionHeader
// =============================================================================
//
// The uppercase tracking-widest label pattern used consistently throughout
// the dashboard widgets (Timing, Configuration, Status, Logs, etc.).
//
// Extracted from:
//   - TimingWidget:  "text-[10px] uppercase tracking-widest text-zinc-600 mb-5 font-medium"
//   - ConfigWidget:  same pattern
//   - StatusWidget:  same pattern
//   - Log headers:   "text-[11px] font-semibold text-zinc-400 uppercase tracking-wider"
//   - Sidebar nav:   "text-[11px] font-medium uppercase tracking-wider text-zinc-600"
//
// Usage:
//   <SectionHeader>Timing</SectionHeader>
//   <SectionHeader size="sm" spacing="tight">Issues</SectionHeader>
//   <SectionHeader as="h3">Configuration</SectionHeader>

export interface SectionHeaderProps {
  /** The label text. */
  children: ReactNode;
  /** Size preset that controls font-size and tracking. */
  size?: "xs" | "sm" | "md";
  /** Bottom margin preset. */
  spacing?: "none" | "tight" | "normal" | "loose";
  /** Text color override. Default is zinc-600. */
  color?: string;
  /** Render as a different HTML element. Default "div". */
  as?: "div" | "h2" | "h3" | "h4" | "span" | "p";
  /** Extra className. */
  className?: string;
}

const SIZE_CLASSES = {
  xs: "text-[10px] tracking-widest",
  sm: "text-[11px] tracking-wider",
  md: "text-xs tracking-wider",
} as const;

const WEIGHT_CLASSES = {
  xs: "font-medium",
  sm: "font-semibold",
  md: "font-semibold",
} as const;

const SPACING_CLASSES = {
  none: "",
  tight: "mb-2",
  normal: "mb-4",
  loose: "mb-5",
} as const;

export function SectionHeader({
  children,
  size = "xs",
  spacing = "loose",
  color = "text-zinc-600",
  as: Tag = "div",
  className = "",
}: SectionHeaderProps) {
  return (
    <Tag
      className={[
        "uppercase",
        SIZE_CLASSES[size],
        WEIGHT_CLASSES[size],
        SPACING_CLASSES[spacing],
        color,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}
