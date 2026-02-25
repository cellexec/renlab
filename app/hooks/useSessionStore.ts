"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { Model } from "../components/ModelSelect";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; detail: string };

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: ContentBlock[];
  ordinal: number;
}

export interface Session {
  clientId: string;
  sessionId: string | null;
  label: string;
  model: Model;
  agentId: string;
  messages: Message[];
  createdAt: number;
}

function toSession(
  row: Record<string, unknown>,
  messages: Message[] = []
): Session {
  return {
    clientId: row.client_id as string,
    sessionId: (row.session_id as string) ?? null,
    label: row.label as string,
    model: row.model as Model,
    agentId: row.agent_id as string,
    messages,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

function parseBlocks(content: string): ContentBlock[] | undefined {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      return parsed as ContentBlock[];
    }
  } catch {}
  return undefined;
}

function toMessage(row: Record<string, unknown>): Message {
  const content = row.content as string;
  return {
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content,
    blocks: parseBlocks(content),
    ordinal: row.ordinal as number,
  };
}

export function useSessionStore() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Initial load + realtime subscriptions
  useEffect(() => {
    const sb = getSupabase();

    async function load() {
      const { data: sessionRows } = await sb
        .from("sessions")
        .select("*")
        .order("created_at");

      const { data: messageRows } = await sb
        .from("messages")
        .select("*")
        .order("ordinal");

      const msgsBySession = new Map<string, Message[]>();
      for (const row of messageRows ?? []) {
        const key = row.session_client_id as string;
        if (!msgsBySession.has(key)) msgsBySession.set(key, []);
        msgsBySession.get(key)!.push(toMessage(row));
      }

      const result = (sessionRows ?? []).map((r) =>
        toSession(r, msgsBySession.get(r.client_id as string) ?? [])
      );
      setSessions(result);
      if (result.length > 0) {
        setActiveClientId(result[0].clientId);
      }
      setLoaded(true);
    }
    load();

    // Realtime: sessions
    const sessionChannel = sb
      .channel("sessions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newSession = toSession(payload.new);
            setSessions((prev) => {
              // Deduplicate: if session already exists (optimistic), skip
              if (prev.some((s) => s.clientId === newSession.clientId)) return prev;
              return [...prev, newSession];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new;
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId === updated.client_id
                  ? {
                      ...s,
                      sessionId: (updated.session_id as string) ?? null,
                      label: updated.label as string,
                      model: updated.model as Model,
                      agentId: updated.agent_id as string,
                    }
                  : s
              )
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { client_id: string }).client_id;
            setSessions((prev) => prev.filter((s) => s.clientId !== id));
          }
        }
      )
      .subscribe();

    // Realtime: messages
    const messageChannel = sb
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const msg = toMessage(payload.new);
            const sid = payload.new.session_client_id as string;
            setSessions((prev) =>
              prev.map((s) => {
                if (s.clientId !== sid) return s;
                // Deduplicate: if message already exists (optimistic or by ordinal), replace it
                const exists = s.messages.some(
                  (m) => m.id === msg.id || (m.ordinal === msg.ordinal && m.role === msg.role)
                );
                if (exists) {
                  return {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === msg.id || (m.ordinal === msg.ordinal && m.role === msg.role)
                        ? msg
                        : m
                    ),
                  };
                }
                return {
                  ...s,
                  messages: [...s.messages, msg].sort(
                    (a, b) => a.ordinal - b.ordinal
                  ),
                };
              })
            );
          } else if (payload.eventType === "UPDATE") {
            const msg = toMessage(payload.new);
            const sid = payload.new.session_client_id as string;
            setSessions((prev) =>
              prev.map((s) =>
                s.clientId === sid
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === msg.id ? msg : m
                      ),
                    }
                  : s
              )
            );
          } else if (payload.eventType === "DELETE") {
            const msgId = (payload.old as { id: string }).id;
            setSessions((prev) =>
              prev.map((s) => ({
                ...s,
                messages: s.messages.filter((m) => m.id !== msgId),
              }))
            );
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(sessionChannel);
      sb.removeChannel(messageChannel);
    };
  }, []);

  const createSession = useCallback(
    async (agentId: string, agentName: string, model: Model) => {
      const clientId = crypto.randomUUID();
      const count = sessions.filter((s) => s.agentId === agentId).length;
      const label = `${agentName} ${count + 1}`;

      // Optimistic: add session to local state immediately (prevents loops)
      const optimistic: Session = {
        clientId,
        sessionId: null,
        label,
        model,
        agentId,
        messages: [],
        createdAt: Date.now(),
      };
      setSessions((prev) => [...prev, optimistic]);
      setActiveClientId(clientId);

      await getSupabase().from("sessions").insert({
        client_id: clientId,
        label,
        model,
        agent_id: agentId,
      });

      return clientId;
    },
    [sessions]
  );

  const switchSession = useCallback((clientId: string) => {
    setActiveClientId(clientId);
  }, []);

  // Local-only optimistic updater for streaming display
  const updateMessages = useCallback(
    (clientId: string, messages: Message[]) => {
      setSessions((prev) =>
        prev.map((s) => (s.clientId === clientId ? { ...s, messages } : s))
      );
    },
    []
  );

  const setSessionId = useCallback(
    async (clientId: string, sessionId: string) => {
      await getSupabase()
        .from("sessions")
        .update({ session_id: sessionId })
        .eq("client_id", clientId);
    },
    []
  );

  const updateLabel = useCallback(
    async (clientId: string, label: string) => {
      await getSupabase()
        .from("sessions")
        .update({ label })
        .eq("client_id", clientId);
    },
    []
  );

  const deleteSession = useCallback(
    async (clientId: string) => {
      await getSupabase().from("sessions").delete().eq("client_id", clientId);
      if (clientId === activeClientId) {
        setSessions((prev) => {
          const remaining = prev.filter((s) => s.clientId !== clientId);
          setActiveClientId(
            remaining.length > 0
              ? remaining[remaining.length - 1].clientId
              : null
          );
          return prev; // let realtime handle actual removal
        });
      }
    },
    [activeClientId]
  );

  // Insert a message into DB, returns the message id
  const addMessage = useCallback(
    async (
      clientId: string,
      role: "user" | "assistant",
      content: string
    ): Promise<string> => {
      const session = sessions.find((s) => s.clientId === clientId);
      const ordinal = session ? session.messages.length + 1 : 1;
      const { data, error } = await getSupabase()
        .from("messages")
        .insert({
          session_client_id: clientId,
          role,
          content,
          ordinal,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to insert message");
      return data.id;
    },
    [sessions]
  );

  const activeSession =
    sessions.find((s) => s.clientId === activeClientId) ?? null;

  return {
    sessions,
    activeClientId,
    activeSession,
    loaded,
    createSession,
    switchSession,
    updateMessages,
    setSessionId,
    updateLabel,
    deleteSession,
    addMessage,
  };
}
