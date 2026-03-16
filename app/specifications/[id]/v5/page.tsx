"use client";

import { useState, useEffect, useRef, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarkdownEditor } from "../../../components/MarkdownEditor";
import { AgentChat } from "../../../components/AgentChat";
import { VersionHistory } from "../../../components/VersionHistory";
import { PipelineTriggerButton } from "../../../components/PipelineTriggerButton";
import { DesignPipelineTriggerButton } from "../../../components/DesignPipelineTriggerButton";
import { useSpecificationStore } from "../../../hooks/useSpecificationStore";
import { usePipelineStore } from "../../../hooks/usePipelineStore";
import { useDesignPipelineStore } from "../../../hooks/useDesignPipelineStore";
import { useProjectContext } from "../../../components/ProjectContext";
import type { SpecificationStatus } from "../../../specifications";

/* ------------------------------------------------------------------ */
/*  Keyframe animations                                                */
/* ------------------------------------------------------------------ */

const zenKeyframes = `
@keyframes zenFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes zenSlideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes zenSlideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
@keyframes zenToast {
  0% { opacity: 0; transform: translateY(8px); }
  15% { opacity: 1; transform: translateY(0); }
  85% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-4px); }
}
@keyframes zenBreadcrumbFade {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes zenOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes zenPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes zenShortcutsFade {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
`;

/* ------------------------------------------------------------------ */
/*  Status dot color                                                    */
/* ------------------------------------------------------------------ */

function statusDotColor(status: SpecificationStatus): string {
  switch (status) {
    case "draft": return "bg-emerald-400";
    case "pipeline": return "bg-blue-400 animate-pulse";
    case "failed": return "bg-red-400";
    case "cancelled": return "bg-amber-400";
    case "done": return "bg-emerald-400";
  }
}

function statusLabel(status: SpecificationStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function SpecV5Page({ params }: { params: Promise<{ id: string }> }) {
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

  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  /* ---------- Core state ---------- */
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);

  /* ---------- Panel state ---------- */
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [metaVisible, setMetaVisible] = useState(false);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);
  const [pipelineConfirm, setPipelineConfirm] = useState(false);

  /* ---------- Toast state ---------- */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- Breadcrumb auto-hide ---------- */
  const [breadcrumbVisible, setBreadcrumbVisible] = useState(true);
  const breadcrumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);
  const hasPipelineActive = hasActiveRun(id) || hasActiveDesignRun(id);

  /* ---------- Load initial content ---------- */
  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  /* ---------- Track dirty state ---------- */
  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  /* ---------- Breadcrumb auto-hide ---------- */
  useEffect(() => {
    breadcrumbTimerRef.current = setTimeout(() => {
      setBreadcrumbVisible(false);
    }, 2000);
    return () => {
      if (breadcrumbTimerRef.current) clearTimeout(breadcrumbTimerRef.current);
    };
  }, []);

  /* ---------- Mouse near top to show breadcrumb ---------- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.clientY < 60) {
        setBreadcrumbVisible(true);
        if (breadcrumbTimerRef.current) clearTimeout(breadcrumbTimerRef.current);
        breadcrumbTimerRef.current = setTimeout(() => {
          setBreadcrumbVisible(false);
        }, 2000);
      }
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  /* ---------- Show toast ---------- */
  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 1800);
  };

  /* ---------- Save handler ---------- */
  const handleSave = async () => {
    if (!spec || !editable || saving) return;
    setSaving(true);
    try {
      if (title !== spec.title) await updateTitle(id, title);
      await saveVersion(id, content, undefined);
      initialContentRef.current = content;
      setHasChanges(false);
      showToast("Saved");
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

  /* ---------- Pipeline trigger ---------- */
  const handlePipelineTrigger = () => {
    setPipelineConfirm(true);
  };

  /* ---------- Any panel open? ---------- */
  const anyPanelOpen = chatOpen || historyOpen;

  /* ---------- Keyboard handler ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Esc always works
      if (e.key === "Escape") {
        if (shortcutsVisible) {
          setShortcutsVisible(false);
          e.preventDefault();
          return;
        }
        if (pipelineConfirm) {
          setPipelineConfirm(false);
          e.preventDefault();
          return;
        }
        if (chatOpen) {
          setChatOpen(false);
          e.preventDefault();
          return;
        }
        if (historyOpen) {
          setHistoryOpen(false);
          e.preventDefault();
          return;
        }
        // Nothing open -> go back
        router.push("/specifications");
        e.preventDefault();
        return;
      }

      // Don't intercept typing in inputs (except Esc above)
      if (isInput) return;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShortcutsVisible((v) => !v);
          break;
        case "s":
          e.preventDefault();
          handleSave();
          break;
        case "h":
          e.preventDefault();
          setHistoryOpen((v) => !v);
          if (!historyOpen) setChatOpen(false);
          break;
        case "c":
          e.preventDefault();
          setChatOpen((v) => !v);
          if (!chatOpen) setHistoryOpen(false);
          break;
        case "p":
          e.preventDefault();
          if (editable && !hasPipelineActive) handlePipelineTrigger();
          break;
        case "m":
          e.preventDefault();
          setMetaVisible((v) => !v);
          break;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [chatOpen, historyOpen, shortcutsVisible, pipelineConfirm, editable, hasPipelineActive, saving, content, title, spec]);

  /* ================================================================ */
  /*  LOADING STATE                                                    */
  /* ================================================================ */
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <style>{zenKeyframes}</style>
        <div className="h-6 w-6 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin" />
      </div>
    );
  }

  /* ================================================================ */
  /*  NOT FOUND STATE                                                  */
  /* ================================================================ */
  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950">
        <style>{zenKeyframes}</style>
        <p className="text-lg font-light tracking-wide text-zinc-400">Specification not found</p>
        <p className="text-sm text-zinc-600">It may have been deleted or moved.</p>
        <button
          onClick={() => router.push("/specifications")}
          className="mt-2 text-sm text-zinc-500 underline underline-offset-4 decoration-zinc-700 hover:text-zinc-300 hover:decoration-zinc-500 transition-colors"
        >
          Back to specifications
        </button>
      </div>
    );
  }

  /* ================================================================ */
  /*  Status dot for top-right indicator                               */
  /* ================================================================ */
  const indicatorColor = hasPipelineActive
    ? "bg-blue-400"
    : hasChanges
      ? "bg-amber-400"
      : "bg-emerald-400";

  const indicatorPulse = hasPipelineActive ? "animate-pulse" : "";

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="relative flex h-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <style>{zenKeyframes}</style>

      {/* ============================================================ */}
      {/*  STATUS DOT — top-right corner                               */}
      {/* ============================================================ */}
      <div className="absolute top-4 right-4 z-50">
        <div className={`h-2.5 w-2.5 rounded-full ${indicatorColor} ${indicatorPulse} shadow-lg`}
          title={hasPipelineActive ? "Pipeline running" : hasChanges ? "Unsaved changes" : "Saved"}
        />
      </div>

      {/* ============================================================ */}
      {/*  FLOATING BREADCRUMB — auto-hides                            */}
      {/* ============================================================ */}
      <div
        className="absolute top-3 left-4 z-40 transition-opacity duration-500"
        style={{ opacity: breadcrumbVisible ? 1 : 0, pointerEvents: breadcrumbVisible ? "auto" : "none" }}
      >
        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            onClick={() => router.push("/specifications")}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Specifications
          </button>
          <span className="text-zinc-800">/</span>
          <span className="text-zinc-500 truncate max-w-[200px]">{spec.title}</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  MAIN WRITING AREA                                           */}
      {/* ============================================================ */}
      <div
        className="flex flex-1 flex-col min-h-0 overflow-auto"
        style={{ animation: "zenFadeIn 0.6s ease-out" }}
      >
        <div className="mx-auto w-full max-w-3xl px-8 pt-14 pb-4 flex flex-col flex-1 min-h-0">
          {/* Title input */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!editable}
            className={`
              w-full bg-transparent text-3xl font-light tracking-tight text-zinc-100
              outline-none placeholder:text-zinc-700 caret-violet-400
              border-b border-transparent focus:border-zinc-800
              transition-colors duration-300 pb-3 mb-1
              ${!editable ? "cursor-default" : ""}
            `}
            placeholder="Untitled Specification"
          />

          {/* Metadata bar — toggled with 'm' */}
          {metaVisible && (
            <div
              className="flex items-center gap-3 py-2 mb-2 text-xs text-zinc-600"
              style={{ animation: "zenFadeIn 0.2s ease-out" }}
            >
              <span className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotColor(spec.status)}`} />
                {statusLabel(spec.status)}
              </span>
              <span className="text-zinc-800">|</span>
              <span className="text-zinc-600">
                {spec.type === "ui-refactor" ? "UI Refactor" : "Feature"}
              </span>
              <span className="text-zinc-800">|</span>
              {latestVersion && (
                <>
                  <span className="font-mono text-zinc-600">v{latestVersion.versionNumber}</span>
                  <span className="text-zinc-800">|</span>
                </>
              )}
              <span className="text-zinc-600">
                {new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              {(spec.status === "failed" || spec.status === "cancelled") && editable && (
                <>
                  <span className="text-zinc-800">|</span>
                  <button
                    onClick={() => updateStatus(id, "draft")}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-zinc-700"
                  >
                    Reset to Draft
                  </button>
                </>
              )}
            </div>
          )}

          {/* Version preview banner */}
          {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
            <div
              className="flex items-center gap-3 py-2 mb-2 text-xs"
              style={{ animation: "zenFadeIn 0.2s ease-out" }}
            >
              <span className="text-blue-400/80">
                Viewing v{viewingVersion.versionNumber}
              </span>
              <button
                onClick={() => setViewingVersion(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2 decoration-zinc-700"
              >
                Back to current
              </button>
            </div>
          )}

          {/* Read-only notice */}
          {!editable && !viewingVersion && (
            <div
              className="flex items-center gap-2 py-2 mb-2 text-xs text-zinc-600"
              style={{ animation: "zenFadeIn 0.2s ease-out" }}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span>Read-only -- {statusLabel(spec.status)}</span>
            </div>
          )}

          {/* Editor — fills remaining space */}
          <div className="flex-1 min-h-0">
            <MarkdownEditor
              value={viewingVersion ? viewingVersion.content : content}
              onChange={editable && !viewingVersion ? setContent : () => {}}
              placeholder="Begin writing your specification..."
              viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
            />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  BOTTOM HINTS BAR — nearly invisible, brightens on hover     */}
      {/* ============================================================ */}
      <div className="relative z-10 border-t border-white/[0.03] px-4 py-1.5 text-zinc-800 hover:text-zinc-600 transition-colors duration-500 flex items-center justify-center gap-4 text-[10px] select-none group">
        <span><kbd className="font-mono">?</kbd> shortcuts</span>
        <span><kbd className="font-mono">s</kbd> save</span>
        <span><kbd className="font-mono">h</kbd> history</span>
        <span><kbd className="font-mono">c</kbd> chat</span>
        <span><kbd className="font-mono">p</kbd> pipeline</span>
        <span><kbd className="font-mono">m</kbd> metadata</span>
        <span><kbd className="font-mono">Esc</kbd> back</span>
      </div>

      {/* ============================================================ */}
      {/*  TOAST NOTIFICATION                                          */}
      {/* ============================================================ */}
      {toast && (
        <div
          className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full bg-zinc-800/90 backdrop-blur-xl border border-white/[0.08] text-sm text-zinc-200 shadow-2xl"
          style={{ animation: "zenToast 1.8s ease-out forwards" }}
        >
          {toast}
        </div>
      )}

      {/* ============================================================ */}
      {/*  KEYBOARD SHORTCUTS OVERLAY — toggled with ?                 */}
      {/* ============================================================ */}
      {shortcutsVisible && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "zenOverlayIn 0.15s ease-out" }}
            onClick={() => setShortcutsVisible(false)}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px]"
            style={{ animation: "zenShortcutsFade 0.2s ease-out" }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-4">Keyboard Shortcuts</h2>
              <div className="space-y-2.5">
                {[
                  ["s", "Save specification"],
                  ["h", "Toggle version history"],
                  ["c", "Toggle AI chat"],
                  ["p", "Trigger pipeline"],
                  ["m", "Toggle metadata"],
                  ["?", "Toggle this overlay"],
                  ["Esc", "Close panel / Go back"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-[13px] text-zinc-400">{desc}</span>
                    <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 text-[11px] font-mono text-zinc-400 bg-white/[0.05] border border-white/[0.08] rounded-md">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-3 border-t border-white/[0.06] text-center">
                <span className="text-[11px] text-zinc-600">Press <kbd className="font-mono text-zinc-500">?</kbd> or <kbd className="font-mono text-zinc-500">Esc</kbd> to close</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/*  PIPELINE CONFIRMATION OVERLAY                               */}
      {/* ============================================================ */}
      {pipelineConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "zenOverlayIn 0.15s ease-out" }}
            onClick={() => setPipelineConfirm(false)}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px]"
            style={{ animation: "zenShortcutsFade 0.2s ease-out" }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Trigger Pipeline</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                This will start the {spec.type === "ui-refactor" ? "design" : "feature"} pipeline for this specification. Continue?
              </p>
              <div className="flex items-center gap-2">
                {spec.type === "feature" && activeProject && (
                  <PipelineTriggerButton
                    specificationId={id}
                    specVersionId={latestVersion?.id ?? null}
                    specContent={content}
                    specTitle={title}
                    threshold={activeProject.pipelineThreshold}
                    maxRetries={activeProject.maxRetries}
                    hasActiveRun={hasActiveRun(id)}
                    activeRunId={getActiveRunId(id)}
                    onTrigger={async (...args) => {
                      const result = await triggerPipeline(...args);
                      setPipelineConfirm(false);
                      showToast("Pipeline triggered");
                      return result;
                    }}
                  />
                )}
                {spec.type === "ui-refactor" && activeProject && (
                  <DesignPipelineTriggerButton
                    specificationId={id}
                    specVersionId={latestVersion?.id ?? null}
                    specContent={content}
                    specTitle={title}
                    hasActiveRun={hasActiveDesignRun(id)}
                    activeRunId={getActiveDesignRunId(id)}
                    onTrigger={async (...args) => {
                      const result = await triggerDesignPipeline(...args);
                      setPipelineConfirm(false);
                      showToast("Design pipeline triggered");
                      return result;
                    }}
                  />
                )}
                <button
                  onClick={() => setPipelineConfirm(false)}
                  className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/*  SLIDE-IN PANELS                                             */}
      {/* ============================================================ */}

      {/* Backdrop */}
      {anyPanelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
          style={{ animation: "zenOverlayIn 0.2s ease-out" }}
          onClick={() => {
            setChatOpen(false);
            setHistoryOpen(false);
          }}
        />
      )}

      {/* History panel */}
      {historyOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 w-[520px] max-w-[90vw]"
          style={{ animation: "zenSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <div className="flex h-full flex-col bg-zinc-950/90 backdrop-blur-2xl border-l border-white/[0.06]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="text-sm font-medium text-zinc-300">Version History</span>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
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

      {/* Chat panel */}
      {chatOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 w-[440px] max-w-[90vw]"
          style={{ animation: "zenSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <div className="flex h-full flex-col bg-zinc-950/90 backdrop-blur-2xl border-l border-white/[0.06]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="text-sm font-medium text-zinc-300">AI Assistant</span>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
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
