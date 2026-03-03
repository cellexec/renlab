"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { Project, NewProject, Stack } from "../projects";

const ACTIVE_PROJECT_KEY = "activeProjectId";

function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    path: row.path as string,
    stack: (row.stack as Stack) ?? "nextjs",
    pipelineThreshold: (row.pipeline_threshold as number) ?? 80,
    maxRetries: (row.max_retries as number) ?? 2,
    repoPath: (row.repo_path as string) ?? null,
  };
}

function toRow(project: Partial<Omit<Project, "id">>) {
  const row: Record<string, unknown> = {};
  if (project.title !== undefined) row.title = project.title;
  if (project.description !== undefined) row.description = project.description;
  if (project.path !== undefined) row.path = project.path;
  if (project.stack !== undefined) row.stack = project.stack;
  if (project.pipelineThreshold !== undefined) row.pipeline_threshold = project.pipelineThreshold;
  if (project.maxRetries !== undefined) row.max_retries = project.maxRetries;
  if (project.repoPath !== undefined) row.repo_path = project.repoPath;
  return row;
}

export function useProjectStore() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  });

  // Persist active project to localStorage
  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  }, [activeProjectId]);

  // Initial load + realtime subscription
  useEffect(() => {
    getSupabase()
      .from("projects")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        const loaded = data ? data.map(toProject) : [];
        setProjects(loaded);
        // Clear stale activeProjectId if the project no longer exists (e.g. after DB reset)
        setActiveProjectId((cur) =>
          cur && !loaded.some((p) => p.id === cur) ? null : cur
        );
        setLoaded(true);
      });

    const channel = getSupabase()
      .channel("projects-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setProjects((prev) => [...prev, toProject(payload.new)]);
          } else if (payload.eventType === "UPDATE") {
            const updated = toProject(payload.new);
            setProjects((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setProjects((prev) => prev.filter((p) => p.id !== id));
            setActiveProjectId((cur) => (cur === id ? null : cur));
          }
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const addProject = useCallback(
    async (project: NewProject): Promise<string | null> => {
      const { data } = await getSupabase()
        .from("projects")
        .insert(toRow(project))
        .select("id")
        .single();
      const id = data?.id as string | undefined;
      if (id) setActiveProjectId(id);
      return id ?? null;
    },
    []
  );

  const addProjects = useCallback(
    async (newProjects: NewProject[]): Promise<string[]> => {
      if (newProjects.length === 0) return [];
      const { data, error } = await getSupabase()
        .from("projects")
        .insert(newProjects.map(toRow))
        .select("id");
      if (error) throw new Error(error.message);
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (ids.length > 0) setActiveProjectId(ids[0]);
      return ids;
    },
    []
  );

  const updateProject = useCallback(
    async (id: string, partial: Partial<Omit<Project, "id">>) => {
      await getSupabase().from("projects").update(toRow(partial)).eq("id", id);
    },
    []
  );

  const deleteProject = useCallback(async (id: string) => {
    await getSupabase().from("projects").delete().eq("id", id);
  }, []);

  return {
    projects,
    loaded,
    activeProjectId,
    activeProject,
    setActiveProjectId,
    addProject,
    addProjects,
    updateProject,
    deleteProject,
  };
}
