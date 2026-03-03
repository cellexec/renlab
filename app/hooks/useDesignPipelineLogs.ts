"use client";

import { useState, useEffect, useRef } from "react";
import type {
  DesignPipelineLogEntry,
  DesignPipelineStatus,
  DesignPipelineStep,
  DesignStepTimings,
  DesignVariantStatus,
} from "../design-pipelines";

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled"]);

interface UseDesignPipelineLogsOptions {
  runId: string | null;
  version?: number;
}

export function useDesignPipelineLogs({ runId, version = 0 }: UseDesignPipelineLogsOptions) {
  const [logs, setLogs] = useState<DesignPipelineLogEntry[]>([]);
  const [status, setStatus] = useState<DesignPipelineStatus>("pending");
  const [currentStep, setCurrentStep] = useState<DesignPipelineStep | null>(null);
  const [stepTimings, setStepTimings] = useState<DesignStepTimings>({});
  const [devServerPort, setDevServerPort] = useState<number | null>(null);
  const [variants, setVariants] = useState<{ variantNumber: number; status: DesignVariantStatus }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!runId) {
      setLogs([]);
      setStatus("pending");
      setCurrentStep(null);
      setStepTimings({});
      setDevServerPort(null);
      setVariants([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function connect() {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const res = await fetch(`/api/design-pipelines/${runId}/logs`, {
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
                if (event.stepTimings) setStepTimings(event.stepTimings);
                if (event.devServerPort != null) setDevServerPort(event.devServerPort);
                if (event.variants) setVariants(event.variants);
                if (TERMINAL_STATUSES.has(event.status)) {
                  reader.cancel().catch(() => {});
                  return;
                }
              } else if (event.type === "variant_status") {
                setVariants((prev) =>
                  prev.map((v) =>
                    v.variantNumber === event.variantNumber
                      ? { ...v, status: event.status }
                      : v
                  )
                );
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
  }, [runId, version]);

  return { logs, status, currentStep, stepTimings, devServerPort, variants };
}
