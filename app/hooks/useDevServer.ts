"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ServerStatus, LogEntry } from "../lib/devServerManager";

interface UseDevServerOptions {
  projectId: string | null;
  projectPath: string | undefined;
}

export function useDevServer({ projectId, projectPath }: UseDevServerOptions) {
  const [status, setStatus] = useState<ServerStatus>("idle");
  const [port, setPort] = useState<number | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch initial status
  useEffect(() => {
    if (!projectId) {
      setStatus("idle");
      setPort(null);
      setExitCode(null);
      setLogs([]);
      return;
    }

    fetch(`/api/dev-server/status?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setStatus(data.status);
        setPort(data.port);
        setExitCode(data.exitCode);
      })
      .catch(() => {});
  }, [projectId]);

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
        const res = await fetch(`/api/dev-server/logs?projectId=${projectId}`, {
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
                setStatus(event.status);
                setPort(event.port);
                setExitCode(event.exitCode);
                setIsLoading(false);
              }
            } catch {}
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Cancel leaked reader before reconnecting
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
  }, [projectId]);

  const doAction = useCallback(
    async (action: "start" | "stop" | "restart" | "clear-cache") => {
      if (!projectId) return;
      setIsLoading(true);
      try {
        const res = await fetch("/api/dev-server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, projectId, projectPath }),
        });
        const data = await res.json();
        if (data.status) setStatus(data.status);
        if (data.port !== undefined) setPort(data.port);
        if (action === "clear-cache") setIsLoading(false);
      } catch {
        setIsLoading(false);
      }
    },
    [projectId, projectPath]
  );

  const start = useCallback(() => doAction("start"), [doAction]);
  const stop = useCallback(() => doAction("stop"), [doAction]);
  const restart = useCallback(() => doAction("restart"), [doAction]);
  const clearCache = useCallback(() => doAction("clear-cache"), [doAction]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { status, port, exitCode, logs, isLoading, start, stop, restart, clearCache, clearLogs };
}
