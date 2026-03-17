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
// Types
// =============================================================================

type VimMode = "NORMAL" | "INSERT" | "COMMAND";
type Block = "title" | "metadata" | "content" | "actions";

const BLOCKS: Block[] = ["title", "metadata", "content", "actions"];

const COMMANDS = [
  { cmd: "w", desc: "Save" },
  { cmd: "q", desc: "Back to list" },
  { cmd: "wq", desc: "Save and back" },
  { cmd: "history", desc: "Toggle version history" },
  { cmd: "chat", desc: "Toggle AI chat" },
  { cmd: "run", desc: "Trigger pipeline" },
  { cmd: "status draft", desc: "Set status to draft" },
  { cmd: "status done", desc: "Set status to done" },
  { cmd: "status cancelled", desc: "Set status to cancelled" },
  { cmd: "version", desc: "Show version info" },
  { cmd: "e", desc: "Edit current block" },
];

const STATUS_STYLES: Record<SpecificationStatus, { label: string; dot: string; text: string }> = {
  chat:      { label: "CHAT",      dot: "bg-cyan-400", text: "text-cyan-400" },
  draft:     { label: "DRAFT",     dot: "bg-zinc-400",    text: "text-zinc-400" },
  pipeline:  { label: "PIPELINE",  dot: "bg-blue-400",    text: "text-blue-400" },
  failed:    { label: "FAILED",    dot: "bg-red-400",     text: "text-red-400" },
  cancelled: { label: "CANCELLED", dot: "bg-amber-400",   text: "text-amber-400" },
  done:      { label: "DONE",      dot: "bg-emerald-400", text: "text-emerald-400" },
};

// =============================================================================
// Component
// =============================================================================

export default function SpecV3Page({ params }: { params: Promise<{ id: string }> }) {
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

  // Vim state
  const [mode, setMode] = useState<VimMode>("NORMAL");
  const [selectedBlock, setSelectedBlock] = useState<number>(0);
  const [commandInput, setCommandInput] = useState("");
  const [commandMessage, setCommandMessage] = useState<{ text: string; type: "info" | "error" | "success" } | null>(null);

  // Panel state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Refs
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

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
  }, [loaded, spec, latestVersion]);

  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  // ---------------------------------------------------------------------------
  // Flash message helper
  // ---------------------------------------------------------------------------

  const flashMessage = (text: string, type: "info" | "error" | "success" = "info") => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setCommandMessage({ text, type });
    messageTimerRef.current = setTimeout(() => setCommandMessage(null), 3000);
  };

  // ---------------------------------------------------------------------------
  // Core actions
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!spec || !editable) {
      flashMessage("E: Cannot save - specification is read-only", "error");
      return;
    }
    setSaving(true);
    try {
      if (title !== spec.title) await updateTitle(id, title);
      await saveVersion(id, content, undefined);
      initialContentRef.current = content;
      setHasChanges(false);
      flashMessage(`"${title}" written`, "success");
    } catch {
      flashMessage("E: Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleApplySpec = (specContent: string) => {
    if (editable) {
      setContent(specContent);
      flashMessage("Specification applied from AI chat", "success");
    }
  };

  const handleRestore = (restoredContent: string) => {
    if (editable) {
      setContent(restoredContent);
      setViewingVersion(null);
      flashMessage("Version restored", "success");
    }
  };

  // ---------------------------------------------------------------------------
  // Command execution
  // ---------------------------------------------------------------------------

  const executeCommand = async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;

    if (cmd === "w") {
      await handleSave();
    } else if (cmd === "q") {
      router.push("/specifications");
    } else if (cmd === "wq") {
      await handleSave();
      router.push("/specifications");
    } else if (cmd === "history") {
      setHistoryOpen((v) => !v);
      if (!historyOpen) setChatOpen(false);
      flashMessage(historyOpen ? "History closed" : "History opened", "info");
    } else if (cmd === "chat") {
      setChatOpen((v) => !v);
      if (!chatOpen) setHistoryOpen(false);
      flashMessage(chatOpen ? "Chat closed" : "Chat opened", "info");
    } else if (cmd === "run") {
      flashMessage("Pipeline triggered", "info");
    } else if (cmd === "e") {
      if (editable) {
        setMode("INSERT");
        flashMessage("-- INSERT --", "info");
      } else {
        flashMessage("E: Read-only specification", "error");
      }
    } else if (cmd === "version") {
      flashMessage(`Version ${latestVersion?.versionNumber ?? 0} | ${versions.length} total versions`, "info");
    } else if (cmd.startsWith("status ")) {
      const newStatus = cmd.slice(7).trim() as SpecificationStatus;
      const validStatuses: SpecificationStatus[] = ["draft", "done", "cancelled"];
      if (validStatuses.includes(newStatus)) {
        await updateStatus(id, newStatus);
        flashMessage(`Status changed to ${newStatus}`, "success");
      } else {
        flashMessage(`E: Invalid status "${newStatus}"`, "error");
      }
    } else {
      flashMessage(`E: Not a command: ${cmd}`, "error");
    }
  };

  // Command autocomplete
  const commandSuggestions = useMemo(() => {
    if (!commandInput) return [];
    const q = commandInput.toLowerCase();
    return COMMANDS.filter(
      (c) => c.cmd.toLowerCase().startsWith(q) || c.desc.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [commandInput]);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // COMMAND mode
      if (mode === "COMMAND") {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setMode("NORMAL");
          setCommandInput("");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          executeCommand(commandInput);
          setMode("NORMAL");
          setCommandInput("");
          return;
        }
        if (e.key === "Tab" && commandSuggestions.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setCommandInput(commandSuggestions[0].cmd);
          return;
        }
        // Let the input handle other keys
        return;
      }

      // INSERT mode
      if (mode === "INSERT") {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setMode("NORMAL");
          titleInputRef.current?.blur();
          return;
        }
        // Let editing happen normally
        return;
      }

      // NORMAL mode
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedBlock((prev) => Math.min(prev + 1, BLOCKS.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedBlock((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "i") {
        e.preventDefault();
        e.stopPropagation();
        if (!editable) {
          flashMessage("E: Read-only specification", "error");
          return;
        }
        setMode("INSERT");
        if (BLOCKS[selectedBlock] === "title") {
          setTimeout(() => titleInputRef.current?.focus(), 0);
        }
      } else if (e.key === ":") {
        e.preventDefault();
        e.stopPropagation();
        setMode("COMMAND");
        setCommandInput("");
        setTimeout(() => commandInputRef.current?.focus(), 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const block = BLOCKS[selectedBlock];
        if (block === "actions") {
          // cycle through actions
        } else if (editable) {
          setMode("INSERT");
          if (block === "title") {
            setTimeout(() => titleInputRef.current?.focus(), 0);
          }
        }
      } else if (e.key === "g") {
        e.preventDefault();
        setSelectedBlock(0);
      } else if (e.key === "G") {
        e.preventDefault();
        setSelectedBlock(BLOCKS.length - 1);
      } else if (e.key === "Escape") {
        if (historyOpen || chatOpen) {
          e.preventDefault();
          setHistoryOpen(false);
          setChatOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [mode, selectedBlock, commandInput, commandSuggestions, editable, historyOpen, chatOpen]);

  // Focus command input when entering COMMAND mode
  useEffect(() => {
    if (mode === "COMMAND") {
      commandInputRef.current?.focus();
    }
  }, [mode]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const blockBorderClass = (block: Block) => {
    const idx = BLOCKS.indexOf(block);
    const isSelected = idx === selectedBlock;
    if (!isSelected) return "border-l-2 border-l-transparent";
    if (mode === "INSERT") return "border-l-2 border-l-amber-400";
    return "border-l-2 border-l-violet-400";
  };

  const blockBgClass = (block: Block) => {
    const idx = BLOCKS.indexOf(block);
    const isSelected = idx === selectedBlock;
    if (!isSelected) return "";
    if (mode === "INSERT") return "bg-amber-400/[0.03]";
    return "bg-violet-400/[0.04]";
  };

  const modeColor = mode === "INSERT" ? "text-amber-400" : mode === "COMMAND" ? "text-emerald-400" : "text-violet-400";
  const modeBgColor = mode === "INSERT" ? "bg-amber-400/10" : mode === "COMMAND" ? "bg-emerald-400/10" : "bg-violet-400/10";

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-zinc-800 border-t-violet-500 animate-spin" />
          <span className="text-xs text-zinc-600 font-mono">Loading...</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950">
        <div className="text-center font-mono">
          <p className="text-zinc-400 text-sm">E404: Specification not found</p>
          <p className="mt-1 text-zinc-600 text-xs">Buffer does not exist or has been deleted.</p>
        </div>
        <button
          onClick={() => router.push("/specifications")}
          className="text-xs font-mono text-violet-400 hover:text-violet-300 transition-colors"
        >
          :q &lt;Enter&gt; to go back
        </button>
      </div>
    );
  }

  const panelOpen = chatOpen || historyOpen;
  const statusInfo = STATUS_STYLES[spec.status];

  return (
    <div className="relative flex h-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden">

      {/* ================================================================== */}
      {/*  MAIN CONTENT AREA                                                 */}
      {/* ================================================================== */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT: Block list */}
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">

          {/* ---- TITLE BLOCK ---- */}
          <div
            className={`${blockBorderClass("title")} ${blockBgClass("title")} px-6 py-5 transition-all duration-150 cursor-pointer`}
            onClick={() => {
              setSelectedBlock(0);
              if (mode === "NORMAL" && editable) {
                setMode("INSERT");
                setTimeout(() => titleInputRef.current?.focus(), 0);
              }
            }}
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Title</span>
              {selectedBlock === 0 && mode === "NORMAL" && (
                <span className="text-[10px] font-mono text-zinc-600">
                  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800/60 text-zinc-400 text-[10px] font-mono">i</kbd>
                  {" "}to edit
                </span>
              )}
            </div>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={mode !== "INSERT" || selectedBlock !== 0 || !editable}
              className={`
                w-full bg-transparent text-2xl font-light tracking-tight outline-none
                placeholder:text-zinc-700 transition-colors duration-150
                ${mode === "INSERT" && selectedBlock === 0 ? "text-zinc-100 caret-amber-400" : "text-zinc-200"}
                ${!editable ? "cursor-default" : ""}
              `}
              placeholder="Untitled"
              onFocus={() => {
                if (mode === "NORMAL") {
                  setSelectedBlock(0);
                  setMode("INSERT");
                }
              }}
            />
          </div>

          {/* ---- METADATA BLOCK ---- */}
          <div
            className={`${blockBorderClass("metadata")} ${blockBgClass("metadata")} px-6 py-4 border-t border-zinc-800/50 transition-all duration-150 cursor-pointer`}
            onClick={() => setSelectedBlock(1)}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Metadata</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusInfo.dot} ${spec.status === "pipeline" ? "animate-pulse" : ""}`} />
                <span className={`text-xs font-mono ${statusInfo.text}`}>{statusInfo.label}</span>
              </div>

              <span className="text-zinc-800">|</span>

              {/* Version */}
              <span className="text-xs font-mono text-zinc-500">
                v{latestVersion?.versionNumber ?? 0}
              </span>

              <span className="text-zinc-800">|</span>

              {/* Type */}
              <span className="text-xs font-mono text-zinc-500">
                {spec.type === "ui-refactor" ? "ui-refactor" : "feature"}
              </span>

              <span className="text-zinc-800">|</span>

              {/* Updated */}
              <span className="text-xs font-mono text-zinc-600">
                {new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>

              {/* Modified indicator */}
              {hasChanges && (
                <>
                  <span className="text-zinc-800">|</span>
                  <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    modified
                  </span>
                </>
              )}

              {/* Pipeline links */}
              {activeRunId && (
                <>
                  <span className="text-zinc-800">|</span>
                  <Link
                    href={`/pipelines/${activeRunId}`}
                    className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    pipeline
                  </Link>
                </>
              )}
              {activeDesignRunId && (
                <>
                  <span className="text-zinc-800">|</span>
                  <Link
                    href={`/design-pipelines/${activeDesignRunId}`}
                    className="text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                    design pipeline
                  </Link>
                </>
              )}
            </div>

            {/* Reset to draft for failed/cancelled */}
            {(spec.status === "failed" || spec.status === "cancelled") && (
              <button
                type="button"
                onClick={() => updateStatus(id, "draft")}
                className="mt-3 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                :status draft &lt;Enter&gt; to reset
              </button>
            )}
          </div>

          {/* ---- CONTENT BLOCK ---- */}
          <div
            className={`${blockBorderClass("content")} ${blockBgClass("content")} flex-1 min-h-0 flex flex-col border-t border-zinc-800/50 transition-all duration-150`}
            onClick={() => setSelectedBlock(2)}
          >
            <div className="flex items-center gap-3 px-6 pt-4 pb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Content</span>
              {selectedBlock === 2 && mode === "NORMAL" && editable && (
                <span className="text-[10px] font-mono text-zinc-600">
                  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800/60 text-zinc-400 text-[10px] font-mono">i</kbd>
                  {" "}to edit
                </span>
              )}
              {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] font-mono text-blue-400">
                    viewing v{viewingVersion.versionNumber}
                  </span>
                  <button
                    onClick={() => setViewingVersion(null)}
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    [back to current]
                  </button>
                </div>
              )}
              {!editable && !viewingVersion && (
                <span className="text-[10px] font-mono text-zinc-600 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  read-only
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 px-1 pb-1">
              <MarkdownEditor
                value={viewingVersion ? viewingVersion.content : content}
                onChange={editable && !viewingVersion && mode === "INSERT" && selectedBlock === 2 ? setContent : () => {}}
                placeholder="Begin writing your specification..."
                viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber) || mode !== "INSERT" || selectedBlock !== 2}
              />
            </div>
          </div>

          {/* ---- ACTIONS BLOCK ---- */}
          <div
            className={`${blockBorderClass("actions")} ${blockBgClass("actions")} px-6 py-4 border-t border-zinc-800/50 transition-all duration-150 cursor-pointer`}
            onClick={() => setSelectedBlock(3)}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Actions</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges || !editable}
                className={`
                  inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono
                  border transition-all duration-150
                  ${hasChanges && editable
                    ? "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-600 cursor-not-allowed"
                  }
                `}
              >
                {saving ? "saving..." : ":w save"}
              </button>

              {/* History */}
              <button
                onClick={() => {
                  setHistoryOpen((v) => !v);
                  if (!historyOpen) setChatOpen(false);
                }}
                className={`
                  inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono
                  border transition-all duration-150
                  ${historyOpen
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  }
                `}
              >
                :history
              </button>

              {/* Chat */}
              <button
                onClick={() => {
                  setChatOpen((v) => !v);
                  if (!chatOpen) setHistoryOpen(false);
                }}
                className={`
                  inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono
                  border transition-all duration-150
                  ${chatOpen
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  }
                `}
              >
                :chat
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
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/*  RIGHT PANEL: History / Chat                                     */}
        {/* ================================================================ */}
        {panelOpen && (
          <div
            className="w-[480px] shrink-0 border-l border-zinc-800/60 flex flex-col bg-zinc-950/90 backdrop-blur-xl"
            style={{ animation: "v3SlideIn 0.2s ease-out" }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
              <span className="text-xs font-mono text-zinc-400">
                {historyOpen ? ":history" : ":chat"}
              </span>
              <button
                onClick={() => { setHistoryOpen(false); setChatOpen(false); }}
                className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                [Esc close]
              </button>
            </div>

            {/* Panel content */}
            {historyOpen && (
              <VersionHistory
                versions={versions}
                onRestore={(restoredContent) => {
                  handleRestore(restoredContent);
                  setHistoryOpen(false);
                }}
                onView={(versionContent, versionNumber) => {
                  setViewingVersion({ content: versionContent, versionNumber });
                }}
                canRestore={editable}
                viewingVersionNumber={viewingVersion?.versionNumber ?? null}
                className="flex-1"
              />
            )}
            {chatOpen && (
              <AgentChat
                agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
                context={content}
                onApplySpec={(specContent) => {
                  handleApplySpec(specContent);
                  setChatOpen(false);
                }}
                className="flex-1"
              />
            )}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/*  COMMAND LINE / STATUS LINE                                        */}
      {/* ================================================================== */}
      <div className="relative shrink-0">

        {/* Command suggestions (above command line) */}
        {mode === "COMMAND" && commandSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-10">
            {commandSuggestions.map((s) => (
              <button
                key={s.cmd}
                className="w-full text-left px-4 py-1.5 text-xs font-mono flex items-center gap-3 hover:bg-zinc-800/60 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCommandInput(s.cmd);
                }}
              >
                <span className="text-violet-400">:{s.cmd}</span>
                <span className="text-zinc-600">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Command input line */}
        {mode === "COMMAND" ? (
          <div className="flex items-center bg-zinc-900 border-t border-zinc-800">
            <span className="pl-4 pr-1 text-sm font-mono text-zinc-300 select-none">:</span>
            <input
              ref={commandInputRef}
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              className="flex-1 bg-transparent text-sm font-mono text-zinc-100 py-2 pr-4 outline-none caret-emerald-400 placeholder:text-zinc-700"
              placeholder="type a command..."
              autoFocus
            />
          </div>
        ) : (
          /* Status line (like vim's bottom bar) */
          <div className="flex items-center justify-between bg-zinc-900 border-t border-zinc-800 px-4 py-1.5">
            {/* Left: Mode indicator */}
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono font-bold ${modeColor} ${modeBgColor} px-2 py-0.5 rounded`}>
                -- {mode} --
              </span>

              {/* Flash message */}
              {commandMessage && (
                <span className={`text-xs font-mono ${
                  commandMessage.type === "error" ? "text-red-400" :
                  commandMessage.type === "success" ? "text-emerald-400" :
                  "text-zinc-400"
                }`}>
                  {commandMessage.text}
                </span>
              )}
            </div>

            {/* Center: File info */}
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <span className="text-zinc-400 truncate max-w-[200px]">{title || "Untitled"}</span>
              {hasChanges && <span className="text-amber-400">[+]</span>}
              <span className={statusInfo.text}>[{statusInfo.label.toLowerCase()}]</span>
              <span>v{latestVersion?.versionNumber ?? 0}</span>
            </div>

            {/* Right: Position info */}
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-600">
              <span>{BLOCKS[selectedBlock]}</span>
              <span>{selectedBlock + 1}/{BLOCKS.length}</span>
            </div>
          </div>
        )}

        {/* Bottom hints bar */}
        {mode === "NORMAL" && !commandMessage && (
          <div className="flex items-center gap-4 bg-zinc-950 border-t border-zinc-900 px-4 py-1">
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">j</kbd>/<kbd className="text-zinc-500">k</kbd> navigate
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">i</kbd> insert
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">:</kbd> command
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">Enter</kbd> edit block
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">g</kbd>/<kbd className="text-zinc-500">G</kbd> top/bottom
            </span>
          </div>
        )}
        {mode === "INSERT" && (
          <div className="flex items-center gap-4 bg-zinc-950 border-t border-zinc-900 px-4 py-1">
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">Esc</kbd> back to NORMAL
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              Editing: <span className="text-amber-500">{BLOCKS[selectedBlock]}</span>
            </span>
          </div>
        )}
        {mode === "COMMAND" && (
          <div className="flex items-center gap-4 bg-zinc-950 border-t border-zinc-900 px-4 py-1">
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">Enter</kbd> execute
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">Tab</kbd> autocomplete
            </span>
            <span className="text-[10px] font-mono text-zinc-700">
              <kbd className="text-zinc-500">Esc</kbd> cancel
            </span>
          </div>
        )}
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes v3SlideIn {
          from { transform: translateX(40px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
