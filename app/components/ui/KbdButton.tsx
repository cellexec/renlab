"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface KbdButtonProps {
  /** The keyboard shortcut character (e.g. "n", "a"). Displayed as a kbd badge. */
  shortcut: string;
  /** URL to navigate to when clicked or shortcut pressed. */
  href: string;
  /** Button label text. */
  children: React.ReactNode;
  /** Visual variant. */
  variant?: "primary" | "secondary";
  /** Additional CSS classes. */
  className?: string;
  /** Whether the shortcut listener is active (default: true). Set false to disable. */
  active?: boolean;
}

/**
 * A link button with an inline kbd shortcut badge.
 * Registers a global keydown listener that navigates to `href` when the shortcut is pressed
 * (only when focus is not in an input/textarea/select and no modifiers are held).
 * Cleans up on unmount.
 */
export function KbdButton({
  shortcut,
  href,
  children,
  variant = "primary",
  className = "",
  active = true,
}: KbdButtonProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === shortcut) {
        e.preventDefault();
        router.push(href);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, shortcut, href, router]);

  const baseStyles = "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors duration-200";
  const variantStyles =
    variant === "primary"
      ? "bg-violet-600 hover:bg-violet-500 text-white"
      : "backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100";
  const kbdStyles =
    variant === "primary"
      ? "rounded bg-violet-500/40 px-1 py-0.5 text-[9px] font-medium text-violet-200"
      : "rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500";

  return (
    <Link href={href} tabIndex={-1} className={`${baseStyles} ${variantStyles} ${className}`}>
      {children}
      <kbd className={kbdStyles}>{shortcut}</kbd>
    </Link>
  );
}
