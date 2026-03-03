"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useDesignPipelineLogs } from "../../hooks/useDesignPipelineLogs";
import { useDesignVariants } from "../../hooks/useDesignVariants";
import {
  GlassCard,
  GlassCardStyles,
  StatusBadge,
  StepProgress,
  formatStepDuration,
  InfoWidget,
  InfoWidgetRow,
  LogTerminal,
  IconCircle,
  SectionHeader,
} from "../../components/ui";
import type {
  DesignPipelineStatus,
  DesignPipelineStep,
  DesignPipelineLogEntry,
  DesignVariantStatus,
  DesignRun,
} from "../../design-pipelines";
import type { BadgeStatus } from "../../components/ui";
import type { StepState } from "../../components/ui";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONO = "var(--font-geist-mono), ui-monospace, monospace";

const STEPS: { key: DesignPipelineStep; label: string; iconPath: string }[] = [
  { key: "parent_worktree", label: "Worktree", iconPath: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" },
  { key: "generating", label: "Generating", iconPath: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "merging_variants", label: "Merging", iconPath: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
  { key: "installing", label: "Installing", iconPath: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" },
  { key: "dev_server", label: "Dev Server", iconPath: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" },
  { key: "awaiting_review", label: "Review", iconPath: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { key: "finalizing", label: "Finalizing", iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "merging_final", label: "Final Merge", iconPath: "M5 13l4 4L19 7" },
];

const VARIANT_STATUS_CONFIG: Record<DesignVariantStatus, { label: string; dot: string; badge: BadgeStatus }> = {
  pending:    { label: "Pending",    dot: "bg-zinc-500",                    badge: "pending" },
  generating: { label: "Generating", dot: "bg-indigo-500 animate-pulse",    badge: "running" },
  merging:    { label: "Merging",    dot: "bg-cyan-500 animate-pulse",      badge: "running" },
  merged:     { label: "Merged",     dot: "bg-emerald-500",                 badge: "success" },
  failed:     { label: "Failed",     dot: "bg-red-500",                     badge: "failed" },
};

const TERMINAL_STATUSES = new Set<string>(["success", "failed", "cancelled"]);

function statusToBadge(status: DesignPipelineStatus): BadgeStatus {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "running";
}

function statusLabel(status: DesignPipelineStatus): string {
  const labels: Record<DesignPipelineStatus, string> = {
    pending: "Pending",
    parent_worktree: "Creating Worktree",
    generating: "Generating",
    merging_variants: "Merging Variants",
    installing: "Installing",
    dev_server: "Starting Server",
    awaiting_review: "Awaiting Review",
    finalizing: "Finalizing",
    merging_final: "Final Merge",
    success: "Success",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return labels[status];
}

/* ------------------------------------------------------------------ */
/*  Status Widget (matching feature pipeline)                          */
/* ------------------------------------------------------------------ */

function DesignStatusWidget({ status }: { status: DesignPipelineStatus }) {
  const isRunning = !TERMINAL_STATUSES.has(status);

  const config: Record<string, { color: string; glow: "emerald" | "red" | "amber" | "none"; tint: "emerald" | "red" | "amber" | "zinc" | "none"; animBg: string; iconColor: string }> = {
    success:   { color: "text-emerald-400", glow: "emerald", tint: "emerald", animBg: "", iconColor: "emerald" },
    failed:    { color: "text-red-400",     glow: "red",     tint: "red",     animBg: "", iconColor: "red" },
    cancelled: { color: "text-zinc-400",    glow: "none",    tint: "zinc",    animBg: "", iconColor: "zinc" },
  };

  const c = config[status] ?? {
    color: "text-amber-400",
    glow: "amber" as const,
    tint: "amber" as const,
    animBg: "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 70%)",
    iconColor: "amber",
  };

  return (
    <InfoWidget label="Status" center glow={c.glow} tint={c.tint}>
      {isRunning && (
        <div className="absolute inset-0 animate-pulse" style={{ background: c.animBg }} />
      )}
      <div className="flex flex-col items-center gap-3">
        <IconCircle color={c.iconColor as "emerald" | "red" | "amber" | "zinc"} size="lg">
          {status === "success" ? (
            <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          ) : status === "failed" ? (
            <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          ) : status === "cancelled" ? (
            <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          ) : (
            <svg className="h-7 w-7 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          )}
        </IconCircle>
        <span className={`text-lg font-semibold tracking-tight ${c.color}`}>
          {statusLabel(status)}
        </span>
      </div>
    </InfoWidget>
  );
}

/* ------------------------------------------------------------------ */
/*  Timing Widget (matching feature pipeline)                          */
/* ------------------------------------------------------------------ */

function DesignTimingWidget({ run, isActive }: { run: DesignRun | null; isActive: boolean }) {
  const items = [
    { label: "Created", value: run ? formatTimestamp(run.createdAt) : "...", done: true },
    { label: "Finished", value: run?.finishedAt ? formatTimestamp(run.finishedAt) : isActive ? "In progress" : "...", done: !!run?.finishedAt },
    { label: "Duration", value: run ? totalDuration(run.createdAt, run.finishedAt) : "...", done: !!run?.finishedAt },
  ];

  return (
    <InfoWidget label="Timing">
      <div className="flex flex-col gap-0">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center w-3 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${item.done ? "border-emerald-500/60 bg-emerald-500/20" : isActive && i === 1 ? "border-amber-400/60 bg-amber-400/20 animate-pulse" : "border-zinc-700 bg-zinc-800"}`} />
              {i < items.length - 1 && (
                <div className={`w-px flex-1 min-h-[28px] ${item.done ? "bg-emerald-500/20" : "bg-zinc-800"}`} />
              )}
            </div>
            <div className="pb-4 -mt-0.5">
              <div className="text-[10px] text-zinc-600 mb-0.5">{item.label}</div>
              <div className="text-sm text-zinc-300 tabular-nums" style={{ fontFamily: MONO }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </InfoWidget>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function totalDuration(startIso: string, endIso: string | null | undefined): string {
  if (!endIso) return "...";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const secs = Math.round(ms / 1000);
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins === 0) return `${rem}s`;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
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
  const [run, setRun] = useState<DesignRun | null>(null);
  const [, setTick] = useState(0);

  // Fetch run metadata from API
  useEffect(() => {
    fetch(`/api/design-pipelines/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setRun({
            id: data.id,
            projectId: data.project_id,
            specificationId: data.specification_id,
            specVersionId: data.spec_version_id,
            status: data.status,
            currentStep: data.current_step,
            parentBranch: data.parent_branch,
            parentWorktreePath: data.parent_worktree_path,
            devServerPort: data.dev_server_port,
            variantCount: data.variant_count ?? 0,
            targetPath: data.target_path,
            errorMessage: data.error_message,
            createdAt: data.created_at,
            finishedAt: data.finished_at,
          });
        }
      })
      .catch(() => {});
  }, [runId]);

  // Re-fetch run data on terminal status
  useEffect(() => {
    if (!TERMINAL_STATUSES.has(status)) return;
    fetch(`/api/design-pipelines/${runId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setRun({
            id: data.id,
            projectId: data.project_id,
            specificationId: data.specification_id,
            specVersionId: data.spec_version_id,
            status: data.status,
            currentStep: data.current_step,
            parentBranch: data.parent_branch,
            parentWorktreePath: data.parent_worktree_path,
            devServerPort: data.dev_server_port,
            variantCount: data.variant_count ?? 0,
            targetPath: data.target_path,
            errorMessage: data.error_message,
            createdAt: data.created_at,
            finishedAt: data.finished_at,
          });
        }
      })
      .catch(() => {});
  }, [status, runId]);

  // Tick timer for active step timings
  useEffect(() => {
    const hasActive = Object.values(stepTimings).some((t) => t.endedAt == null);
    if (!hasActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [stepTimings]);

  const isTerminal = TERMINAL_STATUSES.has(status);
  const isActive = !isTerminal && status !== "pending";
  const isAwaitingReview = status === "awaiting_review";

  // Merge live variant statuses with DB variants
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

  // Step state resolver for StepProgress
  const currentStepIdx = currentStep ? STEPS.findIndex((s) => s.key === currentStep) : -1;

  const getStepState = (key: string): StepState => {
    const idx = STEPS.findIndex((s) => s.key === key);
    if (status === "success") return "complete";
    if (status === "failed" || status === "cancelled") {
      if (idx < currentStepIdx) return "complete";
      if (idx === currentStepIdx) return status === "failed" ? "failed" : "complete";
      return "pending";
    }
    if (idx < currentStepIdx) return "complete";
    if (idx === currentStepIdx) return "active";
    return "pending";
  };

  const getStepTiming = (key: string) => {
    const t = stepTimings[key];
    if (!t) return undefined;
    return { startedAt: t.startedAt, endedAt: t.endedAt };
  };

  // Handlers
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

  // Build the log terminal title
  const activeStepTiming = filterStep !== "all" ? getStepTiming(filterStep) : undefined;
  const logTerminalTitle = [
    filterStep !== "all" ? STEPS.find((s) => s.key === filterStep)?.label ?? filterStep : "all steps",
    filterVariant !== "all" ? `v${filterVariant}` : null,
    activeStepTiming ? `-- ${formatStepDuration(activeStepTiming.startedAt, activeStepTiming.endedAt)}` : null,
  ].filter(Boolean).join(" ");

  return (
    <>
      <GlassCardStyles />
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in-up { opacity: 0; animation: fadeInUp 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        {/* ---- Sticky Header ---- */}
        <header className="sticky top-0 z-20 flex flex-wrap gap-3 items-center justify-between border-b border-white/[0.04] bg-zinc-950/80 px-4 md:px-8 py-4 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/pipelines")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-medium text-zinc-300">Design Pipeline</h1>
              <span className="text-[10px] text-purple-400/80 bg-purple-500/10 border border-purple-500/15 px-1.5 py-0.5 rounded font-medium">design</span>
              <span
                className="text-xs text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded"
                style={{ fontFamily: MONO }}
              >
                {runId.slice(0, 8)}
              </span>
              <StatusBadge status={statusToBadge(status)} label={statusLabel(status)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {devServerPort && isAwaitingReview && (
              <a
                href={`http://localhost:${devServerPort}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-zinc-300"
              >
                <span style={{ fontFamily: MONO }}>localhost:{devServerPort}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" /></svg>
              </a>
            )}
            {!isTerminal && !cancelling && (
              <button
                onClick={handleCancel}
                className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50"
              >
                Cancel
              </button>
            )}
            {cancelling && <span className="text-sm text-zinc-500">Cancelling...</span>}
          </div>
        </header>

        {/* ---- Dashboard Widgets ---- */}
        <div className="flex flex-col gap-4 px-4 md:px-8 py-6 shrink-0 fade-in-up" style={{ animationDelay: "80ms" }}>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            {/* Timing Widget */}
            <DesignTimingWidget run={run} isActive={isActive} />

            {/* Config Widget */}
            <InfoWidget label="Configuration">
              <div className="flex flex-col gap-4">
                <InfoWidgetRow
                  icon={<svg className="h-3.5 w-3.5 text-purple-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>}
                  label="Variants"
                  value={`${run?.variantCount ?? (displayVariants.length || "...")}`}
                  valueClassName="text-purple-400/80"
                />
                <InfoWidgetRow
                  icon={<svg className="h-3.5 w-3.5 text-cyan-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3m12-9a3 3 0 100-6 3 3 0 000 6zm0 0v3a3 3 0 01-3 3H9" /></svg>}
                  label="Parent Branch"
                  value={run?.parentBranch ?? "..."}
                  valueClassName="text-cyan-400/80"
                />
                <InfoWidgetRow
                  icon={<svg className="h-3.5 w-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
                  label="Target Path"
                  value={run?.targetPath ?? "..."}
                  valueClassName="text-zinc-300"
                />
              </div>
            </InfoWidget>

            {/* Status Widget */}
            <DesignStatusWidget status={status} />
          </div>

          {/* ---- Step Progress ---- */}
          <GlassCard variant="default" padding="md" className="fade-in-up" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center gap-4">
              <div className="flex-1 overflow-x-auto">
                <StepProgress
                  steps={STEPS.map((s) => ({ key: s.key, label: s.label, iconPath: s.iconPath }))}
                  getStepState={getStepState}
                  getStepTiming={getStepTiming}
                />
              </div>
            </div>
            {/* Live variant dots during generating step */}
            {currentStep === "generating" && liveVariants.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Variants</span>
                <div className="flex gap-2">
                  {liveVariants.map((v) => (
                    <div key={v.variantNumber} className="flex items-center gap-1.5">
                      <div
                        title={`v${v.variantNumber}: ${v.status}`}
                        className={`w-2 h-2 rounded-full ${VARIANT_STATUS_CONFIG[v.status]?.dot ?? "bg-zinc-600"}`}
                      />
                      <span className="text-[10px] text-zinc-500" style={{ fontFamily: MONO }}>v{v.variantNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ---- Variant Cards ---- */}
        {displayVariants.length > 0 && (
          <div className="px-4 md:px-8 mb-4 shrink-0 fade-in-up" style={{ animationDelay: "240ms" }}>
            <SectionHeader size="sm" spacing="tight" color="text-zinc-400">
              Variants
            </SectionHeader>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayVariants.map((v) => {
                const vcfg = VARIANT_STATUS_CONFIG[v.status];
                return (
                  <GlassCard key={v.id} variant="default" padding="md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-200">v{v.variantNumber}</span>
                      <StatusBadge status={vcfg.badge} label={vcfg.label} size="sm" />
                    </div>
                    {v.brief && (
                      <p className="text-[12px] text-zinc-500 line-clamp-2 leading-relaxed">{v.brief}</p>
                    )}
                    {isAwaitingReview && devServerPort && v.status === "merged" && (
                      <a
                        href={`http://localhost:${devServerPort}/design-preview/v${v.variantNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                        </svg>
                        Open preview
                      </a>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- Review & Finalize ---- */}
        {isAwaitingReview && (
          <div className="px-4 md:px-8 mb-4 shrink-0 fade-in-up" style={{ animationDelay: "320ms" }}>
            <GlassCard variant="default" padding="lg" className="border-purple-500/[0.15] bg-purple-500/[0.04]">
              <div className="flex items-center gap-3 mb-4">
                <IconCircle color="purple" size="sm">
                  <svg className="h-3.5 w-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </IconCircle>
                <SectionHeader size="sm" spacing="none" color="text-purple-300">
                  Review & Finalize
                </SectionHeader>
              </div>
              <p className="text-[13px] text-zinc-400 mb-4 leading-relaxed">
                {devServerPort ? (
                  <>
                    Dev server running at{" "}
                    <a
                      href={`http://localhost:${devServerPort}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 underline decoration-purple-500/30 underline-offset-2 transition-colors"
                    >
                      localhost:{devServerPort}
                    </a>
                    . Review the variants above, then tell the agent what to do.
                  </>
                ) : (
                  "Dev server is not available. Review the generated code in the worktree, then tell the agent what to do."
                )}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={finalizeMessage}
                  onChange={(e) => setFinalizeMessage(e.target.value)}
                  placeholder='e.g., "Use v2" or "Mix v1 header with v3 layout"'
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                  onKeyDown={(e) => { if (e.key === "Enter") handleFinalize(); }}
                />
                <button
                  onClick={handleFinalize}
                  disabled={!finalizeMessage.trim() || finalizing}
                  className="rounded-lg bg-purple-600/20 border border-purple-500/30 px-6 py-2.5 text-sm font-medium text-purple-300 transition-all hover:bg-purple-600/30 hover:border-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {finalizing ? "Sending..." : "Finalize"}
                </button>
              </div>
            </GlassCard>
          </div>
        )}

        {/* ---- Error Message ---- */}
        {run?.errorMessage && (status === "failed" || status === "cancelled") && (
          <div className="px-4 md:px-8 mb-4 shrink-0 fade-in-up">
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-5 py-3">
              <p className="text-sm text-red-400">{run.errorMessage}</p>
            </div>
          </div>
        )}

        {/* ---- Log Terminal ---- */}
        <div className="flex flex-1 flex-col overflow-hidden mx-4 md:mx-8 mb-6 fade-in-up" style={{ animationDelay: "400ms" }}>
          <LogTerminal
            title={logTerminalTitle}
            lineCount={filteredLogs.length}
            scrollDep={filteredLogs.length}
            emptyMessage={logs.length === 0 ? "Waiting for logs..." : "No logs match the current filters."}
            headerRight={
              <div className="flex items-center gap-2">
                <select
                  value={filterStep}
                  onChange={(e) => setFilterStep(e.target.value as DesignPipelineStep | "all")}
                  className="text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-zinc-300 outline-none cursor-pointer hover:bg-white/[0.06] transition-colors"
                  style={{ fontFamily: MONO }}
                >
                  <option value="all">All steps</option>
                  {STEPS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                {displayVariants.length > 0 && (
                  <select
                    value={filterVariant}
                    onChange={(e) => setFilterVariant(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                    className="text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-zinc-300 outline-none cursor-pointer hover:bg-white/[0.06] transition-colors"
                    style={{ fontFamily: MONO }}
                  >
                    <option value="all">All variants</option>
                    {displayVariants.map((v) => (
                      <option key={v.variantNumber} value={v.variantNumber}>v{v.variantNumber}</option>
                    ))}
                  </select>
                )}
              </div>
            }
          >
            {filteredLogs.map((log, idx) => (
              <DesignLogLine key={idx} log={log} />
            ))}
          </LogTerminal>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Design Log Line                                                    */
/* ------------------------------------------------------------------ */

function DesignLogLine({ log }: { log: DesignPipelineLogEntry }) {
  const isError = log.stream === "stderr";
  const isToolStart = log.toolCallId?.endsWith("-start");
  const isToolEnd = log.toolCallId?.endsWith("-end");
  const isThinking = log.toolCallId?.startsWith("thinking-");

  if (isThinking) return null;

  const variant = isError
    ? "error" as const
    : isToolStart
    ? "tool" as const
    : isToolEnd
    ? "tool-done" as const
    : "default" as const;

  return (
    <LogTerminal.Line timestamp={log.timestamp} variant={variant}>
      {log.variantNumber != null && (
        <span className="text-purple-400 mr-2 select-none">v{log.variantNumber}</span>
      )}
      {log.text}
    </LogTerminal.Line>
  );
}
