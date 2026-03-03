"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { DesignRun, DesignPipelineStatus } from "../design-pipelines";

function toRun(row: Record<string, unknown>): DesignRun {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    specificationId: row.specification_id as string,
    specVersionId: row.spec_version_id as string,
    status: row.status as DesignPipelineStatus,
    currentStep: (row.current_step as DesignRun["currentStep"]) ?? null,
    parentBranch: (row.parent_branch as string) ?? null,
    parentWorktreePath: (row.parent_worktree_path as string) ?? null,
    devServerPort: (row.dev_server_port as number) ?? null,
    variantCount: (row.variant_count as number) ?? 2,
    targetPath: (row.target_path as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
    finishedAt: (row.finished_at as string) ?? null,
  };
}

const ACTIVE_STATUSES: DesignPipelineStatus[] = [
  "pending", "parent_worktree", "generating", "merging_variants",
  "installing", "dev_server", "awaiting_review", "finalizing", "merging_final",
];

export function useDesignPipelineStore(projectId: string | null) {
  const [runs, setRuns] = useState<DesignRun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setRuns([]);
      setLoaded(true);
      return;
    }

    getSupabase()
      .from("design_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setRuns(data.map(toRun));
        setLoaded(true);
      });

    const channel = getSupabase()
      .channel(`design-runs-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "design_runs", filter: `project_id=eq.${projectId}` },
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

  const triggerDesignPipeline = useCallback(
    async (specificationId: string, specVersionId: string, specContent: string, specTitle: string, variantCount?: number, targetPath?: string) => {
      const res = await fetch("/api/design-pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, specificationId, specVersionId, specContent, specTitle, variantCount, targetPath }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to trigger design pipeline");
      }
      const data = await res.json();
      return data.id as string;
    },
    [projectId]
  );

  const cancelRun = useCallback(async (runId: string) => {
    await fetch(`/api/design-pipelines/${runId}`, { method: "DELETE" });
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

  return { runs, loaded, triggerDesignPipeline, cancelRun, hasActiveRun, getActiveRunId };
}
