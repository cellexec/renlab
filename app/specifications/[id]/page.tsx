"use client";

import { useState, useEffect, useRef, use, useMemo, useCallback } from "react";
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
/*  Keyframe animations                                                */
/* ------------------------------------------------------------------ */

const keyframes = `
@keyframes dashOverlayIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes modalIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes hintBarIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

/* ------------------------------------------------------------------ */
/*  Status badge config                                                */
/* ------------------------------------------------------------------ */

const STATUS_BADGE: Record<SpecificationStatus, { label: string; cls: string; dot: string }> = {
  draft:     { label: "Draft",     cls: "bg-zinc-400/10 text-zinc-400 border-white/[0.08]", dot: "bg-zinc-400" },
  pipeline:  { label: "Pipeline",  cls: "bg-blue-400/10 text-blue-300 border-blue-400/20 animate-pulse", dot: "bg-blue-400" },
  failed:    { label: "Failed",    cls: "bg-red-400/10 text-red-300 border-red-400/20", dot: "bg-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20", dot: "bg-yellow-400" },
  done:      { label: "Done",      cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20", dot: "bg-emerald-400" },
};

/* ------------------------------------------------------------------ */
/*  Heading extraction from markdown                                   */
/* ------------------------------------------------------------------ */

interface HeadingEntry {
  level: number;
  text: string;
  line: number;
  id: string;
}

function extractHeadings(markdown: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const slugCounts = new Map<string, number>();
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const text = match[2].replace(/[*_`~\[\]]/g, "");
      let slug = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      headings.push({ level: match[1].length, text, line: i, id: slug });
    }
  }
  return headings;
}

/* ------------------------------------------------------------------ */
/*  Outline item type (metadata fields + headings)                     */
/* ------------------------------------------------------------------ */

interface OutlineItem {
  type: "heading";
  label: string;
  value: string;
  headingId?: string;
  headingLevel?: number;
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

  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  // --- Core state ---
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);

  // --- UI state ---
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [outlineIndex, setOutlineIndex] = useState(0);
  const [outlineSearch, setOutlineSearch] = useState("");
  const [outlineSearchFocused, setOutlineSearchFocused] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState<"chat" | "history" | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editorViewOnly, setEditorViewOnly] = useState(true);
  const [pipelineConfirm, setPipelineConfirm] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  // --- Refs ---
  const outlineSearchRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const outlineScrollRef = useRef<HTMLDivElement>(null);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

  // --- Load initial content once ---
  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  // --- Track dirty state ---
  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  // --- Extract headings from content ---
  const headings = useMemo(() => extractHeadings(viewingVersion ? viewingVersion.content : content), [content, viewingVersion]);

  // --- Build outline items (headings only — metadata is static) ---
  const outlineItems: OutlineItem[] = useMemo(() => {
    return headings.map((h) => ({
      type: "heading" as const,
      label: h.text,
      value: `H${h.level}`,
      headingId: h.id,
      headingLevel: h.level,
    }));
  }, [headings]);

  // --- Filtered outline for search ---
  const filteredOutline = useMemo(() => {
    if (!outlineSearch.trim()) return outlineItems;
    const q = outlineSearch.toLowerCase();
    return outlineItems.filter((item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q));
  }, [outlineItems, outlineSearch]);

  // --- Clamp outline index ---
  useEffect(() => {
    if (outlineIndex >= filteredOutline.length) {
      setOutlineIndex(Math.max(0, filteredOutline.length - 1));
    }
  }, [filteredOutline.length, outlineIndex]);

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    if (!spec || !editable || saving) return;
    setSaving(true);
    try {
      if (title !== spec.title) await updateTitle(id, title);
      await saveVersion(id, content, undefined);
      initialContentRef.current = content;
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  }, [spec, editable, saving, title, id, content, updateTitle, saveVersion]);

  // --- Apply spec from chat ---
  const handleApplySpec = useCallback((specContent: string) => {
    if (editable) setContent(specContent);
  }, [editable]);

  // --- Restore version ---
  const handleRestore = useCallback((restoredContent: string) => {
    if (editable) setContent(restoredContent);
  }, [editable]);

  // --- Save and exit edit mode ---
  const saveAndExitEdit = useCallback(async () => {
    await handleSave();
    setEditorViewOnly(true);
    setDiscardConfirm(false);
    setActivePane("left");
  }, [handleSave]);

  // --- Discard changes and exit edit mode ---
  const discardAndExitEdit = useCallback(() => {
    setContent(initialContentRef.current);
    setHasChanges(false);
    setEditorViewOnly(true);
    setDiscardConfirm(false);
    setActivePane("left");
  }, []);

  // --- Trigger pipeline ---
  const handleTriggerPipeline = useCallback(async () => {
    if (!activeProject || !latestVersion || !editable) return;
    if (spec?.type === "feature") {
      const runId = await triggerPipeline(id, latestVersion.id, content, title, activeProject.pipelineThreshold, activeProject.maxRetries);
      router.push(`/pipelines/${runId}`);
    } else if (spec?.type === "ui-refactor") {
      const runId = await triggerDesignPipeline(id, latestVersion.id, content, title);
      router.push(`/design-pipelines/${runId}`);
    }
    setPipelineConfirm(false);
  }, [activeProject, latestVersion, editable, spec, triggerPipeline, triggerDesignPipeline, id, content, title, router]);

  // --- Scroll outline item into view ---
  const scrollOutlineItemIntoView = useCallback((index: number) => {
    const container = outlineScrollRef.current;
    if (!container) return;
    const items = container.querySelectorAll("[data-outline-item]");
    const el = items[index];
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  // --- Scroll editor to heading by outline index ---
  const scrollEditorToOutlineItem = useCallback((index: number) => {
    const item = filteredOutline[index];
    if (item?.headingId) {
      const el = document.getElementById(item.headingId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [filteredOutline]);

  /* ================================================================== */
  /*  KEYBOARD HANDLER                                                   */
  /* ================================================================== */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInInput = tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;

      // ---- Layer 1: Save/Discard dialog ----
      if (discardConfirm) {
        if (e.key === "Enter") {
          e.preventDefault();
          saveAndExitEdit();
          return;
        }
        if (e.key === "q") {
          e.preventDefault();
          discardAndExitEdit();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDiscardConfirm(false);
          return;
        }
        return;
      }

      // ---- Layer 2: Pipeline confirm dialog ----
      if (pipelineConfirm) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPipelineConfirm(false);
          return;
        }
        return;
      }

      // ---- Layer 3: Overlay panel (chat/history) ----
      if (overlayPanel) {
        if (e.key === "Escape") {
          e.preventDefault();
          setOverlayPanel(null);
          return;
        }
        return;
      }

      // ---- Layer 4: Outline search focused ----
      if (outlineSearchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (outlineSearch) {
            setOutlineSearch("");
          } else {
            outlineSearchRef.current?.blur();
            setOutlineSearchFocused(false);
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          outlineSearchRef.current?.blur();
          setOutlineSearchFocused(false);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(outlineIndex + 1, filteredOutline.length - 1);
          setOutlineIndex(next);
          scrollOutlineItemIntoView(next);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = Math.max(outlineIndex - 1, 0);
          setOutlineIndex(prev);
          scrollOutlineItemIntoView(prev);
          return;
        }
        return;
      }

      // ---- Layer 5: Title editing ----
      if (editingTitle) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEditingTitle(false);
          titleInputRef.current?.blur();
          return;
        }
        return;
      }

      // ---- Layer 6: Editor focused (right pane, not view-only) ----
      if (activePane === "right" && !editorViewOnly && isInInput) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (hasChanges) {
            setDiscardConfirm(true);
          } else {
            setEditorViewOnly(true);
            setActivePane("left");
          }
          return;
        }
        // Let editor handle all other keys
        return;
      }

      // ---- Layer 7: Global navigation (no input focused) ----
      if (isInInput) return;

      // Tab — switch pane
      if (e.key === "Tab") {
        e.preventDefault();
        setActivePane((p) => (p === "left" ? "right" : "left"));
        return;
      }

      // j/k — navigate outline (only when left pane active)
      if (activePane === "left") {
        if (e.key === "j") {
          e.preventDefault();
          const next = Math.min(outlineIndex + 1, filteredOutline.length - 1);
          setOutlineIndex(next);
          scrollOutlineItemIntoView(next);
          scrollEditorToOutlineItem(next);
          return;
        }
        if (e.key === "k") {
          e.preventDefault();
          const prev = Math.max(outlineIndex - 1, 0);
          setOutlineIndex(prev);
          scrollOutlineItemIntoView(prev);
          scrollEditorToOutlineItem(prev);
          return;
        }
      }

      // / — search outline
      if (e.key === "/") {
        e.preventDefault();
        setActivePane("left");
        setOutlineSearchFocused(true);
        requestAnimationFrame(() => outlineSearchRef.current?.focus());
        return;
      }

      // e — enter edit mode
      if (e.key === "e" && editable) {
        e.preventDefault();
        setActivePane("right");
        setEditorViewOnly(false);
        requestAnimationFrame(() => {
          const textarea = document.querySelector("[data-spec-editor] textarea");
          if (textarea) (textarea as HTMLElement).focus();
        });
        return;
      }

      // s — save
      if (e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // h — history overlay
      if (e.key === "h") {
        e.preventDefault();
        setOverlayPanel("history");
        return;
      }

      // c — chat overlay
      if (e.key === "c") {
        e.preventDefault();
        setOverlayPanel("chat");
        requestAnimationFrame(() => {
          const chatInput = document.querySelector("[data-chat-input] textarea, [data-chat-input] input");
          if (chatInput) (chatInput as HTMLElement).focus();
        });
        return;
      }

      // p — pipeline trigger
      if (e.key === "p" && editable && latestVersion) {
        e.preventDefault();
        setPipelineConfirm(true);
        return;
      }

      // t — edit title
      if (e.key === "t" && editable) {
        e.preventDefault();
        setEditingTitle(true);
        requestAnimationFrame(() => titleInputRef.current?.focus());
        return;
      }

      // Escape — back to list
      if (e.key === "Escape") {
        e.preventDefault();
        if (activePane === "right" && editorViewOnly) {
          setActivePane("left");
        } else {
          router.push("/specifications");
        }
        return;
      }

      // Enter — activate outline item (scroll to heading)
      if (e.key === "Enter" && activePane === "left") {
        e.preventDefault();
        const item = filteredOutline[outlineIndex];
        if (item?.type === "heading" && item.headingId) {
          setActivePane("right");
          // Scroll into view in the editor preview
          requestAnimationFrame(() => {
            const el = document.getElementById(item.headingId!);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    discardConfirm, pipelineConfirm, overlayPanel, outlineSearchFocused,
    editingTitle, activePane, editorViewOnly, outlineIndex, filteredOutline,
    editable, hasChanges, outlineSearch, handleSave, saveAndExitEdit,
    discardAndExitEdit, scrollOutlineItemIntoView, scrollEditorToOutlineItem, router, latestVersion,
  ]);

  /* ================================================================== */
  /*  LOADING STATE                                                      */
  /* ================================================================== */

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <style>{keyframes}</style>
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  /* ================================================================== */
  /*  NOT FOUND STATE                                                    */
  /* ================================================================== */

  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-500">
        <style>{keyframes}</style>
        <div className="text-center">
          <p className="text-lg font-light tracking-wide text-zinc-400">Specification not found</p>
          <p className="mt-1 text-sm text-zinc-600">It may have been deleted or moved.</p>
        </div>
        <button
          onClick={() => router.push("/specifications")}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-sm text-zinc-300 transition-all hover:bg-white/[0.08]"
        >
          Back to Specifications
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[spec.status];

  /* ================================================================== */
  /*  MAIN RENDER                                                        */
  /* ================================================================== */

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <style>{keyframes}</style>

      {/* ============================================================= */}
      {/*  TOP ACTION BAR                                                */}
      {/* ============================================================= */}
      <div className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl px-4 py-2">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push("/specifications")}
          className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Specs
        </button>
        <span className="text-zinc-700 text-[11px]">/</span>

        {/* Title */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-zinc-100 outline-none caret-violet-400 border-b border-violet-400/40 py-0.5"
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-[13px] font-semibold text-zinc-200 cursor-default"
            onDoubleClick={() => { if (editable) { setEditingTitle(true); requestAnimationFrame(() => titleInputRef.current?.focus()); } }}
          >
            {title || "Untitled"}
          </span>
        )}

        {/* Unsaved indicator */}
        {hasChanges && editable && (
          <span className="flex items-center gap-1 text-[11px] text-amber-400/80 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Unsaved
          </span>
        )}

        {/* Status badge */}
        <span className={`inline-flex items-center gap-1.5 rounded-full border backdrop-blur-md px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${badge.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>

        {/* Pipeline link */}
        {activeRunId && (
          <Link
            href={`/pipelines/${activeRunId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300 transition-all hover:bg-blue-400/20 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Pipeline
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
            </svg>
          </Link>
        )}
        {activeDesignRunId && (
          <Link
            href={`/design-pipelines/${activeDesignRunId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/20 bg-purple-400/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-300 transition-all hover:bg-purple-400/20 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            Design
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
            </svg>
          </Link>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !editable}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              hasChanges && editable
                ? "bg-violet-500/20 text-violet-300 border border-violet-400/20 hover:bg-violet-500/30"
                : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] border border-transparent"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">s</kbd>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setOverlayPanel("history")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              overlayPanel === "history"
                ? "bg-amber-500/15 text-amber-300 border border-amber-400/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent"
            }`}
          >
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">h</kbd>
            History
          </button>
          <button
            onClick={() => {
              setOverlayPanel("chat");
              requestAnimationFrame(() => {
                const chatInput = document.querySelector("[data-chat-input] textarea, [data-chat-input] input");
                if (chatInput) (chatInput as HTMLElement).focus();
              });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              overlayPanel === "chat"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent"
            }`}
          >
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">c</kbd>
            Chat
          </button>
          {editable && (
            <button
              onClick={() => {
                setEditingTitle(true);
                requestAnimationFrame(() => titleInputRef.current?.focus());
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent transition-all"
            >
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">t</kbd>
              Title
            </button>
          )}
        </div>

        {/* Reset to draft for failed/cancelled */}
        {(spec.status === "failed" || spec.status === "cancelled") && (
          <button
            type="button"
            onClick={() => updateStatus(id, "draft")}
            className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-zinc-300"
          >
            Reset to Draft
          </button>
        )}
      </div>

      {/* ============================================================= */}
      {/*  SPLIT PANE: LEFT OUTLINE + RIGHT EDITOR                      */}
      {/* ============================================================= */}
      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">

        {/* ---- LEFT PANE: Outline (280px) ---- */}
        <div
          className={`w-[280px] shrink-0 flex flex-col border-r transition-colors duration-200 ${
            activePane === "left" ? "border-violet-500/40" : "border-white/[0.06]"
          } bg-zinc-950/60`}
        >
          {/* Outline search */}
          <div className="px-3 pt-3 pb-2">
            <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
              outlineSearchFocused ? "border-violet-500/40 bg-violet-500/5" : "border-white/[0.06] bg-white/[0.02]"
            }`}>
              <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={outlineSearchRef}
                type="text"
                value={outlineSearch}
                onChange={(e) => { setOutlineSearch(e.target.value); setOutlineIndex(0); }}
                onFocus={() => setOutlineSearchFocused(true)}
                onBlur={() => setOutlineSearchFocused(false)}
                placeholder="Filter outline..."
                className="flex-1 bg-transparent text-[12px] text-zinc-300 placeholder:text-zinc-600 outline-none"
              />
              {!outlineSearchFocused && !outlineSearch && (
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">/</kbd>
              )}
            </div>
          </div>

          {/* Outline items */}
          <div ref={outlineScrollRef} className="flex-1 overflow-y-auto px-2 pb-3">
            {/* Metadata section — static, not navigable */}
            {spec && !outlineSearch && (
              <div className="mb-2">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-2 py-1.5">
                  Metadata
                </div>
                {[
                  { label: "Status", value: STATUS_BADGE[spec.status].label },
                  { label: "Type", value: spec.type === "ui-refactor" ? "UI Refactor" : "Feature" },
                  ...(latestVersion ? [{ label: "Version", value: `v${latestVersion.versionNumber}` }] : []),
                  { label: "Updated", value: new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) },
                ].map((meta) => (
                  <div
                    key={meta.label}
                    className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] text-zinc-500"
                  >
                    <span>{meta.label}</span>
                    <span className="text-zinc-400">{meta.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Headings section — navigable with j/k */}
            {filteredOutline.length > 0 && (
              <div>
                {!outlineSearch && (
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-2 py-1.5">
                    Document Outline
                  </div>
                )}
                {filteredOutline.map((item, i) => {
                  const isActive = outlineIndex === i && activePane === "left";
                  const indent = ((item.headingLevel ?? 1) - 1) * 12;
                  return (
                    <div
                      key={`heading-${item.headingId}`}
                      data-outline-item
                      onClick={() => {
                        setOutlineIndex(i);
                        if (item.headingId) {
                          setActivePane("right");
                          requestAnimationFrame(() => {
                            const el = document.getElementById(item.headingId!);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }
                      }}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] cursor-pointer transition-all duration-150 ${
                        isActive
                          ? "bg-violet-500/10 text-violet-300"
                          : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-300"
                      }`}
                      style={{ paddingLeft: `${indent + 10}px` }}
                    >
                      <span className={`h-1 w-1 rounded-full shrink-0 ${isActive ? "bg-violet-400" : "bg-zinc-600"}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredOutline.length === 0 && outlineSearch && (
              <div className="px-3 py-6 text-center text-[12px] text-zinc-600 italic">
                No results for &ldquo;{outlineSearch}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* ---- RIGHT PANE: Editor ---- */}
        <div
          className={`flex-1 flex flex-col min-h-0 min-w-0 border-l-0 transition-colors duration-200 ${
            activePane === "right" ? "ring-1 ring-inset ring-violet-500/30" : ""
          }`}
        >
          {/* Version preview banner */}
          {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
            <div className="flex items-center gap-3 border-b border-blue-400/20 px-4 py-2 bg-blue-400/10 backdrop-blur-md">
              <svg className="h-3.5 w-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-blue-300 font-medium">Viewing v{viewingVersion.versionNumber}</span>
              <button
                onClick={() => setViewingVersion(null)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs text-blue-300 transition-all hover:bg-blue-400/20"
              >
                Back to current
              </button>
            </div>
          )}

          {/* Read-only banner */}
          {!editable && !viewingVersion && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 bg-white/[0.02]">
              <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-xs text-zinc-500">
                Read-only -- <span className="text-zinc-400 font-medium">{spec.status}</span>
                {(spec.status === "failed" || spec.status === "cancelled") && ". Reset to Draft to edit."}
              </span>
            </div>
          )}

          {/* Edit mode indicator */}
          {!editorViewOnly && editable && (
            <div className="flex items-center gap-2 border-b border-violet-500/20 px-4 py-1.5 bg-violet-500/5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[11px] text-violet-300 font-medium">Edit Mode</span>
              <span className="text-[11px] text-zinc-600 ml-auto">
                Esc to exit
              </span>
            </div>
          )}

          {/* Editor content */}
          <div className="flex flex-1 flex-col min-h-0 p-1" data-spec-editor>
            <MarkdownEditor
              value={viewingVersion ? viewingVersion.content : content}
              onChange={editable && !viewingVersion ? setContent : () => {}}
              placeholder="Begin writing your specification..."
              viewOnly={editorViewOnly || !editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
            />
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/*  BOTTOM HINTS BAR                                              */}
      {/* ============================================================= */}
      <div
        className="relative z-10 flex items-center gap-4 border-t border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl px-4 py-1.5"
        style={{ animation: "hintBarIn 0.3s ease-out" }}
      >
        <div className="flex items-center gap-3 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd>
            navigate
          </span>
          <span className="text-zinc-800">|</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Tab</kbd>
            switch pane
          </span>
          <span className="text-zinc-800">|</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd>
            search
          </span>
          {editable && (
            <>
              <span className="text-zinc-800">|</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">e</kbd>
                edit
              </span>
            </>
          )}
          {editable && latestVersion && (
            <>
              <span className="text-zinc-800">|</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">p</kbd>
                pipeline
              </span>
            </>
          )}
          <span className="text-zinc-800">|</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
            back
          </span>
        </div>

        <div className="flex-1" />

        {/* Pane indicator */}
        <span className="text-[10px] text-zinc-600 font-mono">
          {activePane === "left" ? "OUTLINE" : editorViewOnly ? "PREVIEW" : "EDIT"}
        </span>
      </div>

      {/* ============================================================= */}
      {/*  FULL-SCREEN FOCUS OVERLAYS (Chat / History)                   */}
      {/* ============================================================= */}

      {/* History overlay */}
      {overlayPanel === "history" && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
            onClick={() => setOverlayPanel(null)}
          />
          <div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ animation: "dashOverlayIn 0.2s ease-out" }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">Version History</span>
                {versions.length > 0 && (
                  <span className="text-[11px] text-zinc-500 ml-1">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
                )}
              </div>
              <button
                onClick={() => setOverlayPanel(null)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[11px]">Close</span>
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-auto">
              <VersionHistory
                versions={versions}
                onRestore={(restoredContent) => {
                  handleRestore(restoredContent);
                  setViewingVersion(null);
                  setOverlayPanel(null);
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
        </>
      )}

      {/* Chat overlay */}
      {overlayPanel === "chat" && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
            onClick={() => setOverlayPanel(null)}
          />
          <div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ animation: "dashOverlayIn 0.2s ease-out" }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">AI Assistant</span>
              </div>
              <button
                onClick={() => setOverlayPanel(null)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[11px]">Close</span>
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-auto" data-chat-input>
              <AgentChat
                agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
                context={content}
                onApplySpec={(specContent) => {
                  handleApplySpec(specContent);
                  setOverlayPanel(null);
                }}
                className="flex-1"
              />
            </div>
          </div>
        </>
      )}

      {/* ============================================================= */}
      {/*  PIPELINE TRIGGER DIALOG                                       */}
      {/* ============================================================= */}
      {pipelineConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
            onClick={() => setPipelineConfirm(false)}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 w-[380px]"
            style={{ animation: "modalIn 0.2s ease-out forwards" }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Trigger Pipeline</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                This will start the {spec.type === "ui-refactor" ? "design" : "feature"} pipeline for this specification. Continue?
              </p>
              <div className="flex items-center gap-2">
                {activeProject && editable && spec.type === "feature" && (
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
                )}
                {activeProject && editable && spec.type === "ui-refactor" && (
                  <DesignPipelineTriggerButton
                    specificationId={id}
                    specVersionId={latestVersion?.id ?? null}
                    specContent={content}
                    specTitle={title}
                    hasActiveRun={hasActiveDesignRun(id)}
                    activeRunId={getActiveDesignRunId(id)}
                    onTrigger={triggerDesignPipeline}
                  />
                )}
                <button
                  onClick={() => setPipelineConfirm(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============================================================= */}
      {/*  SAVE/DISCARD DIALOG                                           */}
      {/* ============================================================= */}
      {discardConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 w-[360px]"
            style={{ animation: "modalIn 0.2s ease-out forwards" }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Unsaved Changes</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                You have unsaved changes. Save before leaving edit mode?
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveAndExitEdit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-400/20 text-sm font-medium hover:bg-violet-500/30 transition-colors"
                >
                  <kbd className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd>
                  Save
                </button>
                <button
                  onClick={discardAndExitEdit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">q</kbd>
                  Discard
                </button>
                <button
                  onClick={() => setDiscardConfirm(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-600 hover:text-zinc-400 text-sm transition-colors ml-auto"
                >
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">Esc</kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
