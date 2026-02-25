"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { PipelineRun, PipelineStatus } from "../pipelines";

function toRun(row: Record<string, unknown>): PipelineRun {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    specificationId: row.specification_id as string,
    specVersionId: row.spec_version_id as string,
    status: row.status as PipelineStatus,
    currentStep: (row.current_step as PipelineRun["currentStep"]) ?? null,
    worktreeBranch: (row.worktree_branch as string) ?? null,
    worktreePath: (row.worktree_path as string) ?? null,
    reviewScore: (row.review_score as number) ?? null,
    reviewThreshold: row.review_threshold as number,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
    finishedAt: (row.finished_at as string) ?? null,
    iterations: (row.iterations as number) ?? 1,
    maxRetries: (row.max_retries as number) ?? 0,
  };
}

const ACTIVE_STATUSES: PipelineStatus[] = ["pending", "worktree", "coding", "reviewing", "merging"];

export function usePipelineStore(projectId: string | null) {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setRuns([]);
      setLoaded(true);
      return;
    }

    getSupabase()
      .from("pipeline_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRuns(data.map(toRun));
        setLoaded(true);
      });

    const channel = getSupabase()
      .channel(`pipeline-runs-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipeline_runs", filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRuns((prev) => [toRun(payload.new), ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = toRun(payload.new);
            setRuns((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setRuns((prev) => prev.filter((r) => r.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [projectId]);

  const triggerPipeline = useCallback(
    async (specificationId: string, specVersionId: string, specContent: string, specTitle: string, threshold: number, maxRetries: number = 0) => {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, specificationId, specVersionId, specContent, specTitle, threshold, maxRetries }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to trigger pipeline");
      }
      const data = await res.json();
      return data.id as string;
    },
    [projectId]
  );

  const cancelRun = useCallback(async (runId: string) => {
    await fetch(`/api/pipelines/${runId}`, { method: "DELETE" });
  }, []);

  const hasActiveRun = useCallback(
    (specificationId: string) => {
      return runs.some(
        (r) => r.specificationId === specificationId && ACTIVE_STATUSES.includes(r.status)
      );
    },
    [runs]
  );

  const getActiveRunId = useCallback(
    (specificationId: string): string | null => {
      const run = runs.find(
        (r) => r.specificationId === specificationId && ACTIVE_STATUSES.includes(r.status)
      );
      return run?.id ?? null;
    },
    [runs]
  );

  return { runs, loaded, triggerPipeline, cancelRun, hasActiveRun, getActiveRunId };
}
