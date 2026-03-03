import type { ReactNode } from "react";

// =============================================================================
// InfoWidget
// =============================================================================
//
// The widget container pattern from PipelinePageShell used by TimingWidget,
// ConfigWidget, and StatusWidget. Provides a rounded-2xl bordered container
// with an uppercase section label and flexible content area.
//
// Usage:
//   <InfoWidget label="Timing">
//     <div>Created: Jan 5, 14:30</div>
//   </InfoWidget>
//
//   <InfoWidget label="Status" center glow="emerald">
//     <span>Success</span>
//   </InfoWidget>

export interface InfoWidgetProps {
  /** Uppercase section label rendered at the top. */
  label: string;
  /** Center the content vertically and horizontally. */
  center?: boolean;
  /** Optional ambient glow color. Maps to predefined shadow values. */
  glow?: "emerald" | "red" | "amber" | "none";
  /** Optional tinted background for the whole widget. */
  tint?: "emerald" | "red" | "amber" | "zinc" | "none";
  /** Extra className to merge. */
  className?: string;
  children?: ReactNode;
}

const GLOW_CLASSES: Record<string, string> = {
  emerald: "shadow-[0_0_40px_rgba(16,185,129,0.15)]",
  red:     "shadow-[0_0_40px_rgba(239,68,68,0.15)]",
  amber:   "shadow-[0_0_40px_rgba(251,191,36,0.12)]",
  none:    "",
};

const TINT_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/[0.04]",
  red:     "bg-red-500/[0.04]",
  amber:   "bg-amber-500/[0.04]",
  zinc:    "bg-zinc-500/[0.04]",
  none:    "bg-white/[0.02]",
};

export function InfoWidget({
  label,
  center = false,
  glow = "none",
  tint = "none",
  className = "",
  children,
}: InfoWidgetProps) {
  return (
    <div
      className={[
        "flex flex-col rounded-2xl border border-white/[0.06] p-6 relative overflow-hidden",
        TINT_CLASSES[tint],
        GLOW_CLASSES[glow],
        center ? "items-center justify-center" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-5 font-medium relative z-10">
        {label}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// =============================================================================
// InfoWidgetRow
// =============================================================================
//
// A row inside an InfoWidget with an icon, label, and value. Extracted from
// the ConfigWidget pattern.
//
// Usage:
//   <InfoWidgetRow icon={<BranchIcon />} label="Branch" value="feat/xyz" valueClassName="text-cyan-400/80" />

export interface InfoWidgetRowProps {
  /** Icon element (typically an SVG). */
  icon?: ReactNode;
  /** Small label above the value. */
  label: string;
  /** The display value. */
  value: ReactNode;
  /** Optional color override for the value text. */
  valueClassName?: string;
  /** Use monospace font for the value. Default true. */
  mono?: boolean;
}

export function InfoWidgetRow({ icon, label, value, valueClassName = "text-zinc-300", mono = true }: InfoWidgetRowProps) {
  return (
    <div className="flex items-center gap-3">
      {icon && (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.04] shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-zinc-600 mb-0.5">{label}</div>
        <div
          className={`text-sm truncate tabular-nums ${valueClassName}`}
          style={mono ? { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } : undefined}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
