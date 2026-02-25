"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { AgentChat } from "../../components/AgentChat";
import { VersionHistory } from "../../components/VersionHistory";
import { PipelineTriggerButton } from "../../components/PipelineTriggerButton";
import { useSpecificationStore } from "../../hooks/useSpecificationStore";
import { usePipelineStore } from "../../hooks/usePipelineStore";
import { useProjectContext } from "../../components/ProjectContext";
import type { SpecificationStatus } from "../../specifications";

const STATUS_BADGE: Record<SpecificationStatus, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30" },
  pipeline:  { label: "Pipeline",  cls: "bg-blue-600/20 text-blue-400 border-blue-600/30 animate-pulse" },
  failed:    { label: "Failed",    cls: "bg-red-600/20 text-red-400 border-red-600/30" },
  cancelled: { label: "Cancelled", cls: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" },
  done:      { label: "Done",      cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" },
};

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
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);
  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);

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
      if (title !== spec.title) {
        await updateTitle(id, title);
      }
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

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        Loading...
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-500">
        <p>Specification not found</p>
        <button
          onClick={() => router.push("/specifications")}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
        >
          Back to Specifications
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/specifications")}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
              <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[spec.status].cls}`}>
                {STATUS_BADGE[spec.status].label}
              </span>
              {latestVersion && (
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                  v{latestVersion.versionNumber}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Last saved {new Date(spec.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) setChatOpen(false); }}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              historyOpen
                ? "border-amber-600 bg-amber-600/10 text-amber-400"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setChatOpen((v) => !v); if (!chatOpen) setHistoryOpen(false); }}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              chatOpen
                ? "border-cyan-600 bg-cyan-600/10 text-cyan-400"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              AI Assistant
            </span>
          </button>
          {(spec.status === "failed" || spec.status === "cancelled") && (
            <button
              type="button"
              onClick={() => updateStatus(id, "draft")}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              Back to Draft
            </button>
          )}
          {activeProject && editable && (
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges || !editable}
            className="relative rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasChanges && editable && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
            )}
            {saving ? "Saving..." : "Save Version"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Editor panel */}
        <div className="flex flex-1 flex-col overflow-hidden px-8 py-5 gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!editable}
            className={`w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 ${!editable ? "opacity-60 cursor-not-allowed" : ""}`}
            placeholder="Specification title"
          />

          {!editable && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-500">
              This specification is <span className="font-medium">{spec.status}</span> and cannot be edited.
              {(spec.status === "failed" || spec.status === "cancelled") && " Use \"Back to Draft\" to unlock editing."}
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            <MarkdownEditor
              value={content}
              onChange={editable ? setContent : () => {}}
              placeholder="Write your specification in Markdown..."
            />
          </div>
        </div>

        {/* Version History panel */}
        {historyOpen && (
          <div className="w-72 shrink-0 border-l border-zinc-800 flex flex-col">
            <VersionHistory
              versions={versions}
              onRestore={handleRestore}
              className="flex-1"
            />
          </div>
        )}

        {/* Chat panel */}
        {chatOpen && (
          <div className="w-96 shrink-0 border-l border-zinc-800 flex flex-col">
            <AgentChat
              agentName="Specification Expert"
              context={content}
              onApplySpec={handleApplySpec}
              className="flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
}
