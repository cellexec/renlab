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
  draft:     { label: "Draft",     dot: "bg-zinc-400",    cls: "bg-zinc-400/10 text-zinc-400" },
  pipeline:  { label: "Pipeline",  dot: "bg-blue-400",    cls: "bg-blue-400/10 text-blue-300 animate-pulse" },
  failed:    { label: "Failed",    dot: "bg-red-400",     cls: "bg-red-400/10 text-red-300" },
  cancelled: { label: "Cancelled", dot: "bg-amber-400",   cls: "bg-amber-400/10 text-amber-300" },
  done:      { label: "Done",      dot: "bg-emerald-400", cls: "bg-emerald-400/10 text-emerald-300" },
};

// -- Modes -----------------------------------------------------------------

type ViewMode = "read" | "edit" | "history";
const MODES: ViewMode[] = ["read", "edit", "history"];
const MODE_LABELS: Record<ViewMode, string> = { read: "Read", edit: "Edit", history: "History" };

// -- Command palette items -------------------------------------------------

interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  available: boolean;
  action: () => void;
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

function FuzzyText({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const indices = fuzzyIndices(text, query);
  if (!indices) return <span>{text}</span>;
  return (
    <span>
      {Array.from(text).map((ch, i) =>
        indices.has(i)
          ? <span key={i} className="text-violet-300 font-semibold">{ch}</span>
          : <span key={i}>{ch}</span>
      )}
    </span>
  );
}

// -- Page ------------------------------------------------------------------

export default function SpecV1Page({ params }: { params: Promise<{ id: string }> }) {
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

  // Mode & palette state
  const [mode, setMode] = useState<ViewMode>("read");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  const paletteInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

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
      setChatOpen(false);
      setMode("edit");
    }
  };

  const handleRestore = (restoredContent: string) => {
    if (editable) {
      setContent(restoredContent);
      setViewingVersion(null);
      setMode("edit");
    }
  };

  // -- Command palette commands --------------------------------------------

  const commands: PaletteCommand[] = useMemo(() => {
    if (!spec) return [];
    return [
      { id: "save",      label: "Save Specification",     shortcut: "s",   category: "Actions",    available: editable && hasChanges, action: handleSave },
      { id: "read",      label: "Switch to Read Mode",    shortcut: "1",   category: "Modes",      available: mode !== "read",    action: () => setMode("read") },
      { id: "edit",      label: "Switch to Edit Mode",    shortcut: "2",   category: "Modes",      available: editable && mode !== "edit", action: () => setMode("edit") },
      { id: "history",   label: "Switch to History Mode",  shortcut: "3",   category: "Modes",      available: mode !== "history", action: () => setMode("history") },
      { id: "chat",      label: "Toggle AI Chat",          shortcut: "c",   category: "Panels",     available: true,              action: () => setChatOpen((v) => !v) },
      { id: "title",     label: "Edit Title",              shortcut: "t",   category: "Actions",    available: editable,          action: () => { setEditingTitle(true); requestAnimationFrame(() => titleInputRef.current?.focus()); } },
      { id: "draft",     label: "Reset to Draft",                          category: "Status",     available: spec.status === "failed" || spec.status === "cancelled", action: () => updateStatus(id, "draft") },
      { id: "pipeline",  label: "View Pipeline Run",                       category: "Navigation", available: !!activeRunId,      action: () => { if (activeRunId) router.push(`/pipelines/${activeRunId}`); } },
      { id: "dpipeline", label: "View Design Pipeline Run",                category: "Navigation", available: !!activeDesignRunId, action: () => { if (activeDesignRunId) router.push(`/design-pipelines/${activeDesignRunId}`); } },
      { id: "back",      label: "Back to Specifications",  shortcut: "Esc", category: "Navigation", available: true,              action: () => router.push("/specifications") },
    ].filter(c => c.available);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, editable, hasChanges, mode, chatOpen, activeRunId, activeDesignRunId, id]);

  const filteredCommands = useMemo(() => {
    if (!paletteQuery) return commands;
    return commands.filter(c => fuzzyMatch(c.label, paletteQuery));
  }, [commands, paletteQuery]);

  // -- Palette index clamping ----------------------------------------------

  useEffect(() => {
    setPaletteIndex(0);
  }, [paletteQuery]);

  useEffect(() => {
    setPaletteIndex(i => Math.min(i, Math.max(0, filteredCommands.length - 1)));
  }, [filteredCommands.length]);

  // -- Focus palette input when opened -------------------------------------

  useEffect(() => {
    if (paletteOpen) {
      setPaletteQuery("");
      setPaletteIndex(0);
      requestAnimationFrame(() => paletteInputRef.current?.focus());
    }
  }, [paletteOpen]);

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
      // LAYER 1: Palette open
      if (paletteOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setPaletteOpen(false);
          return;
        }
        if (e.key === "ArrowDown" || (e.key === "j" && !paletteQuery)) {
          e.preventDefault();
          setPaletteIndex(i => Math.min(i + 1, filteredCommands.length - 1));
          return;
        }
        if (e.key === "ArrowUp" || (e.key === "k" && !paletteQuery)) {
          e.preventDefault();
          setPaletteIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const cmd = filteredCommands[paletteIndex];
          if (cmd) {
            setPaletteOpen(false);
            cmd.action();
          }
          return;
        }
        // All other keys go to the input
        return;
      }

      // LAYER 2: Chat open
      if (chatOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setChatOpen(false);
          return;
        }
        return; // let chat handle keys
      }

      // LAYER 3: Title editing
      if (editingTitle) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEditingTitle(false);
        }
        return;
      }

      // LAYER 4: Edit mode (editor has focus)
      if (mode === "edit") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "TEXTAREA") return; // let editor handle

        if (e.key === "Escape") {
          e.preventDefault();
          setMode("read");
          return;
        }
      }

      // LAYER 5: Global shortcuts
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "p" || (e.ctrlKey && e.key === "k") || (e.metaKey && e.key === "k")) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        setMode(m => {
          const i = MODES.indexOf(m);
          return MODES[Math.max(0, i - 1)];
        });
      } else if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        setMode(m => {
          const i = MODES.indexOf(m);
          return MODES[Math.min(MODES.length - 1, i + 1)];
        });
      } else if (e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "c") {
        e.preventDefault();
        setChatOpen(v => !v);
      } else if (e.key === "t" && editable) {
        e.preventDefault();
        setEditingTitle(true);
        requestAnimationFrame(() => titleInputRef.current?.focus());
      } else if (e.key === "1") {
        e.preventDefault();
        setMode("read");
      } else if (e.key === "2" && editable) {
        e.preventDefault();
        setMode("edit");
      } else if (e.key === "3") {
        e.preventDefault();
        setMode("history");
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push("/specifications");
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [paletteOpen, paletteQuery, filteredCommands, paletteIndex, chatOpen, editingTitle, mode, editable, hasChanges, router, id, commands]);

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
  const viewOnlyEditor = !editable || mode === "read" || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber);

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* ================================================================= */}
      {/*  Header bar                                                       */}
      {/* ================================================================= */}
      <div className="shrink-0 border-b border-zinc-800/60 px-6 py-3">
        <div className="flex items-center gap-4">
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
              className="flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none border-b border-violet-500/50 pb-0.5 caret-violet-400"
              autoFocus
            />
          ) : (
            <span className="flex-1 text-sm font-medium text-zinc-200 truncate">{title}</span>
          )}

          {/* Status badge */}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${badge.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>

          {/* Version */}
          {latestVersion && (
            <span className="text-[11px] text-zinc-600 font-mono">v{latestVersion.versionNumber}</span>
          )}

          {/* Unsaved dot */}
          {hasChanges && editable && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400/80">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved
            </span>
          )}

          {/* Pipeline links */}
          {activeRunId && (
            <Link href={`/pipelines/${activeRunId}`} className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
              Pipeline
            </Link>
          )}
          {activeDesignRunId && (
            <Link href={`/design-pipelines/${activeDesignRunId}`} className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors">
              Design Pipeline
            </Link>
          )}

          {/* Command palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-all"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            Commands
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">p</kbd>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/*  Mode tab bar                                                     */}
      {/* ================================================================= */}
      <div className="shrink-0 px-6 py-2 border-b border-zinc-800/40">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-600 mr-2 flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">h</kbd>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">l</kbd>
          </span>
          {MODES.map((m, mi) => {
            const isActive = mode === m;
            const disabled = m === "edit" && !editable;
            return (
              <button
                key={m}
                onClick={() => !disabled && setMode(m)}
                disabled={disabled}
                className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                    : disabled
                      ? "text-zinc-700 cursor-not-allowed"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                }`}
              >
                <kbd className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                  isActive ? "bg-violet-500/20 text-violet-400" : "bg-zinc-800 text-zinc-600"
                }`}>{mi + 1}</kbd>
                {MODE_LABELS[m]}
                {m === "edit" && hasChanges && editable && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
              </button>
            );
          })}

          {/* Right side: save + pipeline */}
          <div className="ml-auto flex items-center gap-2">
            {/* Save button */}
            {editable && (
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                  hasChanges
                    ? "bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25"
                    : "text-zinc-600 border border-transparent cursor-default"
                } disabled:opacity-40`}
              >
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">s</kbd>
                {saving ? "Saving..." : "Save"}
              </button>
            )}

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
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/*  Content area                                                     */}
      {/* ================================================================= */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Viewing version banner */}
        {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 border-b border-blue-400/20 px-6 py-2 bg-blue-500/10 backdrop-blur-sm">
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
        {!editable && !viewingVersion && mode === "edit" && (
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 border-b border-white/[0.06] px-6 py-2 bg-white/[0.02]">
            <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="text-[11px] text-zinc-500">
              Read-only -- this specification is <span className="text-zinc-400 font-medium">{spec.status}</span>
            </span>
          </div>
        )}

        {/* Main content panel */}
        <div className={`flex-1 flex flex-col min-h-0 ${chatOpen ? "mr-[400px]" : ""} transition-all duration-300`}>
          {mode === "history" ? (
            <VersionHistory
              versions={versions}
              onRestore={handleRestore}
              onView={(versionContent, versionNumber) => {
                setViewingVersion({ content: versionContent, versionNumber });
                setMode("read");
              }}
              canRestore={editable}
              viewingVersionNumber={viewingVersion?.versionNumber ?? null}
              className="flex-1 overflow-y-auto"
            />
          ) : (
            <div className="flex-1 flex flex-col min-h-0 p-1">
              <MarkdownEditor
                value={viewingVersion ? viewingVersion.content : content}
                onChange={editable && !viewingVersion && mode === "edit" ? setContent : () => {}}
                placeholder="Begin writing your specification..."
                viewOnly={viewOnlyEditor}
              />
            </div>
          )}
        </div>

        {/* Chat side panel */}
        {chatOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-[400px] border-l border-zinc-800/60 bg-zinc-950/95 backdrop-blur-xl flex flex-col z-10"
            style={{ animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <div className="shrink-0 flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">AI Assistant</span>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AgentChat
              agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
              context={content}
              onApplySpec={handleApplySpec}
              className="flex-1"
            />
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/*  Command Palette Overlay                                          */}
      {/* ================================================================= */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setPaletteOpen(false)}
            style={{ animation: "fadeIn 0.15s ease-out" }}
          />

          {/* Palette card */}
          <div
            className="relative w-full max-w-lg rounded-xl border border-white/[0.1] bg-zinc-900/95 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden"
            style={{ animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <svg className="h-4 w-4 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={paletteInputRef}
                type="text"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
              />
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">Esc</kbd>
            </div>

            {/* Command list */}
            <div className="max-h-[300px] overflow-y-auto py-2">
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-600">No matching commands</div>
              ) : (
                (() => {
                  let lastCategory = "";
                  return filteredCommands.map((cmd, i) => {
                    const showCategory = cmd.category !== lastCategory;
                    lastCategory = cmd.category;
                    const isSelected = i === paletteIndex;
                    return (
                      <div key={cmd.id}>
                        {showCategory && (
                          <div className="px-4 pt-2 pb-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                            {cmd.category}
                          </div>
                        )}
                        <div
                          onClick={() => {
                            setPaletteOpen(false);
                            cmd.action();
                          }}
                          onMouseMove={() => {
                            if (mouseActive && paletteIndex !== i) setPaletteIndex(i);
                          }}
                          className={`mx-2 flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-violet-500/10 border-l-2 border-l-violet-500/60"
                              : "border-l-2 border-l-transparent hover:bg-white/[0.03]"
                          }`}
                        >
                          <span className={`text-[13px] ${isSelected ? "text-zinc-100" : "text-zinc-400"}`}>
                            <FuzzyText text={cmd.label} query={paletteQuery} />
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isSelected && (
                              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Enter</kbd>
                            )}
                            {cmd.shortcut && (
                              <kbd className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                isSelected ? "bg-violet-500/15 text-violet-400" : "bg-zinc-800 text-zinc-600"
                              }`}>{cmd.shortcut}</kbd>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/*  Bottom hints bar                                                 */}
      {/* ================================================================= */}
      <div className="shrink-0 border-t border-zinc-800 px-6 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">h</kbd>
          {" "}
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">l</kbd>
          {" mode"}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">p</kbd>
          {" commands"}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">s</kbd>
          {" save"}
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
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">1</kbd>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500 ml-0.5">2</kbd>
          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500 ml-0.5">3</kbd>
          {" tabs"}
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
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
