"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CommandStatus, LogEntry } from "../lib/dbManager";

interface UseDatabaseOptions {
  projectId: string | null;
  projectPath: string | undefined;
  repoPath: string | null | undefined;
}

export function useDatabase({ projectId, projectPath, repoPath }: UseDatabaseOptions) {
  const [commandStatus, setCommandStatus] = useState<CommandStatus>("idle");
  const [servicesUp, setServicesUp] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isMonorepo = !!repoPath;

  // Fetch initial status
  useEffect(() => {
    if (!projectId || !projectPath) {
      setCommandStatus("idle");
      setServicesUp(false);
      setLogs([]);
      return;
    }

    const params = new URLSearchParams({ projectId, projectPath });
    if (repoPath) params.set("repoPath", repoPath);

    fetch(`/api/database/status?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setCommandStatus(data.commandStatus);
        setServicesUp(data.servicesUp);
      })
      .catch(() => {});
  }, [projectId, projectPath, repoPath]);

  // SSE connection for logs and status updates
  useEffect(() => {
    if (!projectId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function connect() {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const res = await fetch(`/api/database/logs?projectId=${projectId}`, {
          signal: controller.signal,
        });

        reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const data = line.replace(/^data: /, "");
            if (!data) continue;
            try {
              const event = JSON.parse(data);
              if (event.type === "buffer") {
                setLogs(event.entries);
              } else if (event.type === "log") {
                setLogs((prev) => {
                  const next = [...prev, event.entry];
                  return next.length > 1000 ? next.slice(-1000) : next;
                });
              } else if (event.type === "status") {
                setCommandStatus(event.status);
                setIsLoading(false);
                // Re-check container status after command completes
                if (event.status === "done" || event.status === "error") {
                  refreshStatus();
                }
              }
            } catch {}
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        reader?.cancel().catch(() => {});
        if (!cancelled) {
          await new Promise((r) => setTimeout(r, 2000));
          if (!cancelled) connect();
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const refreshStatus = useCallback(() => {
    if (!projectId || !projectPath) return;
    const params = new URLSearchParams({ projectId, projectPath });
    if (repoPath) params.set("repoPath", repoPath);

    fetch(`/api/database/status?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setServicesUp(data.servicesUp);
      })
      .catch(() => {});
  }, [projectId, projectPath, repoPath]);

  const doAction = useCallback(
    async (action: string) => {
      if (!projectId || !projectPath) return;
      setIsLoading(true);
      try {
        const res = await fetch("/api/database", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, projectId, projectPath, repoPath }),
        });
        const data = await res.json();
        if (data.status) setCommandStatus(data.status);
      } catch {
        setIsLoading(false);
      }
    },
    [projectId, projectPath, repoPath]
  );

  // Supabase actions
  const start = useCallback(() => doAction("start"), [doAction]);
  const stop = useCallback(() => doAction("stop"), [doAction]);
  const migrateUp = useCallback(() => doAction("migration-up"), [doAction]);
  const dbReset = useCallback(() => doAction("db-reset"), [doAction]);
  const dbSeed = useCallback(() => doAction("db-seed"), [doAction]);

  // Monorepo actions
  const servicesStart = useCallback(() => doAction("services-start"), [doAction]);
  const servicesStop = useCallback(() => doAction("services-stop"), [doAction]);
  const dbMigrate = useCallback(() => doAction("db-migrate"), [doAction]);
  const authMigrate = useCallback(() => doAction("auth-migrate"), [doAction]);
  const authSeed = useCallback(() => doAction("auth-seed"), [doAction]);
  const authReset = useCallback(() => doAction("auth-reset"), [doAction]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return {
    commandStatus, servicesUp, supabaseUp: servicesUp, logs, isLoading, isMonorepo,
    // Supabase
    start, stop, migrateUp, dbReset, dbSeed,
    // Monorepo
    servicesStart, servicesStop, dbMigrate, authMigrate, authSeed, authReset,
    clearLogs,
  };
}
