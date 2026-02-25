"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { SubAgent } from "../agents";

// DB row → SubAgent
function toAgent(row: Record<string, unknown>): SubAgent {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    model: row.model as SubAgent["model"],
    systemPrompt: row.system_prompt as string,
    color: row.color as string,
  };
}

// SubAgent fields → DB columns
function toRow(agent: Partial<Omit<SubAgent, "id">>) {
  const row: Record<string, unknown> = {};
  if (agent.name !== undefined) row.name = agent.name;
  if (agent.description !== undefined) row.description = agent.description;
  if (agent.model !== undefined) row.model = agent.model;
  if (agent.systemPrompt !== undefined) row.system_prompt = agent.systemPrompt;
  if (agent.color !== undefined) row.color = agent.color;
  return row;
}

export function useAgentStore() {
  const [agents, setAgents] = useState<SubAgent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Initial load + realtime subscription
  useEffect(() => {
    getSupabase()
      .from("agents")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        if (data) setAgents(data.map(toAgent));
        setLoaded(true);
      });

    const channel = getSupabase()
      .channel("agents-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setAgents((prev) => [...prev, toAgent(payload.new)]);
          } else if (payload.eventType === "UPDATE") {
            const updated = toAgent(payload.new);
            setAgents((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setAgents((prev) => prev.filter((a) => a.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, []);

  const getAgent = useCallback(
    (id: string): SubAgent | undefined => agents.find((a) => a.id === id),
    [agents]
  );

  const addAgent = useCallback(async (agent: Omit<SubAgent, "id">) => {
    await getSupabase().from("agents").insert(toRow(agent));
  }, []);

  const updateAgent = useCallback(
    async (id: string, partial: Partial<Omit<SubAgent, "id">>) => {
      await getSupabase().from("agents").update(toRow(partial)).eq("id", id);
    },
    []
  );

  const deleteAgent = useCallback(async (id: string) => {
    await getSupabase().from("agents").delete().eq("id", id);
  }, []);

  return { agents, loaded, getAgent, addAgent, updateAgent, deleteAgent };
}
