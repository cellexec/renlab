"use client";

import { createContext, useContext } from "react";
import { useProjectStore } from "../hooks/useProjectStore";
import type { Project } from "../projects";

type ProjectContextValue = ReturnType<typeof useProjectStore>;

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const store = useProjectStore();
  return (
    <ProjectContext.Provider value={store}>{children}</ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be used within ProjectProvider");
  return ctx;
}
