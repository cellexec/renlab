"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

export interface NavHintItem {
  /** Unique key for the item (also used as href for navigation items). */
  key: string;
  label: string;
  /** If provided, navigates here. Otherwise `action` is called. */
  href?: string;
  /** Custom action instead of navigation. */
  action?: () => void;
}

/** Compute the shortest unique lowercase prefix for each item. */
function computeHints(items: NavHintItem[]): Map<string, string> {
  const hints = new Map<string, string>();

  for (const item of items) {
    const lower = item.label.toLowerCase();
    let len = 1;

    while (len <= lower.length) {
      const prefix = lower.slice(0, len);
      const conflicts = items.filter(
        (other) => other.key !== item.key && other.label.toLowerCase().startsWith(prefix)
      );
      if (conflicts.length === 0) break;
      len++;
    }

    hints.set(item.key, lower.slice(0, len));
  }

  return hints;
}

export function useNavHints(items: NavHintItem[]) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [typed, setTyped] = useState("");

  const hints = useMemo(() => computeHints(items), [items]);

  // Which items still match what's been typed so far
  const matching = useMemo(() => {
    if (!active || !typed) return new Set(items.map((i) => i.key));
    const set = new Set<string>();
    for (const item of items) {
      const hint = hints.get(item.key) ?? "";
      if (hint.startsWith(typed)) set.add(item.key);
    }
    return set;
  }, [active, typed, items, hints]);

  const deactivate = useCallback(() => {
    setActive(false);
    setTyped("");
  }, []);

  // Check for unique match after typing
  useEffect(() => {
    if (!active || !typed) return;

    for (const item of items) {
      const hint = hints.get(item.key);
      if (hint === typed) {
        if (item.action) {
          item.action();
        } else if (item.href) {
          router.push(item.href);
        }
        deactivate();
        return;
      }
    }

    if (matching.size === 0) {
      deactivate();
    }
  }, [active, typed, items, hints, matching, router, deactivate]);

  // Global keydown
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const isEditable = (e.target as HTMLElement)?.isContentEditable;

      if (!active) {
        if (isInput || isEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Don't activate when a dialog/overlay is open
        if (document.querySelector("[data-overlay-open]")) return;
        if (e.key === " ") {
          e.preventDefault();
          setActive(true);
          setTyped("");
        }
        return;
      }

      // Hint mode is active — eat all keys
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        deactivate();
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        setTyped((t) => {
          const next = t.slice(0, -1);
          if (!next) deactivate();
          return next;
        });
        return;
      }

      if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTyped((t) => t + e.key.toLowerCase());
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [active, deactivate]);

  // Auto-cancel after 3s of inactivity
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(deactivate, 3000);
    return () => clearTimeout(timer);
  }, [active, typed, deactivate]);

  return { active, typed, hints, matching, deactivate };
}
