"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { KnowledgeUpdate } from "../knowledge";

interface KnowledgeState {
  exists: boolean;
  docCount: number;
  lastUpdate: KnowledgeUpdate | null;
  updates: KnowledgeUpdate[];
  loading: boolean;
}

export function useKnowledgeStore(projectId: string | undefined) {
  const [state, setState] = useState<KnowledgeState>({
    exists: false,
    docCount: 0,
    lastUpdate: null,
    updates: [],
    loading: true,
  });

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/knowledge?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      setState({
        exists: data.exists,
        docCount: data.docCount,
        lastUpdate: data.lastUpdate,
        updates: data.updates,
        loading: false,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription on knowledge_updates
  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`knowledge-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "knowledge_updates", filter: `project_id=eq.${projectId}` },
        () => { refresh(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  const bootstrap = async () => {
    if (!projectId) return;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      await fetch("/api/knowledge/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      await refresh();
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  return { ...state, bootstrap, refresh };
}
