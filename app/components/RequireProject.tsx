"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "./ProjectContext";

export function RequireProject({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeProject, loaded } = useProjectContext();

  useEffect(() => {
    if (loaded && !activeProject) {
      router.replace("/");
    }
  }, [loaded, activeProject, router]);

  if (!loaded || !activeProject) return null;

  return <>{children}</>;
}
