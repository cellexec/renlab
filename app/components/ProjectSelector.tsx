"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Global keyboard shortcuts for project selection. Navigates to /project-selection. */
export function ProjectSelector() {
  const router = useRouter();

  useEffect(() => {
    const handler = () => router.push("/project-selection");
    window.addEventListener("open-project-selector", handler);
    return () => window.removeEventListener("open-project-selector", handler);
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd+P opens project selection from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        router.push("/project-selection");
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "I") {
        e.preventDefault();
        router.push("/projects/import-monorepo");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
