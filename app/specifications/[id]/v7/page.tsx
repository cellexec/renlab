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
/*  Status pill styles                                                 */
/* ------------------------------------------------------------------ */

const STATUS_BADGE: Record<SpecificationStatus, { label: string; cls: string; dot: string }> = {
  chat:      { label: "Chat",      dot: "bg-cyan-400", cls: "bg-cyan-400/10 text-cyan-300 animate-pulse" },
  draft:     { label: "Draft",     cls: "bg-zinc-400/10 text-zinc-400 border-white/[0.08]",           dot: "bg-zinc-400" },
  pipeline:  { label: "Pipeline",  cls: "bg-blue-400/10 text-blue-300 border-blue-400/20",            dot: "bg-blue-400" },
  failed:    { label: "Failed",    cls: "bg-red-400/10 text-red-300 border-red-400/20",               dot: "bg-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20",      dot: "bg-yellow-400" },
  done:      { label: "Done",      cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",   dot: "bg-emerald-400" },
};

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const keyframes = `
@keyframes slideOverlayIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes versionBannerIn {
  from { transform: translateY(-4px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes outlinePulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
`;

/* ------------------------------------------------------------------ */
/*  Outline item shape                                                 */
/* ------------------------------------------------------------------ */

interface OutlineItem {
  id: string;
  label: string;
  depth: number; // 0 = top-level special, 1 = ##, 2 = ###, etc.
  type: "special" | "heading";
  offset?: number; // char offset into the content
}

function extractOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [
    { id: "__title__", label: "Title", depth: 0, type: "special" },
    { id: "__metadata__", label: "Metadata", depth: 0, type: "special" },
  ];

  const lines = content.split("\n");
  let charOffset = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const depth = match[1].length - 1; // ## = depth 1, ### = depth 2
      const label = match[2].replace(/[*_`#]/g, "").trim();
      if (label) {
        items.push({
          id: `heading-${charOffset}`,
          label,
          depth: Math.max(1, depth),
          type: "heading",
          offset: charOffset,
        });
      }
    }
    charOffset += line.length + 1;
  }

  items.push({ id: "__actions__", label: "Actions", depth: 0, type: "special" });
  return items;
}

/* ------------------------------------------------------------------ */
/*  Kbd hint component                                                 */
/* ------------------------------------------------------------------ */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-mono font-medium text-zinc-400 bg-white/[0.06] border border-white/[0.1] rounded">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SpecV7Page({ params }: { params: Promise<{ id: string }> }) {
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [outlineIndex, setOutlineIndex] = useState(0);
  const [mode, setMode] = useState<"outline" | "editor">("outline");

  const initialContentRef = useRef("");
  const initializedRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const mouseMovedRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);

  // Outline items derived from content
  const outlineItems = useMemo(() => extractOutline(content), [content]);

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

  // Clamp outline index
  useEffect(() => {
    if (outlineIndex >= outlineItems.length) {
      setOutlineIndex(Math.max(0, outlineItems.length - 1));
    }
  }, [outlineItems.length, outlineIndex]);

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
  const panelOpen = chatOpen || historyOpen;

  // Keyboard handler
  useEffect(() => {
    if (!spec) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === "input" || tagName === "textarea" || target.isContentEditable;

      // Editing title mode
      if (editingTitle) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEditingTitle(false);
          titleInputRef.current?.blur();
        }
        return;
      }

      // Panel shortcuts always work
      if (!isInput) {
        // Close panels with Escape
        if (e.key === "Escape") {
          if (panelOpen) {
            e.preventDefault();
            setChatOpen(false);
            setHistoryOpen(false);
            return;
          }
          if (mode === "editor") {
            e.preventDefault();
            setMode("outline");
            return;
          }
          // Esc in outline mode -> back to list
          router.push("/specifications");
          return;
        }

        // Toggle outline
        if (e.key === "o" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setOutlineOpen((v) => !v);
          return;
        }

        // Action strip shortcuts
        if (e.key === "s" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          handleSave();
          return;
        }
        if (e.key === "h" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setHistoryOpen((v) => !v);
          if (!historyOpen) setChatOpen(false);
          return;
        }
        if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setChatOpen((v) => !v);
          if (!chatOpen) setHistoryOpen(false);
          return;
        }
        if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          // Pipeline trigger is handled by buttons
          return;
        }
        if (e.key === "t" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          if (editable) {
            setEditingTitle(true);
            setTimeout(() => titleInputRef.current?.focus(), 0);
          }
          return;
        }

        // Outline navigation
        if (mode === "outline" && outlineOpen) {
          if (e.key === "j" || e.key === "ArrowDown") {
            e.preventDefault();
            setOutlineIndex((i) => Math.min(i + 1, outlineItems.length - 1));
            return;
          }
          if (e.key === "k" || e.key === "ArrowUp") {
            e.preventDefault();
            setOutlineIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const item = outlineItems[outlineIndex];
            if (item) {
              if (item.id === "__title__") {
                if (editable) {
                  setEditingTitle(true);
                  setTimeout(() => titleInputRef.current?.focus(), 0);
                }
              } else if (item.id === "__actions__") {
                // Focus the action strip area (scroll to bottom)
                contentAreaRef.current?.scrollTo({ top: contentAreaRef.current.scrollHeight, behavior: "smooth" });
              } else if (item.id === "__metadata__") {
                contentAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              } else if (item.offset !== undefined) {
                // Scroll to the heading in the content area
                // Approximate: find the heading element or scroll proportionally
                const totalLen = content.length;
                if (totalLen > 0 && contentAreaRef.current) {
                  const ratio = item.offset / totalLen;
                  const scrollTarget = ratio * contentAreaRef.current.scrollHeight;
                  contentAreaRef.current.scrollTo({ top: scrollTarget, behavior: "smooth" });
                }
              }
            }
            return;
          }
          // Press i to focus into editor
          if (e.key === "i") {
            e.preventDefault();
            setMode("editor");
            return;
          }
        }
      }

      // Ctrl+S to save from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [spec, editingTitle, mode, outlineOpen, outlineIndex, outlineItems, panelOpen, chatOpen, historyOpen, editable, content, router]);

  // Mouse "wait for actual movement" pattern
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
      const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
      if (dx > 3 || dy > 3) {
        mouseMovedRef.current = true;
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  /* ---------- Loading state ---------- */
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <style>{keyframes}</style>
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  /* ---------- Not found state ---------- */
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
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-6 py-2.5 text-sm text-zinc-300 transition-all hover:bg-white/[0.08] hover:border-white/[0.15]"
        >
          Back to Specifications
        </button>
      </div>
    );
  }

  // Build bottom hints based on current state
  const hints: { key: string; label: string }[] = [];
  if (panelOpen) {
    hints.push({ key: "Esc", label: "Close panel" });
  } else if (editingTitle) {
    hints.push({ key: "Esc", label: "Stop editing" }, { key: "Enter", label: "Confirm" });
  } else if (mode === "editor") {
    hints.push({ key: "Esc", label: "Outline mode" });
  } else {
    hints.push(
      { key: "j/k", label: "Navigate" },
      { key: "Enter", label: "Jump to" },
      { key: "i", label: "Editor" },
      { key: "o", label: "Toggle outline" },
      { key: "Esc", label: "Back" },
    );
  }
  hints.push(
    { key: "s", label: "Save" },
    { key: "h", label: "History" },
    { key: "c", label: "Chat" },
    { key: "t", label: "Title" },
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <style>{keyframes}</style>

      {/* ============================================================= */}
      {/*  BREADCRUMB                                                    */}
      {/* ============================================================= */}
      <div className="shrink-0 flex items-center gap-2 px-5 pt-4 pb-2">
        <button
          onClick={() => router.push("/specifications")}
          className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Specifications
        </button>
        <span className="text-[10px] text-zinc-700">/</span>
        <span className="text-[11px] text-zinc-400 truncate max-w-[240px]">{spec.title}</span>
        <span className="text-[10px] text-zinc-700 ml-1">(v7 - Outline Navigator)</span>
      </div>

      {/* ============================================================= */}
      {/*  MAIN AREA: Outline sidebar + content                          */}
      {/* ============================================================= */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ----- OUTLINE SIDEBAR ----- */}
        {outlineOpen && (
          <div className="shrink-0 w-[260px] border-r border-white/[0.06] flex flex-col bg-white/[0.01]">
            {/* Outline header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Outline</span>
              <button
                onClick={() => setOutlineOpen(false)}
                className="p-1 rounded text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Outline items */}
            <div className="flex-1 overflow-y-auto py-2">
              {outlineItems.map((item, idx) => {
                const isSelected = mode === "outline" && idx === outlineIndex;
                const indent = item.type === "special" ? 0 : (item.depth - 1);

                return (
                  <div
                    key={item.id}
                    className={`
                      relative flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-all duration-150
                      ${isSelected
                        ? "border-l-2 border-violet-500 bg-violet-500/[0.08] text-zinc-100"
                        : "border-l-2 border-transparent hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300"
                      }
                    `}
                    style={{ paddingLeft: `${16 + indent * 14}px` }}
                    onMouseEnter={() => {
                      if (mouseMovedRef.current && mode === "outline") {
                        setOutlineIndex(idx);
                      }
                    }}
                    onClick={() => {
                      setOutlineIndex(idx);
                      setMode("outline");
                      // Simulate Enter behavior
                      if (item.id === "__title__" && editable) {
                        setEditingTitle(true);
                        setTimeout(() => titleInputRef.current?.focus(), 0);
                      } else if (item.id === "__metadata__") {
                        contentAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      } else if (item.id === "__actions__") {
                        contentAreaRef.current?.scrollTo({ top: contentAreaRef.current?.scrollHeight ?? 0, behavior: "smooth" });
                      } else if (item.offset !== undefined && content.length > 0 && contentAreaRef.current) {
                        const ratio = item.offset / content.length;
                        contentAreaRef.current.scrollTo({ top: ratio * contentAreaRef.current.scrollHeight, behavior: "smooth" });
                      }
                    }}
                  >
                    {/* Icon for special items */}
                    {item.type === "special" && item.id === "__title__" && (
                      <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                      </svg>
                    )}
                    {item.type === "special" && item.id === "__metadata__" && (
                      <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {item.type === "special" && item.id === "__actions__" && (
                      <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                    {item.type === "heading" && (
                      <span className="w-3 h-3 flex items-center justify-center shrink-0">
                        <span className={`block rounded-full ${isSelected ? "bg-violet-400" : "bg-zinc-600"} ${item.depth <= 1 ? "w-1.5 h-1.5" : "w-1 h-1"}`} />
                      </span>
                    )}

                    <span className={`text-[12px] truncate ${item.type === "special" ? "font-medium" : "font-normal"} ${isSelected ? "text-zinc-100" : ""}`}>
                      {item.label}
                    </span>

                    {/* Kbd hint on selected */}
                    {isSelected && (
                      <span className="ml-auto shrink-0">
                        <Kbd>Enter</Kbd>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ----- CONTENT AREA ----- */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0" ref={contentAreaRef}>

          {/* Title + metadata section */}
          <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/[0.06]">
            {/* Editable title */}
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={!editable}
              onFocus={() => setEditingTitle(true)}
              onBlur={() => setEditingTitle(false)}
              className={`
                w-full bg-transparent text-2xl font-semibold tracking-tight text-zinc-100
                outline-none placeholder:text-zinc-700 caret-violet-400
                ${editingTitle ? "border-b border-amber-500/40 pb-1" : "border-b border-transparent pb-1"}
                ${!editable ? "cursor-default" : ""}
                transition-all duration-200
              `}
              placeholder="Untitled Specification"
            />

            {/* Compact metadata row */}
            <div className="mt-3 flex items-center gap-2.5 flex-wrap">
              {/* Status badge */}
              <span className={`inline-flex items-center gap-1.5 rounded-md border backdrop-blur-md px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[spec.status].cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[spec.status].dot}`} />
                {STATUS_BADGE[spec.status].label}
              </span>

              {/* Version */}
              {latestVersion && (
                <span className="text-[11px] text-zinc-500 font-mono bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-0.5">
                  v{latestVersion.versionNumber}
                </span>
              )}

              {/* Type badge */}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${spec.type === "ui-refactor" ? "text-purple-400/80 bg-purple-500/10 border-purple-500/15" : "text-blue-400/80 bg-blue-500/10 border-blue-500/15"}`}>
                {spec.type}
              </span>

              {/* Last saved */}
              <span className="text-[11px] text-zinc-600">
                {new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>

              {/* Unsaved indicator */}
              {hasChanges && editable && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/80">
                  <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                  Unsaved
                </span>
              )}

              {/* Pipeline links */}
              {activeRunId && (
                <Link
                  href={`/pipelines/${activeRunId}`}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-300 transition-all hover:bg-blue-400/20"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Pipeline
                </Link>
              )}
              {activeDesignRunId && (
                <Link
                  href={`/design-pipelines/${activeDesignRunId}`}
                  className="inline-flex items-center gap-1 rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 text-[11px] font-medium text-purple-300 transition-all hover:bg-purple-400/20"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                  Design Pipeline
                </Link>
              )}

              {/* Reset to draft */}
              {(spec.status === "failed" || spec.status === "cancelled") && (
                <button
                  type="button"
                  onClick={() => updateStatus(id, "draft")}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 decoration-zinc-700 hover:decoration-zinc-500 transition-colors"
                >
                  Reset to Draft
                </button>
              )}
            </div>
          </div>

          {/* Version preview banner */}
          {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
            <div
              className="flex items-center gap-3 border-b border-blue-400/20 px-6 py-2 bg-blue-400/10"
              style={{ animation: "versionBannerIn 0.25s ease-out" }}
            >
              <svg className="h-3.5 w-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[11px] text-blue-300 font-medium">Viewing v{viewingVersion.versionNumber}</span>
              <button
                onClick={() => setViewingVersion(null)}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-[11px] text-blue-300 transition-all hover:bg-blue-400/20"
              >
                Back to current
              </button>
            </div>
          )}

          {/* Read-only banner */}
          {!editable && !viewingVersion && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-6 py-2 bg-white/[0.02]">
              <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-[11px] text-zinc-500">
                Read-only — <span className="text-zinc-400 font-medium">{spec.status}</span>
              </span>
            </div>
          )}

          {/* Editor */}
          <div className={`flex flex-1 flex-col min-h-0 ${mode === "editor" ? "ring-1 ring-amber-500/20" : ""} transition-shadow duration-300`}>
            <MarkdownEditor
              value={viewingVersion ? viewingVersion.content : content}
              onChange={editable && !viewingVersion ? setContent : () => {}}
              placeholder="Begin writing your specification..."
              viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
            />
          </div>

          {/* ============================================================= */}
          {/*  ACTION STRIP                                                  */}
          {/* ============================================================= */}
          <div className="shrink-0 flex items-center gap-1.5 px-5 py-2.5 border-t border-white/[0.06] bg-white/[0.02]">
            {/* Save */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges || !editable}
              className={`
                inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-200
                ${hasChanges && editable
                  ? "bg-violet-500/15 text-violet-300 border border-violet-400/20 hover:bg-violet-500/25"
                  : "text-zinc-600 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-400"
                }
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              <Kbd>s</Kbd>
              {saving ? "Saving..." : "Save"}
            </button>

            <div className="w-px h-4 bg-white/[0.06]" />

            {/* History */}
            <button
              type="button"
              onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) setChatOpen(false); }}
              className={`
                inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-200
                ${historyOpen
                  ? "bg-amber-500/15 text-amber-300 border border-amber-400/20"
                  : "text-zinc-500 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-300"
                }
              `}
            >
              <Kbd>h</Kbd>
              History
            </button>

            {/* Chat */}
            <button
              type="button"
              onClick={() => { setChatOpen((v) => !v); if (!chatOpen) setHistoryOpen(false); }}
              className={`
                inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-200
                ${chatOpen
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20"
                  : "text-zinc-500 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-300"
                }
              `}
            >
              <Kbd>c</Kbd>
              Chat
            </button>

            <div className="w-px h-4 bg-white/[0.06]" />

            {/* Pipeline trigger */}
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

            {/* Title edit button */}
            <button
              type="button"
              onClick={() => {
                if (editable) {
                  setEditingTitle(true);
                  setTimeout(() => titleInputRef.current?.focus(), 0);
                }
              }}
              disabled={!editable}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-zinc-500 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-300 transition-all duration-200 ml-auto disabled:opacity-40"
            >
              <Kbd>t</Kbd>
              Title
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/*  BOTTOM HINTS BAR                                              */}
      {/* ============================================================= */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-1.5 border-t border-white/[0.04] bg-zinc-950">
        {hints.map((h, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Kbd>{h.key}</Kbd>
            <span>{h.label}</span>
          </span>
        ))}
      </div>

      {/* ============================================================= */}
      {/*  OVERLAY PANELS                                                */}
      {/* ============================================================= */}

      {/* Backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
          style={{ animation: "fadeIn 0.2s ease-out" }}
          onClick={() => { setChatOpen(false); setHistoryOpen(false); }}
        />
      )}

      {/* History panel */}
      {historyOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 w-[560px]"
          style={{ animation: "slideOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <div className="flex h-full flex-col border-l border-white/[0.06] bg-zinc-950/80 backdrop-blur-2xl">
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

      {/* Chat panel */}
      {chatOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 w-[440px]"
          style={{ animation: "slideOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        >
          <div className="flex h-full flex-col border-l border-white/[0.06] bg-zinc-950/80 backdrop-blur-2xl">
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
