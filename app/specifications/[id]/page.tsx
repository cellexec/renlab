"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { AgentChat } from "../../components/AgentChat";
import { VersionHistory } from "../../components/VersionHistory";
import { PipelineTriggerButton } from "../../components/PipelineTriggerButton";
import { DesignPipelineTriggerButton } from "../../components/DesignPipelineTriggerButton";
import { useSpecificationStore } from "../../hooks/useSpecificationStore";
import { usePipelineStore } from "../../hooks/usePipelineStore";
import { useDesignPipelineStore } from "../../hooks/useDesignPipelineStore";
import { useProjectContext } from "../../components/ProjectContext";
import type { SpecificationStatus } from "../../specifications";

/* ------------------------------------------------------------------ */
/*  Status pill styles — glass morphism variant                        */
/* ------------------------------------------------------------------ */

const STATUS_BADGE: Record<SpecificationStatus, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-zinc-400/10 text-zinc-400 border-white/[0.08]" },
  pipeline:  { label: "Pipeline",  cls: "bg-blue-400/10 text-blue-300 border-blue-400/20 animate-pulse" },
  failed:    { label: "Failed",    cls: "bg-red-400/10 text-red-300 border-red-400/20" },
  cancelled: { label: "Cancelled", cls: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20" },
  done:      { label: "Done",      cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" },
};

/* ------------------------------------------------------------------ */
/*  Ambient animated gradient orbs (CSS keyframes via inline style)    */
/* ------------------------------------------------------------------ */

const ambientKeyframes = `
@keyframes orbFloat1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -40px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}
@keyframes orbFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-40px, 30px) scale(1.05); }
  66% { transform: translate(20px, -30px) scale(0.9); }
}
@keyframes orbFloat3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(25px, 25px) scale(1.08); }
  66% { transform: translate(-35px, -15px) scale(0.92); }
}
@keyframes slideOverlayIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOverlayOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes floatBarIn {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
@keyframes versionBannerIn {
  from { transform: translateY(-4px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
`;

/* ------------------------------------------------------------------ */
/*  Glass card component                                               */
/* ------------------------------------------------------------------ */

function GlassCard({
  children,
  className = "",
  innerGlow = false,
}: {
  children: React.ReactNode;
  className?: string;
  innerGlow?: boolean;
}) {
  return (
    <div
      className={`
        relative rounded-2xl border border-white/[0.08]
        bg-white/[0.04] backdrop-blur-xl
        shadow-2xl
        ${innerGlow ? "shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),inset_0_0_40px_rgba(255,255,255,0.02)]" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function EditSpecificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { activeProject, activeProjectId } = useProjectContext();

  const {
    specifications,
    loaded,
    getLatestVersion,
    getVersions,
    saveVersion,
    updateTitle,
    isEditable,
    updateStatus,
  } = useSpecificationStore(activeProjectId);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);
  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);

  // Load initial content once
  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  // Track dirty state
  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  const handleSave = async () => {
    if (!spec || !editable) return;
    setSaving(true);
    try {
      if (title !== spec.title) await updateTitle(id, title);
      await saveVersion(id, content, undefined);
      initialContentRef.current = content;
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleApplySpec = (specContent: string) => {
    if (editable) setContent(specContent);
  };

  const handleRestore = (restoredContent: string) => {
    if (editable) setContent(restoredContent);
  };

  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

  /* ---------- Loading state ---------- */
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <style>{ambientKeyframes}</style>
        <div className="relative">
          <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
        </div>
      </div>
    );
  }

  /* ---------- Not found state ---------- */
  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-500">
        <style>{ambientKeyframes}</style>
        <div className="text-center">
          <p className="text-lg font-light tracking-wide text-zinc-400">Specification not found</p>
          <p className="mt-1 text-sm text-zinc-600">It may have been deleted or moved.</p>
        </div>
        <button
          onClick={() => router.push("/specifications")}
          className="rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl px-6 py-2.5 text-sm text-zinc-300 transition-all hover:bg-white/[0.08] hover:border-white/[0.15]"
        >
          Back to Specifications
        </button>
      </div>
    );
  }

  const panelOpen = chatOpen || historyOpen;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <style>{ambientKeyframes}</style>

      {/* ============================================================= */}
      {/*  AMBIENT BACKGROUND ORBS                                       */}
      {/* ============================================================= */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.8) 0%, transparent 70%)",
            animation: "orbFloat1 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/3 -right-24 h-[400px] w-[400px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, rgba(59,130,246,0.8) 0%, transparent 70%)",
            animation: "orbFloat2 25s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -bottom-20 left-1/3 h-[450px] w-[450px] rounded-full opacity-[0.04]"
          style={{
            background: "radial-gradient(circle, rgba(16,185,129,0.8) 0%, transparent 70%)",
            animation: "orbFloat3 22s ease-in-out infinite",
          }}
        />
      </div>

      {/* ============================================================= */}
      {/*  BREADCRUMB — minimal glass pill at very top                   */}
      {/* ============================================================= */}
      <div className="relative z-10 px-8 pt-5 pb-0">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] backdrop-blur-md px-3 py-1">
          <button
            onClick={() => router.push("/specifications")}
            className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Specifications
          </button>
          <span className="text-[10px] text-zinc-700">/</span>
          <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">{spec.title}</span>
        </div>
      </div>

      {/* ============================================================= */}
      {/*  HERO HEADER — editorial magazine cover feel                   */}
      {/* ============================================================= */}
      <div className="relative z-10 px-8 pt-5 pb-6">
        <div
          className="relative overflow-hidden rounded-2xl border border-white/[0.06] p-8"
          style={{
            background: [
              "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(139,92,246,0.12) 0%, transparent 60%)",
              "radial-gradient(ellipse 60% 50% at 70% 60%, rgba(59,130,246,0.08) 0%, transparent 60%)",
              "radial-gradient(ellipse 50% 40% at 50% 80%, rgba(16,185,129,0.06) 0%, transparent 60%)",
              "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)",
            ].join(", "),
            backdropFilter: "blur(40px)",
          }}
        >
          {/* Subtle top border highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

          <div className="flex items-start justify-between gap-8">
            <div className="flex-1 min-w-0">
              {/* Title — editorial display */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                readOnly={!editable}
                className={`
                  w-full bg-transparent text-4xl font-light tracking-tight text-zinc-100
                  outline-none placeholder:text-zinc-700 caret-violet-400
                  ${!editable ? "cursor-default" : ""}
                `}
                placeholder="Untitled Specification"
              />

              {/* Meta row */}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {/* Status pill — floating glass */}
                <span
                  className={`
                    inline-flex items-center gap-1.5 rounded-full border
                    backdrop-blur-md px-3 py-1 text-xs font-medium
                    ${STATUS_BADGE[spec.status].cls}
                  `}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      spec.status === "draft" ? "bg-zinc-400" :
                      spec.status === "pipeline" ? "bg-blue-400" :
                      spec.status === "failed" ? "bg-red-400" :
                      spec.status === "cancelled" ? "bg-yellow-400" :
                      "bg-emerald-400"
                    }`}
                  />
                  {STATUS_BADGE[spec.status].label}
                </span>

                {/* Version badge */}
                {latestVersion && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.03] backdrop-blur-md px-2.5 py-1 text-xs text-zinc-500">
                    v{latestVersion.versionNumber}
                  </span>
                )}

                {/* Last saved */}
                <span className="text-xs text-zinc-600 font-light">
                  Saved {new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>

                {/* Unsaved indicator */}
                {hasChanges && editable && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400/80">
                    <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                    Unsaved
                  </span>
                )}

                {/* Pipeline link */}
                {activeRunId && (
                  <Link
                    href={`/pipelines/${activeRunId}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/10 backdrop-blur-md px-3 py-1 text-xs font-medium text-blue-300 transition-all hover:bg-blue-400/20 hover:border-blue-400/30"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    View Pipeline
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                    </svg>
                  </Link>
                )}

                {/* Design pipeline link */}
                {activeDesignRunId && (
                  <Link
                    href={`/design-pipelines/${activeDesignRunId}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/20 bg-purple-400/10 backdrop-blur-md px-3 py-1 text-xs font-medium text-purple-300 transition-all hover:bg-purple-400/20 hover:border-purple-400/30"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                    View Design Pipeline
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>

            {/* Reset to draft for failed/cancelled */}
            {(spec.status === "failed" || spec.status === "cancelled") && (
              <button
                type="button"
                onClick={() => updateStatus(id, "draft")}
                className="
                  shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04]
                  backdrop-blur-md px-4 py-2 text-xs text-zinc-400
                  transition-all hover:bg-white/[0.08] hover:border-white/[0.12] hover:text-zinc-300
                "
              >
                Reset to Draft
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/*  EDITOR — inside a glass card with inner glow                  */}
      {/* ============================================================= */}
      <div className="relative z-10 flex flex-1 min-h-0 px-8 pb-24">
        <GlassCard className="flex flex-1 flex-col min-h-0 overflow-hidden" innerGlow>
          {/* Version preview banner — shown when viewing an older version (not the latest) */}
          {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
            <div
              className="flex items-center gap-3 border-b border-blue-400/20 px-4 py-2.5 bg-blue-400/10 backdrop-blur-md"
              style={{ animation: "versionBannerIn 0.25s ease-out" }}
            >
              <svg className="h-3.5 w-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-blue-300 font-medium">
                Viewing v{viewingVersion.versionNumber}
              </span>
              <button
                onClick={() => setViewingVersion(null)}
                className="
                  ml-auto inline-flex items-center gap-1.5 rounded-full
                  border border-blue-400/20 bg-blue-400/10
                  px-3 py-1 text-xs text-blue-300
                  transition-all hover:bg-blue-400/20 hover:border-blue-400/30
                "
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Back to current
              </button>
            </div>
          )}

          {/* Read-only banner for non-editable specs (only when NOT viewing a version) */}
          {!editable && !viewingVersion && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 bg-white/[0.02]">
              <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-xs text-zinc-500">
                Read-only — this specification is <span className="text-zinc-400 font-medium">{spec.status}</span>
                {(spec.status === "failed" || spec.status === "cancelled") && ". Use \"Reset to Draft\" to unlock editing."}
              </span>
            </div>
          )}

          {/* Editor content */}
          <div className="flex flex-1 flex-col min-h-0 p-1">
            <MarkdownEditor
              value={viewingVersion ? viewingVersion.content : content}
              onChange={editable && !viewingVersion ? setContent : () => {}}
              placeholder="Begin writing your specification..."
              viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
            />
          </div>
        </GlassCard>
      </div>

      {/* ============================================================= */}
      {/*  FLOATING ACTION BAR — glass pill hovering at bottom center    */}
      {/* ============================================================= */}
      <div
        className="fixed bottom-6 left-1/2 z-40"
        style={{ animation: "floatBarIn 0.5s ease-out forwards" }}
      >
        <div
          className="
            flex items-center gap-1 rounded-full border border-white/[0.1]
            bg-zinc-900/70 backdrop-blur-2xl
            shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.03)]
            px-2 py-1.5
          "
        >
          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges || !editable}
            className={`
              relative flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium
              transition-all duration-200
              ${hasChanges && editable
                ? "bg-violet-500/20 text-violet-300 border border-violet-400/20 hover:bg-violet-500/30"
                : "text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.04]"
              }
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {hasChanges && editable && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            )}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            {saving ? "Saving..." : "Save"}
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-white/[0.06]" />

          {/* History button — always visible */}
          <button
            type="button"
            onClick={() => {
              setHistoryOpen((v) => !v);
              if (!historyOpen) setChatOpen(false);
            }}
            className={`
              flex items-center gap-2 rounded-full px-4 py-2 text-sm
              transition-all duration-200
              ${historyOpen
                ? "bg-amber-500/15 text-amber-300 border border-amber-400/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
              }
            `}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>

          {/* Chat button — always visible */}
          <button
            type="button"
            onClick={() => {
              setChatOpen((v) => !v);
              if (!chatOpen) setHistoryOpen(false);
            }}
            className={`
              flex items-center gap-2 rounded-full px-4 py-2 text-sm
              transition-all duration-200
              ${chatOpen
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
              }
            `}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            AI Chat
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-white/[0.06]" />

          {/* Pipeline trigger — conditional on spec type */}
          {activeProject && editable && spec.type === "feature" && (
            <div className="flex items-center">
              <PipelineTriggerButton
                specificationId={id}
                specVersionId={latestVersion?.id ?? null}
                specContent={content}
                specTitle={title}
                threshold={activeProject.pipelineThreshold}
                maxRetries={activeProject.maxRetries}
                hasActiveRun={hasActiveRun(id)}
                activeRunId={getActiveRunId(id)}
                onTrigger={triggerPipeline}
              />
            </div>
          )}
          {activeProject && editable && spec.type === "ui-refactor" && (
            <div className="flex items-center">
              <DesignPipelineTriggerButton
                specificationId={id}
                specVersionId={latestVersion?.id ?? null}
                specContent={content}
                specTitle={title}
                hasActiveRun={hasActiveDesignRun(id)}
                activeRunId={getActiveDesignRunId(id)}
                onTrigger={triggerDesignPipeline}
              />
            </div>
          )}
        </div>
      </div>

      {/* ============================================================= */}
      {/*  OVERLAY PANELS — slide in from right, overlapping editor      */}
      {/* ============================================================= */}

      {/* Backdrop dim */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
          style={{ animation: "fadeIn 0.2s ease-out" }}
          onClick={() => {
            setChatOpen(false);
            setHistoryOpen(false);
          }}
        />
      )}

      {/* History overlay panel */}
      {historyOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 w-[560px]"
          style={{ animation: "slideOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <div className="flex h-full flex-col border-l border-white/[0.06] bg-zinc-950/80 backdrop-blur-2xl">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">Version History</span>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <VersionHistory
              versions={versions}
              onRestore={(restoredContent) => {
                handleRestore(restoredContent);
                setViewingVersion(null);
                setHistoryOpen(false);
              }}
              onView={(versionContent, versionNumber) => {
                setViewingVersion({ content: versionContent, versionNumber });
              }}
              canRestore={editable}
              viewingVersionNumber={viewingVersion?.versionNumber ?? null}
              className="flex-1"
            />
          </div>
        </div>
      )}

      {/* Chat overlay panel */}
      {chatOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 w-[440px]"
          style={{ animation: "slideOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <div className="flex h-full flex-col border-l border-white/[0.06] bg-zinc-950/80 backdrop-blur-2xl">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">AI Assistant</span>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AgentChat
              agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
              context={content}
              onApplySpec={(specContent) => {
                handleApplySpec(specContent);
                setChatOpen(false);
              }}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
