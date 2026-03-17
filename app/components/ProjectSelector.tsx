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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
