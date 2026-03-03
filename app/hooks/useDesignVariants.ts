"use client";

import { useState, useEffect } from "react";
import { getSupabase } from "../lib/supabase";
import type { DesignVariant, DesignVariantStatus } from "../design-pipelines";

function toVariant(row: Record<string, unknown>): DesignVariant {
  return {
    id: row.id as string,
    designRunId: row.design_run_id as string,
    variantNumber: row.variant_number as number,
    status: row.status as DesignVariantStatus,
    branchName: (row.branch_name as string) ?? null,
    worktreePath: (row.worktree_path as string) ?? null,
    brief: (row.brief as string) ?? null,
    agentId: (row.agent_id as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
    finishedAt: (row.finished_at as string) ?? null,
  };
}

export function useDesignVariants(designRunId: string | null) {
  const [variants, setVariants] = useState<DesignVariant[]>([]);

  useEffect(() => {
    if (!designRunId) {
      setVariants([]);
      return;
    }

    getSupabase()
      .from("design_variants")
      .select("*")
      .eq("design_run_id", designRunId)
      .order("variant_number")
      .then(({ data }) => {
        if (data) setVariants(data.map(toVariant));
      });

    const channel = getSupabase()
      .channel(`design-variants-${designRunId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "design_variants", filter: `design_run_id=eq.${designRunId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setVariants((prev) => {
              if (prev.some((v) => v.id === (payload.new as { id: string }).id)) return prev;
              return [...prev, toVariant(payload.new)].sort((a, b) => a.variantNumber - b.variantNumber);
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = toVariant(payload.new);
            setVariants((prev) =>
              prev.map((v) => (v.id === updated.id ? updated : v))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setVariants((prev) => prev.filter((v) => v.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [designRunId]);

  return { variants };
}
