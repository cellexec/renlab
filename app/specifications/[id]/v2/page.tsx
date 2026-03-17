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

// -- Status styling --------------------------------------------------------

const STATUS_BADGE: Record<SpecificationStatus, { label: string; dot: string; cls: string }> = {
  chat:      { label: "Chat",      dot: "bg-cyan-400", cls: "bg-cyan-400/10 text-cyan-300 animate-pulse" },
  draft:     { label: "Draft",     dot: "bg-zinc-400",    cls: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20" },
  pipeline:  { label: "Pipeline",  dot: "bg-blue-400",    cls: "bg-blue-400/10 text-blue-300 border-blue-400/20" },
  failed:    { label: "Failed",    dot: "bg-red-400",     cls: "bg-red-400/10 text-red-300 border-red-400/20" },
  cancelled: { label: "Cancelled", dot: "bg-amber-400",   cls: "bg-amber-400/10 text-amber-300 border-amber-400/20" },
  done:      { label: "Done",      dot: "bg-emerald-400", cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" },
};

// -- Outline item types ----------------------------------------------------

interface OutlineItem {
  id: string;
  kind: "meta" | "heading";
  label: string;
  sublabel?: string;
  level?: number;         // heading level (1-6)
  headingIndex?: number;  // index into headings array for scrolling
}

// -- Fuzzy search ----------------------------------------------------------

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function fuzzyIndices(text: string, query: string): Set<number> | null {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const indices = new Set<number>();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return null;
    indices.add(idx);
    ti = idx + 1;
  }
  return indices;
}

function FuzzyText({ text, query, className }: { text: string; query: string; className?: string }) {
  if (!query) return <span className={className}>{text}</span>;
  const indices = fuzzyIndices(text, query);
  if (!indices) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {Array.from(text).map((ch, i) =>
        indices.has(i)
          ? <span key={i} className="text-violet-300 font-semibold">{ch}</span>
          : <span key={i}>{ch}</span>
      )}
    </span>
  );
}

// -- Extract headings from markdown ----------------------------------------

function extractHeadings(content: string): { level: number; text: string }[] {
  if (!content) return [];
  const lines = content.split("\n");
  const headings: { level: number; text: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
}

// -- Panel overlay type ----------------------------------------------------

type OverlayPanel = "history" | "chat" | null;

// -- Page ------------------------------------------------------------------

export default function SpecV2Page({ params }: { params: Promise<{ id: string }> }) {
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

  // -- State ---------------------------------------------------------------

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);

  // Split pane state
  const [leftPaneFocused, setLeftPaneFocused] = useState(true);
  const [selectedOutlineIndex, setSelectedOutlineIndex] = useState(0);
  const [outlineQuery, setOutlineQuery] = useState("");
  const [outlineSearchFocused, setOutlineSearchFocused] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState<OverlayPanel>(null);
  const [editorViewOnly, setEditorViewOnly] = useState(true);

  const outlineSearchRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const outlineListRef = useRef<HTMLDivElement>(null);

  // Mouse
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // -- Derived data --------------------------------------------------------

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

  // -- Init ----------------------------------------------------------------

  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  // -- Outline items -------------------------------------------------------

  const displayContent = viewingVersion ? viewingVersion.content : content;
  const headings = useMemo(() => extractHeadings(displayContent), [displayContent]);

  const outlineItems: OutlineItem[] = useMemo(() => {
    if (!spec) return [];
    const items: OutlineItem[] = [
      { id: "meta-status",  kind: "meta", label: "Status",  sublabel: STATUS_BADGE[spec.status].label },
      { id: "meta-type",    kind: "meta", label: "Type",    sublabel: spec.type === "ui-refactor" ? "UI Refactor" : "Feature" },
      { id: "meta-version", kind: "meta", label: "Version", sublabel: latestVersion ? `v${latestVersion.versionNumber}` : "--" },
      { id: "meta-updated", kind: "meta", label: "Updated", sublabel: new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) },
      { id: "meta-created", kind: "meta", label: "Created", sublabel: new Date(spec.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) },
    ];

    headings.forEach((h, i) => {
      items.push({
        id: `heading-${i}`,
        kind: "heading",
        label: h.text,
        level: h.level,
        headingIndex: i,
      });
    });

    return items;
  }, [spec, latestVersion, headings]);

  const filteredOutlineItems = useMemo(() => {
    if (!outlineQuery) return outlineItems;
    return outlineItems.filter(item => fuzzyMatch(item.label, outlineQuery));
  }, [outlineItems, outlineQuery]);

  // -- Handlers ------------------------------------------------------------

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
    if (editable) {
      setContent(specContent);
      setOverlayPanel(null);
      setEditorViewOnly(false);
    }
  };

  const handleRestore = (restoredContent: string) => {
    if (editable) {
      setContent(restoredContent);
      setViewingVersion(null);
      setOverlayPanel(null);
      setEditorViewOnly(false);
    }
  };

  // Scroll to a heading in the editor pane
  const scrollToHeading = (headingIndex: number) => {
    // Find the editor content area and scroll to the heading
    const editorArea = document.querySelector("[data-spec-editor]");
    if (!editorArea) return;
    // Find all heading elements in the rendered markdown
    const headingEls = editorArea.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const target = headingEls[headingIndex];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // -- Selection clamping --------------------------------------------------

  useEffect(() => {
    setSelectedOutlineIndex(0);
  }, [outlineQuery]);

  useEffect(() => {
    setSelectedOutlineIndex(i => Math.min(i, Math.max(0, filteredOutlineItems.length - 1)));
  }, [filteredOutlineItems.length]);

  // Scroll selected outline item into view
  useEffect(() => {
    if (!outlineListRef.current) return;
    const el = outlineListRef.current.querySelector(
      `[data-outline-index="${selectedOutlineIndex}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedOutlineIndex]);

  // -- Mouse tracking ------------------------------------------------------

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      if (!mouseActive && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) setMouseActive(true);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [mouseActive]);

  // -- Keyboard handler ----------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // LAYER 1: Overlay panel open (chat/history)
      if (overlayPanel) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setOverlayPanel(null);
          return;
        }
        return; // let overlay handle keys
      }

      // LAYER 2: Outline search focused
      if (outlineSearchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (outlineQuery) {
            setOutlineQuery("");
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
          // Activate the selected outline item
          const item = filteredOutlineItems[selectedOutlineIndex];
          if (item?.kind === "heading" && item.headingIndex !== undefined) {
            scrollToHeading(item.headingIndex);
          }
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedOutlineIndex(i => Math.min(i + 1, filteredOutlineItems.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedOutlineIndex(i => Math.max(i - 1, 0));
          return;
        }
        return;
      }

      // LAYER 3: Title editing
      if (editingTitle) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEditingTitle(false);
        }
        return;
      }

      // LAYER 4: Editor focused (right pane, not view-only)
      if (!leftPaneFocused && !editorViewOnly) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "TEXTAREA") return; // let editor handle

        if (e.key === "Escape") {
          e.preventDefault();
          setEditorViewOnly(true);
          return;
        }
      }

      // LAYER 5: Global navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setLeftPaneFocused(f => !f);
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setLeftPaneFocused(f => !f);
      } else if (leftPaneFocused) {
        // Left pane navigation
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedOutlineIndex(i => Math.min(i + 1, filteredOutlineItems.length - 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedOutlineIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "/") {
          e.preventDefault();
          setOutlineSearchFocused(true);
          requestAnimationFrame(() => outlineSearchRef.current?.focus());
        } else if (e.key === "Enter") {
          e.preventDefault();
          const item = filteredOutlineItems[selectedOutlineIndex];
          if (item?.kind === "heading" && item.headingIndex !== undefined) {
            scrollToHeading(item.headingIndex);
            setLeftPaneFocused(false);
          }
        } else if (e.key === "s") {
          e.preventDefault();
          handleSave();
        } else if (e.key === "h") {
          e.preventDefault();
          setOverlayPanel(p => p === "history" ? null : "history");
        } else if (e.key === "c") {
          e.preventDefault();
          setOverlayPanel(p => p === "chat" ? null : "chat");
        } else if (e.key === "r" && editable) {
          e.preventDefault();
          // Pipeline trigger via keyboard -- this is handled by the button itself
        } else if (e.key === "e" && editable) {
          e.preventDefault();
          setLeftPaneFocused(false);
          setEditorViewOnly(false);
        } else if (e.key === "t" && editable) {
          e.preventDefault();
          setEditingTitle(true);
          requestAnimationFrame(() => titleInputRef.current?.focus());
        } else if (e.key === "Escape") {
          e.preventDefault();
          router.push("/specifications");
        }
      } else {
        // Right pane (editor view-only mode)
        if (e.key === "e" && editable) {
          e.preventDefault();
          setEditorViewOnly(false);
        } else if (e.key === "s") {
          e.preventDefault();
          handleSave();
        } else if (e.key === "h") {
          e.preventDefault();
          setOverlayPanel(p => p === "history" ? null : "history");
        } else if (e.key === "c") {
          e.preventDefault();
          setOverlayPanel(p => p === "chat" ? null : "chat");
        } else if (e.key === "Escape") {
          e.preventDefault();
          setLeftPaneFocused(true);
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [overlayPanel, outlineSearchFocused, outlineQuery, editingTitle, leftPaneFocused, editorViewOnly, filteredOutlineItems, selectedOutlineIndex, editable, router, id]);

  // -- Loading state -------------------------------------------------------

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  // -- Not found state -----------------------------------------------------

  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-500">
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
  const isViewOnlySpec = !editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber);
  const effectiveViewOnly = isViewOnlySpec || editorViewOnly;

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* ================================================================= */}
      {/*  Top action bar                                                   */}
      {/* ================================================================= */}
      <div className="shrink-0 border-b border-zinc-800/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          {/* Breadcrumb */}
          <button
            onClick={() => router.push("/specifications")}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Specifications
          </button>
          <span className="text-[10px] text-zinc-700">/</span>

          {/* Title */}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditingTitle(false); } }}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-zinc-100 outline-none border-b border-violet-500/50 pb-0.5 caret-violet-400"
            />
          ) : (
            <span className="flex-1 min-w-0 text-sm font-medium text-zinc-200 truncate">{title}</span>
          )}

          {/* Unsaved indicator */}
          {hasChanges && editable && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400/80 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved
            </span>
          )}

          {/* Action buttons with shortcut badges */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges || !editable}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                hasChanges && editable
                  ? "bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25"
                  : "text-zinc-600 border border-zinc-800/40"
              } disabled:opacity-30`}
            >
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">s</kbd>
              {saving ? "..." : "Save"}
            </button>

            <button
              onClick={() => setOverlayPanel(p => p === "history" ? null : "history")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                overlayPanel === "history"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                  : "text-zinc-500 border border-zinc-800/40 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              <kbd className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                overlayPanel === "history" ? "bg-amber-500/15 text-amber-400" : "bg-zinc-800 text-zinc-600"
              }`}>h</kbd>
              History
            </button>

            <button
              onClick={() => setOverlayPanel(p => p === "chat" ? null : "chat")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                overlayPanel === "chat"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20"
                  : "text-zinc-500 border border-zinc-800/40 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              <kbd className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                overlayPanel === "chat" ? "bg-cyan-500/15 text-cyan-400" : "bg-zinc-800 text-zinc-600"
              }`}>c</kbd>
              Chat
            </button>

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

            {/* Pipeline link */}
            {activeRunId && (
              <Link href={`/pipelines/${activeRunId}`} className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/20 rounded-lg px-2 py-1.5 bg-blue-500/5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                Pipeline
              </Link>
            )}
            {activeDesignRunId && (
              <Link href={`/design-pipelines/${activeDesignRunId}`} className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors border border-purple-500/20 rounded-lg px-2 py-1.5 bg-purple-500/5">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                Design
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/*  Main split pane area                                             */}
      {/* ================================================================= */}
      <div className="flex-1 flex min-h-0 relative">
        {/* ---- Left pane: Outline navigator ---- */}
        <div
          className={`w-[280px] shrink-0 flex flex-col border-r transition-colors duration-200 ${
            leftPaneFocused ? "border-r-violet-500/30 bg-zinc-950" : "border-r-zinc-800/40 bg-zinc-950/80"
          }`}
        >
          {/* Pane focus indicator */}
          <div className={`h-0.5 transition-all duration-300 ${leftPaneFocused ? "bg-violet-500/40" : "bg-transparent"}`} />

          {/* Search bar */}
          <div className="shrink-0 border-b border-zinc-800/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <svg className="h-3.5 w-3.5 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              {!outlineSearchFocused && !outlineQuery && (
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">/</kbd>
              )}
              <input
                ref={outlineSearchRef}
                type="text"
                value={outlineQuery}
                onChange={(e) => setOutlineQuery(e.target.value)}
                onFocus={() => setOutlineSearchFocused(true)}
                onBlur={() => setOutlineSearchFocused(false)}
                placeholder="Filter outline..."
                className="flex-1 bg-transparent text-[12px] text-zinc-300 placeholder-zinc-600 outline-none"
              />
            </div>
          </div>

          {/* Outline list */}
          <div ref={outlineListRef} className="flex-1 overflow-y-auto py-1">
            {filteredOutlineItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-zinc-600">No matching sections</div>
            ) : (
              filteredOutlineItems.map((item, i) => {
                const isSelected = i === selectedOutlineIndex && leftPaneFocused;
                const isMeta = item.kind === "meta";

                if (isMeta) {
                  // Metadata row
                  return (
                    <div
                      key={item.id}
                      data-outline-index={i}
                      onClick={() => { setSelectedOutlineIndex(i); setLeftPaneFocused(true); }}
                      onMouseMove={() => { if (mouseActive && selectedOutlineIndex !== i) setSelectedOutlineIndex(i); }}
                      className={`flex items-center justify-between px-4 py-1.5 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-violet-500/[0.06] border-l-2 border-l-violet-500/60"
                          : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                      }`}
                    >
                      <span className={`text-[11px] ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                        <FuzzyText text={item.label} query={outlineQuery} />
                      </span>
                      <span className={`text-[11px] font-medium ${
                        item.label === "Status"
                          ? badge.cls.split(" ").find(c => c.startsWith("text-")) ?? "text-zinc-400"
                          : isSelected ? "text-zinc-200" : "text-zinc-400"
                      }`}>
                        {item.sublabel}
                      </span>
                    </div>
                  );
                }

                // Heading row
                const indent = item.level ? Math.max(0, (item.level - 1) * 12) : 0;
                return (
                  <div
                    key={item.id}
                    data-outline-index={i}
                    onClick={() => {
                      setSelectedOutlineIndex(i);
                      setLeftPaneFocused(true);
                      if (item.headingIndex !== undefined) scrollToHeading(item.headingIndex);
                    }}
                    onMouseMove={() => { if (mouseActive && selectedOutlineIndex !== i) setSelectedOutlineIndex(i); }}
                    className={`flex items-center gap-2 py-2 pr-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-violet-500/[0.06] border-l-2 border-l-violet-500/60"
                        : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                    }`}
                    style={{ paddingLeft: `${16 + indent}px` }}
                  >
                    {/* Level indicator line */}
                    {item.level && item.level > 1 && (
                      <span className={`w-0.5 self-stretch rounded-full shrink-0 ${
                        isSelected ? "bg-violet-500/30" : "bg-zinc-800"
                      }`} />
                    )}
                    <span className={`text-[12px] truncate ${
                      isSelected ? "text-zinc-100 font-medium" : "text-zinc-400"
                    } ${item.level === 1 ? "font-semibold" : ""}`}>
                      <FuzzyText text={item.label} query={outlineQuery} />
                    </span>
                    {isSelected && (
                      <kbd className="ml-auto rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600 shrink-0">Enter</kbd>
                    )}
                  </div>
                );
              })
            )}

            {/* Separator between meta and headings */}
            {outlineItems.some(i => i.kind === "meta") && outlineItems.some(i => i.kind === "heading") && !outlineQuery && (
              <div className="mx-4 my-2 border-t border-zinc-800/50" style={{ order: 5 }} />
            )}
          </div>

          {/* Reset to draft button */}
          {(spec.status === "failed" || spec.status === "cancelled") && (
            <div className="shrink-0 border-t border-zinc-800/50 px-3 py-2">
              <button
                onClick={() => updateStatus(id, "draft")}
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-300 transition-all"
              >
                Reset to Draft
              </button>
            </div>
          )}
        </div>

        {/* ---- Right pane: Editor ---- */}
        <div
          className={`flex-1 flex flex-col min-h-0 relative transition-colors duration-200 ${
            !leftPaneFocused ? "bg-zinc-950" : "bg-zinc-950/90"
          }`}
          data-spec-editor
        >
          {/* Pane focus indicator */}
          <div className={`h-0.5 transition-all duration-300 ${!leftPaneFocused ? "bg-violet-500/40" : "bg-transparent"}`} />

          {/* Viewing version banner */}
          {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
            <div className="shrink-0 flex items-center gap-3 border-b border-blue-400/20 px-4 py-2 bg-blue-500/10">
              <svg className="h-3.5 w-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[12px] text-blue-300 font-medium">Viewing v{viewingVersion.versionNumber}</span>
              <button
                onClick={() => setViewingVersion(null)}
                className="ml-auto text-[11px] text-blue-300 hover:text-blue-200 border border-blue-400/20 rounded-lg px-2 py-1 hover:bg-blue-400/10 transition-all"
              >
                Back to current
              </button>
            </div>
          )}

          {/* Read-only banner */}
          {!editable && (
            <div className="shrink-0 flex items-center gap-2 border-b border-zinc-800/40 px-4 py-2 bg-white/[0.02]">
              <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-[11px] text-zinc-500">
                Read-only -- <span className="text-zinc-400 font-medium">{spec.status}</span>
              </span>
            </div>
          )}

          {/* Edit mode indicator */}
          {!isViewOnlySpec && !editorViewOnly && !leftPaneFocused && (
            <div className="shrink-0 flex items-center gap-2 border-b border-amber-500/20 px-4 py-1.5 bg-amber-500/[0.05]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-[11px] text-amber-300 font-medium">Editing</span>
              <span className="text-[10px] text-zinc-600 ml-1">
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Esc</kbd> to exit edit mode
              </span>
            </div>
          )}

          {/* Editor content */}
          <div className="flex-1 flex flex-col min-h-0 p-1">
            <MarkdownEditor
              value={displayContent}
              onChange={editable && !viewingVersion && !editorViewOnly ? setContent : () => {}}
              placeholder="Begin writing your specification..."
              viewOnly={effectiveViewOnly}
            />
          </div>

          {/* Enter edit mode hint (when right pane focused but view-only) */}
          {!leftPaneFocused && effectiveViewOnly && editable && !viewingVersion && (
            <div className="absolute bottom-4 right-4 z-10">
              <div className="rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-sm px-3 py-2 text-[11px] text-zinc-500 shadow-lg">
                Press <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">e</kbd> to edit
              </div>
            </div>
          )}
        </div>

        {/* ---- Overlay panels (slide over the right pane) ---- */}
        {overlayPanel && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setOverlayPanel(null)}
              style={{ animation: "fadeIn 0.2s ease-out" }}
            />

            {/* Panel */}
            <div
              className="absolute top-0 right-0 bottom-0 z-30 w-[480px] border-l border-zinc-800/60 bg-zinc-950/95 backdrop-blur-xl flex flex-col"
              style={{ animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}
            >
              {/* Panel header */}
              <div className="shrink-0 flex items-center justify-between border-b border-zinc-800/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  {overlayPanel === "history" ? (
                    <>
                      <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-zinc-200">Version History</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                      </svg>
                      <span className="text-sm font-medium text-zinc-200">AI Assistant</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setOverlayPanel(null)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Panel content */}
              {overlayPanel === "history" ? (
                <VersionHistory
                  versions={versions}
                  onRestore={(restoredContent) => {
                    handleRestore(restoredContent);
                  }}
                  onView={(versionContent, versionNumber) => {
                    setViewingVersion({ content: versionContent, versionNumber });
                  }}
                  canRestore={editable}
                  viewingVersionNumber={viewingVersion?.versionNumber ?? null}
                  className="flex-1"
                />
              ) : (
                <AgentChat
                  agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
                  context={content}
                  onApplySpec={handleApplySpec}
                  className="flex-1"
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/*  Bottom hints bar                                                 */}
      {/* ================================================================= */}
      <div className="shrink-0 border-t border-zinc-800 px-4 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span className={`flex items-center gap-1 ${leftPaneFocused ? "text-violet-400/60" : ""}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500/40" />
          {leftPaneFocused ? "Outline" : "Editor"}
        </span>
        <span className="text-zinc-800">|</span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Tab</kbd>
          {" switch pane"}
        </span>
        {leftPaneFocused && (
          <>
            <span>
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd>
              {" "}
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd>
              {" navigate"}
            </span>
            <span>
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd>
              {" jump"}
            </span>
            <span>
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd>
              {" search"}
            </span>
          </>
        )}
        {!leftPaneFocused && editable && (
          <span>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">e</kbd>
            {" edit"}
          </span>
        )}
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">s</kbd>
          {" save"}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">h</kbd>
          {" history"}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">c</kbd>
          {" chat"}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">t</kbd>
          {" title"}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
          {" back"}
        </span>
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
