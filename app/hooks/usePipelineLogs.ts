"use client";

import { useState, useEffect, useRef } from "react";
import type { PipelineLogEntry, PipelineStatus, PipelineStep, StepTimings } from "../pipelines";

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled", "rejected"]);

interface UsePipelineLogsOptions {
  runId: string | null;
  /** Increment to force SSE reconnection (e.g. after retry-merge) */
  version?: number;
}

export function usePipelineLogs({ runId, version = 0 }: UsePipelineLogsOptions) {
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const [status, setStatus] = useState<PipelineStatus>("pending");
  const [currentStep, setCurrentStep] = useState<PipelineStep | null>(null);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [stepTimings, setStepTimings] = useState<StepTimings>({});
  const [iteration, setIteration] = useState(1);
  const [maxRetries, setMaxRetries] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!runId) {
      setLogs([]);
      setStatus("pending");
      setCurrentStep(null);
      setReviewScore(null);
      setStepTimings({});
      setIteration(1);
      setMaxRetries(0);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function connect() {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const res = await fetch(`/api/pipelines/${runId}/logs`, {
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
                  return next.length > 2000 ? next.slice(-2000) : next;
                });
              } else if (event.type === "status") {
                setStatus(event.status);
                setCurrentStep(event.currentStep);
                if (event.reviewScore != null) setReviewScore(event.reviewScore);
                if (event.stepTimings) setStepTimings(event.stepTimings);
                if (event.iteration != null) setIteration(event.iteration);
                if (event.maxRetries != null) setMaxRetries(event.maxRetries);
                // Stop listening once pipeline is done
                if (TERMINAL_STATUSES.has(event.status)) {
                  reader.cancel().catch(() => {});
                  return;
                }
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
  }, [runId, version]);

  const clearLogs = () => setLogs([]);

  return { logs, status, currentStep, reviewScore, stepTimings, iteration, maxRetries, clearLogs };
}
