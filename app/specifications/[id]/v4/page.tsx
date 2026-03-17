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

// =============================================================================
// Types & Constants
// =============================================================================

type Tab = "content" | "history" | "chat";
const TABS: { key: Tab; label: string; shortcut: string }[] = [
  { key: "content", label: "content", shortcut: "1" },
  { key: "history", label: "history", shortcut: "2" },
  { key: "chat",    label: "chat",    shortcut: "3" },
];

const TERMINAL_COMMANDS = [
  { cmd: "save",     desc: "Save current changes" },
  { cmd: "quit",     desc: "Back to specifications list" },
  { cmd: "history",  desc: "Switch to history tab" },
  { cmd: "chat",     desc: "Switch to chat tab" },
  { cmd: "pipeline", desc: "Trigger pipeline run" },
  { cmd: "title",    desc: "Set title (e.g. :title New Name)" },
  { cmd: "status",   desc: "Set status (e.g. :status draft)" },
  { cmd: "info",     desc: "Show spec info" },
];

const STATUS_CONFIG: Record<SpecificationStatus, { label: string; color: string; dotColor: string }> = {
  chat:      { label: "Chat", color: "text-cyan-400", dotColor: "bg-cyan-400" },
  draft:     { label: "draft",     color: "text-zinc-400",    dotColor: "bg-zinc-400" },
  pipeline:  { label: "pipeline",  color: "text-emerald-400", dotColor: "bg-emerald-400" },
  failed:    { label: "failed",    color: "text-red-400",     dotColor: "bg-red-400" },
  cancelled: { label: "cancelled", color: "text-amber-400",   dotColor: "bg-amber-400" },
  done:      { label: "done",      color: "text-emerald-400", dotColor: "bg-emerald-400" },
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

// =============================================================================
// Component
// =============================================================================

export default function SpecV4Page({ params }: { params: Promise<{ id: string }> }) {
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

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);

  // Tab & command state
  const [activeTab, setActiveTab] = useState<Tab>("content");
  const [commandMode, setCommandMode] = useState(false);
  const [commandInput, setCommandInput] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [flashMsg, setFlashMsg] = useState<{ text: string; type: "ok" | "err" | "info" } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Refs
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

  const contentSource = viewingVersion ? viewingVersion.content : content;
  const lineCount = useMemo(() => contentSource.split("\n").length, [contentSource]);
  const wordCount = useMemo(() => contentSource.trim() ? contentSource.trim().split(/\s+/).length : 0, [contentSource]);
  const charCount = contentSource.length;

  const statusCfg = spec ? STATUS_CONFIG[spec.status] : STATUS_CONFIG.draft;

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
    setLastSavedAt(new Date(spec.updatedAt));
  }, [loaded, spec, latestVersion]);

  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  // ---------------------------------------------------------------------------
  // Flash messages
  // ---------------------------------------------------------------------------

  const flash = (text: string, type: "ok" | "err" | "info" = "info") => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMsg({ text, type });
    flashTimerRef.current = setTimeout(() => setFlashMsg(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // Core actions
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!spec || !editable) {
      flash("error: read-only buffer", "err");
      return;
    }
    setSaving(true);
    try {
      if (title !== spec.title) await updateTitle(id, title);
      await saveVersion(id, content, undefined);
      initialContentRef.current = content;
      setHasChanges(false);
      setLastSavedAt(new Date());
      flash(`written: ${title}`, "ok");
    } catch {
      flash("error: save failed", "err");
    } finally {
      setSaving(false);
    }
  };

  const handleApplySpec = (specContent: string) => {
    if (editable) {
      setContent(specContent);
      setActiveTab("content");
      flash("spec applied from chat", "ok");
    }
  };

  const handleRestore = (restoredContent: string) => {
    if (editable) {
      setContent(restoredContent);
      setViewingVersion(null);
      setActiveTab("content");
      flash("version restored", "ok");
    }
  };

  // ---------------------------------------------------------------------------
  // Command execution
  // ---------------------------------------------------------------------------

  const executeCommand = async (raw: string) => {
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0];
    const arg = parts.slice(1).join(" ");

    if (!cmd) return;

    switch (cmd) {
      case "save":
      case "w":
        await handleSave();
        break;
      case "quit":
      case "q":
        router.push("/specifications");
        break;
      case "wq":
        await handleSave();
        router.push("/specifications");
        break;
      case "history":
        setActiveTab("history");
        flash("switched to history", "info");
        break;
      case "chat":
        setActiveTab("chat");
        flash("switched to chat", "info");
        break;
      case "content":
        setActiveTab("content");
        flash("switched to content", "info");
        break;
      case "pipeline":
        flash("pipeline trigger requested", "info");
        break;
      case "title":
        if (arg) {
          setTitle(arg);
          flash(`title set: ${arg}`, "ok");
        } else {
          flash(`current title: ${title}`, "info");
        }
        break;
      case "status": {
        const validStatuses: SpecificationStatus[] = ["draft", "done", "cancelled"];
        const newStatus = arg as SpecificationStatus;
        if (validStatuses.includes(newStatus)) {
          await updateStatus(id, newStatus);
          flash(`status -> ${newStatus}`, "ok");
        } else {
          flash(`invalid status: ${arg || "(empty)"}`, "err");
        }
        break;
      }
      case "info":
        flash(`${spec?.type || "?"} | v${latestVersion?.versionNumber ?? 0} | ${versions.length} versions | ${lineCount}L ${wordCount}W`, "info");
        break;
      default:
        flash(`unknown command: ${cmd}`, "err");
    }
  };

  // Command autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!commandInput) return [];
    const q = commandInput.toLowerCase();
    return TERMINAL_COMMANDS.filter(
      (c) => c.cmd.startsWith(q) || c.desc.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [commandInput]);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command mode input handling
      if (commandMode) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setCommandMode(false);
          setCommandInput("");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          executeCommand(commandInput);
          setCommandMode(false);
          setCommandInput("");
          return;
        }
        if (e.key === "Tab" && suggestions.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setCommandInput(suggestions[0].cmd);
          return;
        }
        return; // let input handle rest
      }

      // Title editing
      if (editingTitle) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          setEditingTitle(false);
          titleInputRef.current?.blur();
        }
        return;
      }

      // Skip if user is typing in an input/textarea within MarkdownEditor or AgentChat
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (isEditing) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
          e.preventDefault();
        }
        return;
      }

      // Global shortcuts
      if (e.key === ":") {
        e.preventDefault();
        e.stopPropagation();
        setCommandMode(true);
        setCommandInput("");
        setTimeout(() => commandInputRef.current?.focus(), 0);
        return;
      }

      // Tab switching with number keys
      if (e.key === "1") { e.preventDefault(); setActiveTab("content"); return; }
      if (e.key === "2") { e.preventDefault(); setActiveTab("history"); return; }
      if (e.key === "3") { e.preventDefault(); setActiveTab("chat"); return; }

      // h/l for tab switching
      if (e.key === "h") {
        e.preventDefault();
        const idx = TABS.findIndex((t) => t.key === activeTab);
        if (idx > 0) setActiveTab(TABS[idx - 1].key);
        return;
      }
      if (e.key === "l") {
        e.preventDefault();
        const idx = TABS.findIndex((t) => t.key === activeTab);
        if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].key);
        return;
      }

      // Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // Escape to close panels / go back
      if (e.key === "Escape") {
        e.preventDefault();
        if (activeTab !== "content") {
          setActiveTab("content");
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [commandMode, commandInput, suggestions, activeTab, editingTitle]);

  // Focus command input
  useEffect(() => {
    if (commandMode) commandInputRef.current?.focus();
  }, [commandMode]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 font-mono">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-emerald-500 text-sm">
            <span className="animate-pulse">$</span>
            <span className="text-zinc-500">loading spec...</span>
            <span className="animate-pulse text-emerald-400">_</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 font-mono">
        <div className="border border-red-900/40 bg-red-950/20 rounded-lg px-6 py-4 text-center">
          <p className="text-red-400 text-sm">error: spec not found</p>
          <p className="mt-1 text-zinc-600 text-xs">The requested specification does not exist.</p>
        </div>
        <button
          onClick={() => router.push("/specifications")}
          className="text-xs font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          $ cd /specifications
        </button>
      </div>
    );
  }

  const titleSlug = slugify(title);

  return (
    <div className="relative flex h-full flex-col bg-zinc-950 text-zinc-100 font-mono overflow-hidden">

      {/* ================================================================== */}
      {/*  TERMINAL TITLE BAR                                                */}
      {/* ================================================================== */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        {/* Window buttons (decorative) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push("/specifications")}
            className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-400 transition-colors"
            title="Close"
          />
          <span className="w-3 h-3 rounded-full bg-amber-500/80" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
        </div>

        {/* Title bar content */}
        <div className="flex-1 flex items-center justify-center gap-2 text-xs text-zinc-500 overflow-hidden">
          <span className="text-emerald-500/70">spec://</span>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  setEditingTitle(false);
                  titleInputRef.current?.blur();
                }
              }}
              className="bg-transparent text-zinc-200 text-xs outline-none caret-emerald-400 max-w-[300px] border-b border-emerald-500/40"
              autoFocus
            />
          ) : (
            <button
              onClick={() => editable && setEditingTitle(true)}
              className={`text-zinc-300 truncate max-w-[300px] ${editable ? "hover:text-emerald-400 cursor-text" : "cursor-default"}`}
            >
              {titleSlug}
            </button>
          )}
          <span className="text-zinc-700">|</span>
          <span className={`flex items-center gap-1 ${statusCfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor} ${spec.status === "pipeline" ? "animate-pulse" : ""}`} />
            {statusCfg.label}
          </span>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500">v{latestVersion?.versionNumber ?? 0}</span>
          {hasChanges && (
            <>
              <span className="text-zinc-700">|</span>
              <span className="text-amber-400">[+]</span>
            </>
          )}

          {/* Pipeline links */}
          {activeRunId && (
            <>
              <span className="text-zinc-700">|</span>
              <Link href={`/pipelines/${activeRunId}`} className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                pipeline
              </Link>
            </>
          )}
          {activeDesignRunId && (
            <>
              <span className="text-zinc-700">|</span>
              <Link href={`/design-pipelines/${activeDesignRunId}`} className="text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                design
              </Link>
            </>
          )}
        </div>

        {/* Right: close button as text */}
        <button
          onClick={() => router.push("/specifications")}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          :quit
        </button>
      </div>

      {/* ================================================================== */}
      {/*  TAB BAR                                                           */}
      {/* ================================================================== */}
      <div className="shrink-0 flex items-center bg-zinc-900/60 border-b border-zinc-800">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const showModified = tab.key === "content" && hasChanges;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                relative flex items-center gap-1.5 px-4 py-2 text-xs transition-all duration-150
                border-r border-zinc-800/60
                ${isActive
                  ? "bg-zinc-950 text-emerald-400 border-b-2 border-b-emerald-500"
                  : "bg-zinc-900/40 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 border-b-2 border-b-transparent"
                }
              `}
            >
              <kbd className={`text-[10px] px-1 py-0.5 rounded ${isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-zinc-800 text-zinc-600"}`}>
                {tab.shortcut}
              </kbd>
              <span>{tab.label}</span>
              {showModified && (
                <span className="text-amber-400 text-[10px]">[+]</span>
              )}
            </button>
          );
        })}

        {/* Right side: pipeline trigger buttons */}
        <div className="ml-auto flex items-center gap-1 px-2">
          {/* Reset to draft */}
          {(spec.status === "failed" || spec.status === "cancelled") && (
            <button
              onClick={() => updateStatus(id, "draft")}
              className="text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors px-2 py-1"
            >
              [reset to draft]
            </button>
          )}

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

      {/* ================================================================== */}
      {/*  MAIN CONTENT AREA                                                 */}
      {/* ================================================================== */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Version viewing banner */}
        {activeTab === "content" && viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-emerald-950/30 border-b border-emerald-800/30">
            <span className="text-xs text-emerald-400">
              viewing v{viewingVersion.versionNumber}
            </span>
            <button
              onClick={() => setViewingVersion(null)}
              className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              [back to current]
            </button>
          </div>
        )}

        {/* Read-only banner */}
        {activeTab === "content" && !editable && !viewingVersion && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
            <span className="text-xs text-zinc-600">-- READ ONLY -- status: {spec.status}</span>
            {(spec.status === "failed" || spec.status === "cancelled") && (
              <span className="text-xs text-zinc-700">| :status draft to unlock</span>
            )}
          </div>
        )}

        {/* Tab: Content */}
        {activeTab === "content" && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Line count gutter decoration */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-zinc-800/40 bg-zinc-900/20">
              <span className="text-[10px] text-zinc-700">{lineCount} lines</span>
              <span className="text-[10px] text-zinc-800">|</span>
              <span className="text-[10px] text-zinc-700">{spec.type === "ui-refactor" ? "ui-refactor" : "feature"}</span>
              <span className="text-[10px] text-zinc-800">|</span>
              <span className="text-[10px] text-zinc-700">
                {new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
            <div className="flex-1 min-h-0 p-1">
              <MarkdownEditor
                value={viewingVersion ? viewingVersion.content : content}
                onChange={editable && !viewingVersion ? setContent : () => {}}
                placeholder="Begin writing your specification..."
                viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
              />
            </div>
          </div>
        )}

        {/* Tab: History */}
        {activeTab === "history" && (
          <VersionHistory
            versions={versions}
            onRestore={(restoredContent) => {
              handleRestore(restoredContent);
            }}
            onView={(versionContent, versionNumber) => {
              setViewingVersion({ content: versionContent, versionNumber });
              setActiveTab("content");
            }}
            canRestore={editable}
            viewingVersionNumber={viewingVersion?.versionNumber ?? null}
            className="flex-1"
          />
        )}

        {/* Tab: Chat */}
        {activeTab === "chat" && (
          <AgentChat
            agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
            context={content}
            onApplySpec={handleApplySpec}
            className="flex-1"
          />
        )}
      </div>

      {/* ================================================================== */}
      {/*  STATUS BAR (VS Code style)                                        */}
      {/* ================================================================== */}
      <div className="shrink-0 flex items-center justify-between bg-emerald-900/20 border-t border-emerald-800/20 px-3 py-1">
        {/* Left side */}
        <div className="flex items-center gap-3">
          {/* Branch / spec info */}
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/80">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            spec/{titleSlug}
          </span>

          {/* Status */}
          <span className={`flex items-center gap-1 text-[11px] ${statusCfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
            {statusCfg.label}
          </span>

          {/* Save status */}
          {saving ? (
            <span className="text-[11px] text-emerald-400 animate-pulse">saving...</span>
          ) : hasChanges ? (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              modified
            </span>
          ) : (
            <span className="text-[11px] text-zinc-600">saved</span>
          )}

          {/* Flash message */}
          {flashMsg && (
            <span className={`text-[11px] ${
              flashMsg.type === "err" ? "text-red-400" :
              flashMsg.type === "ok" ? "text-emerald-400" :
              "text-zinc-400"
            }`}>
              {flashMsg.text}
            </span>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span>{lineCount}L</span>
          <span>{wordCount}W</span>
          <span>{charCount}C</span>
          {lastSavedAt && (
            <span className="text-zinc-600">
              {lastSavedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <span className="text-zinc-600">v{latestVersion?.versionNumber ?? 0}</span>
        </div>
      </div>

      {/* ================================================================== */}
      {/*  COMMAND INPUT (at very bottom)                                     */}
      {/* ================================================================== */}
      <div className="shrink-0 relative">
        {/* Suggestions above command line */}
        {commandMode && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-10">
            {suggestions.map((s) => (
              <button
                key={s.cmd}
                className="w-full text-left px-4 py-1.5 text-xs flex items-center gap-3 hover:bg-zinc-800/60 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCommandInput(s.cmd);
                }}
              >
                <span className="text-emerald-400">:{s.cmd}</span>
                <span className="text-zinc-600">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {commandMode ? (
          <div className="flex items-center bg-zinc-900 border-t border-zinc-800">
            <span className="pl-3 pr-1 text-sm text-emerald-500 select-none">$</span>
            <input
              ref={commandInputRef}
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              className="flex-1 bg-transparent text-sm text-zinc-100 py-2 pr-4 outline-none caret-emerald-400 placeholder:text-zinc-700"
              placeholder="type command..."
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center gap-4 bg-zinc-950 border-t border-zinc-800/40 px-3 py-1">
            <span className="text-[10px] text-zinc-700">
              <kbd className="text-zinc-500">1</kbd>-<kbd className="text-zinc-500">3</kbd> tabs
            </span>
            <span className="text-[10px] text-zinc-700">
              <kbd className="text-zinc-500">h</kbd>/<kbd className="text-zinc-500">l</kbd> prev/next
            </span>
            <span className="text-[10px] text-zinc-700">
              <kbd className="text-zinc-500">:</kbd> command
            </span>
            <span className="text-[10px] text-zinc-700">
              <kbd className="text-zinc-500">Ctrl+S</kbd> save
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
