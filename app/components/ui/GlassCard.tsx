import type { ReactNode, HTMLAttributes } from "react";

// =============================================================================
// GlassCard
// =============================================================================
//
// Glass-morphism card primitive extracted from patterns across the entire app.
//
// Three variants:
//   "default"  - backdrop-blur-xl bg-white/[0.03] border border-white/[0.06]
//   "strong"   - gradient background with inset shadow (glass-card-strong)
//   "subtle"   - bg-white/[0.02] with thinner border (widget cards)
//
// Optional gradient-border-glow via the `glow` prop.
//
// Usage:
//   <GlassCard>content</GlassCard>
//   <GlassCard variant="strong" glow>score gauge</GlassCard>
//   <GlassCard variant="subtle" padding="lg">widget content</GlassCard>

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual variant of the card. */
  variant?: "default" | "strong" | "subtle";
  /** Apply the gradient-border-glow pseudo-element. */
  glow?: boolean;
  /** Padding preset. */
  padding?: "none" | "sm" | "md" | "lg";
  /** Border radius preset. */
  rounded?: "lg" | "xl" | "2xl";
  /** Extra className to merge. */
  className?: string;
  children?: ReactNode;
}

const VARIANT_CLASSES = {
  default: "backdrop-blur-xl bg-white/[0.03] border border-white/[0.06]",
  strong: "glass-card-strong",
  subtle: "border border-white/[0.06] bg-white/[0.02]",
} as const;

const PADDING_CLASSES = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
} as const;

const ROUNDED_CLASSES = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
} as const;

/**
 * Inline style block for the strong variant and glow effect.
 * Render once at the top of your layout (or in a global CSS file) so the
 * CSS classes are available. If you already have these in globals.css, you
 * can skip rendering this component.
 */
export function GlassCardStyles() {
  return (
    <style>{`
      .glass-card-strong {
        background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 50%, rgba(255,255,255,0.04) 100%);
        backdrop-filter: blur(40px);
        -webkit-backdrop-filter: blur(40px);
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow:
          inset 0 1px 0 0 rgba(255,255,255,0.08),
          inset 0 0 30px rgba(255,255,255,0.02),
          0 12px 48px rgba(0,0,0,0.4),
          0 4px 12px rgba(0,0,0,0.25);
      }
      .gradient-border-glow { position: relative; }
      .gradient-border-glow::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1), rgba(16,185,129,0.15));
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }
    `}</style>
  );
}

export function GlassCard({
  variant = "default",
  glow = false,
  padding = "md",
  rounded = "xl",
  className = "",
  children,
  ...rest
}: GlassCardProps) {
  const classes = [
    VARIANT_CLASSES[variant],
    PADDING_CLASSES[padding],
    ROUNDED_CLASSES[rounded],
    glow ? "gradient-border-glow" : "",
    "overflow-hidden",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
