"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDesignPipelineLogs } from "../../hooks/useDesignPipelineLogs";
import { useDesignVariants } from "../../hooks/useDesignVariants";
import type { DesignPipelineStatus, DesignPipelineStep, DesignPipelineLogEntry, DesignVariantStatus } from "../../design-pipelines";

/* ------------------------------------------------------------------ */
/*  Step config                                                        */
/* ------------------------------------------------------------------ */

const STEPS: { key: DesignPipelineStep; label: string; icon: string }[] = [
  { key: "parent_worktree", label: "Worktree", icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" },
  { key: "generating", label: "Generating", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "merging_variants", label: "Merging", icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
  { key: "installing", label: "Installing", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" },
  { key: "dev_server", label: "Dev Server", icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" },
  { key: "awaiting_review", label: "Review", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { key: "finalizing", label: "Finalizing", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "merging_final", label: "Final Merge", icon: "M5 13l4 4L19 7" },
];

const STATUS_CONFIG: Record<DesignPipelineStatus, { label: string; color: string; bg: string }> = {
  pending:           { label: "Pending",         color: "text-zinc-400",    bg: "bg-zinc-500/10" },
  parent_worktree:   { label: "Creating Worktree", color: "text-amber-400",  bg: "bg-amber-500/10" },
  generating:        { label: "Generating",      color: "text-indigo-400",  bg: "bg-indigo-500/10" },
  merging_variants:  { label: "Merging Variants", color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  installing:        { label: "Installing",      color: "text-teal-400",    bg: "bg-teal-500/10" },
  dev_server:        { label: "Starting Server",  color: "text-blue-400",   bg: "bg-blue-500/10" },
  awaiting_review:   { label: "Awaiting Review",  color: "text-purple-400", bg: "bg-purple-500/10" },
  finalizing:        { label: "Finalizing",       color: "text-violet-400", bg: "bg-violet-500/10" },
  merging_final:     { label: "Final Merge",      color: "text-emerald-400", bg: "bg-emerald-500/10" },
  success:           { label: "Success",          color: "text-emerald-400", bg: "bg-emerald-500/10" },
  failed:            { label: "Failed",           color: "text-red-400",    bg: "bg-red-500/10" },
  cancelled:         { label: "Cancelled",        color: "text-zinc-400",   bg: "bg-zinc-500/10" },
};

const VARIANT_STATUS_CONFIG: Record<DesignVariantStatus, { label: string; dot: string }> = {
  pending:    { label: "Pending",    dot: "bg-zinc-500" },
  generating: { label: "Generating", dot: "bg-indigo-500 animate-pulse" },
  merging:    { label: "Merging",    dot: "bg-cyan-500 animate-pulse" },
  merged:     { label: "Merged",     dot: "bg-emerald-500" },
  failed:     { label: "Failed",     dot: "bg-red-500" },
};

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled"]);

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function DesignPipelineDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();

  const { logs, status, currentStep, stepTimings, devServerPort, variants: liveVariants } = useDesignPipelineLogs({ runId });
  const { variants: dbVariants } = useDesignVariants(runId);

  const [filterStep, setFilterStep] = useState<DesignPipelineStep | "all">("all");
  const [filterVariant, setFilterVariant] = useState<number | "all">("all");
  const [finalizeMessage, setFinalizeMessage] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const isTerminal = TERMINAL_STATUSES.has(status);
  const isAwaitingReview = status === "awaiting_review";

  // Merge live variant statuses with DB variants for display
  const displayVariants = dbVariants.map((dbv) => {
    const live = liveVariants.find((v) => v.variantNumber === dbv.variantNumber);
    return { ...dbv, status: live?.status ?? dbv.status };
  });

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filterStep !== "all" && log.step !== filterStep) return false;
    if (filterVariant !== "all" && log.variantNumber !== filterVariant) return false;
    return true;
  });

  const handleFinalize = async () => {
    if (!finalizeMessage.trim()) return;
    setFinalizing(true);
    try {
      const res = await fetch(`/api/design-pipelines/${runId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalizeMessage }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to finalize");
      }
    } catch {
      alert("Failed to send finalization request");
    } finally {
      setFinalizing(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    await fetch(`/api/design-pipelines/${runId}`, { method: "DELETE" });
  };

  const statusCfg = STATUS_CONFIG[status];

  // Determine which step index we're on for the progress indicator
  const currentStepIdx = currentStep ? STEPS.findIndex((s) => s.key === currentStep) : -1;

  return (
    <div className="h-full bg-zinc-950 text-zinc-100 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
            <button onClick={() => router.push("/pipelines")} className="hover:text-zinc-300 transition-colors">
              Pipelines
            </button>
            <span>/</span>
            <span className="text-zinc-300">Design Run</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Design Pipeline</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isTerminal ? "" : "animate-pulse"} ${statusCfg.color.replace("text-", "bg-")}`} />
                {statusCfg.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isTerminal && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-lg border border-red-600/30 bg-red-600/5 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-600/10 disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-[13px] text-zinc-500 font-mono">{runId}</p>
        </div>

        {/* Step progress */}
        <div className="mb-6 backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-1">
            {STEPS.map((step, idx) => {
              const isActive = step.key === currentStep;
              const isDone = currentStepIdx > idx || isTerminal;
              const timing = stepTimings[step.key];

              return (
                <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? "bg-indigo-500/20 border-2 border-indigo-400 ring-4 ring-indigo-500/10"
                        : isDone
                        ? "bg-emerald-500/20 border border-emerald-500/40"
                        : "bg-white/[0.03] border border-white/[0.08]"
                    }`}
                  >
                    <svg
                      className={`w-3.5 h-3.5 ${isActive ? "text-indigo-400" : isDone ? "text-emerald-400" : "text-zinc-600"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                    </svg>
                  </div>
                  <span className={`text-[10px] ${isActive ? "text-indigo-300 font-medium" : isDone ? "text-zinc-400" : "text-zinc-600"}`}>
                    {step.label}
                  </span>
                  {timing && (
                    <span className="text-[9px] text-zinc-600 font-mono">
                      {timing.endedAt
                        ? `${Math.round((timing.endedAt - timing.startedAt) / 1000)}s`
                        : `${Math.round((Date.now() - timing.startedAt) / 1000)}s...`}
                    </span>
                  )}
                  {/* Variant indicators for generating step */}
                  {step.key === "generating" && liveVariants.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {liveVariants.map((v) => (
                        <div
                          key={v.variantNumber}
                          title={`v${v.variantNumber}: ${v.status}`}
                          className={`w-2 h-2 rounded-full ${VARIANT_STATUS_CONFIG[v.status]?.dot ?? "bg-zinc-600"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Variant cards */}
        {displayVariants.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Variants</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayVariants.map((v) => {
                const vcfg = VARIANT_STATUS_CONFIG[v.status];
                return (
                  <div
                    key={v.id}
                    className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-200">v{v.variantNumber}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                        <span className={`w-1.5 h-1.5 rounded-full ${vcfg.dot}`} />
                        {vcfg.label}
                      </span>
                    </div>
                    {v.brief && (
                      <p className="text-[12px] text-zinc-500 line-clamp-2">{v.brief}</p>
                    )}
                    {isAwaitingReview && devServerPort && v.status === "merged" && (
                      <a
                        href={`http://localhost:${devServerPort}/design-preview/v${v.variantNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                        </svg>
                        Open preview
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Review + Finalize section */}
        {isAwaitingReview && (
          <div className="mb-6 backdrop-blur-xl bg-purple-500/[0.04] border border-purple-500/[0.15] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-purple-300 mb-2">Review & Finalize</h2>
            <p className="text-[13px] text-zinc-400 mb-3">
              {devServerPort ? (
                <>
                  Dev server running at{" "}
                  <a
                    href={`http://localhost:${devServerPort}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    localhost:{devServerPort}
                  </a>
                  . Review the variants above, then tell the agent what to do.
                </>
              ) : (
                <>Dev server is not available. Review the generated code in the worktree, then tell the agent what to do.</>
              )}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={finalizeMessage}
                onChange={(e) => setFinalizeMessage(e.target.value)}
                placeholder='e.g., "Use v2" or "Mix v1 header with v3 layout"'
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-purple-500/40"
                onKeyDown={(e) => { if (e.key === "Enter") handleFinalize(); }}
              />
              <button
                onClick={handleFinalize}
                disabled={!finalizeMessage.trim() || finalizing}
                className="rounded-lg bg-purple-600/20 border border-purple-500/30 px-5 py-2 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {finalizing ? "Sending..." : "Finalize"}
              </button>
            </div>
          </div>
        )}

        {/* Log viewer */}
        <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
          {/* Log header with filters */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Logs</span>
            <select
              value={filterStep}
              onChange={(e) => setFilterStep(e.target.value as DesignPipelineStep | "all")}
              className="text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-zinc-300 outline-none"
            >
              <option value="all">All steps</option>
              {STEPS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {displayVariants.length > 0 && (
              <select
                value={filterVariant}
                onChange={(e) => setFilterVariant(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                className="text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-zinc-300 outline-none"
              >
                <option value="all">All variants</option>
                {displayVariants.map((v) => <option key={v.variantNumber} value={v.variantNumber}>v{v.variantNumber}</option>)}
              </select>
            )}
            <span className="text-[11px] text-zinc-600 ml-auto">{filteredLogs.length} entries</span>
          </div>

          {/* Log content */}
          <div className="max-h-[500px] overflow-auto font-mono text-[12px] leading-relaxed">
            {filteredLogs.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-600">
                {logs.length === 0 ? "Waiting for logs..." : "No logs match the current filters."}
              </div>
            ) : (
              <div className="px-4 py-2">
                {filteredLogs.map((log, idx) => (
                  <LogLine key={idx} log={log} />
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Log line component                                                 */
/* ------------------------------------------------------------------ */

function LogLine({ log }: { log: DesignPipelineLogEntry }) {
  const isError = log.stream === "stderr";
  const isToolStart = log.toolCallId?.endsWith("-start");
  const isToolEnd = log.toolCallId?.endsWith("-end");
  const isThinking = log.toolCallId?.startsWith("thinking-");

  if (isThinking) return null; // Hide thinking indicators

  return (
    <div className={`flex gap-2 py-0.5 ${isError ? "text-red-400" : "text-zinc-400"}`}>
      {log.variantNumber != null && (
        <span className="text-purple-500 shrink-0">v{log.variantNumber}</span>
      )}
      <span className="text-zinc-600 shrink-0 w-[52px] text-right tabular-nums">
        {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <span
        className={`flex-1 break-all ${
          isToolStart ? "text-cyan-500" : isToolEnd ? "text-cyan-600" : ""
        }`}
      >
        {log.text}
      </span>
    </div>
  );
}
