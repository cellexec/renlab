"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentChat } from "../../components/AgentChat";
import { useSpecificationStore } from "../../hooks/useSpecificationStore";
import { useProjectContext } from "../../components/ProjectContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SpecificationType } from "../../specifications";

/** Try to extract a title from "# Feature: Name" or "# Name" or "# UI Refactor: Name" */
function extractTitle(specContent: string): string {
  const match = specContent.match(/^#\s+(?:(?:Feature|UI Refactor):\s*)?(.+)$/m);
  return match ? match[1].trim() : "";
}

export default function NewSpecificationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProjectId } = useProjectContext();
  const { createSpecification, saveVersion } = useSpecificationStore(activeProjectId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [specType, setSpecType] = useState<SpecificationType>("feature");

  // Read pre-composed message from sessionStorage when arriving from review issues
  useEffect(() => {
    if (searchParams.get("fromIssues") !== "1") return;
    const message = sessionStorage.getItem("spec-from-issues");
    if (message) {
      sessionStorage.removeItem("spec-from-issues");
      setInitialMessage(message);
    }
  }, [searchParams]);

  const specReady = content.trim().length > 0;

  const handleApplySpec = (specContent: string) => {
    setContent(specContent);
    if (!title.trim()) {
      const extracted = extractTitle(specContent);
      if (extracted) setTitle(extracted);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const specId = await createSpecification(title.trim(), activeProjectId ?? undefined, specType);
      await saveVersion(specId, content, "Initial version");
      router.push(`/specifications/${specId}`);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Specification</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {specReady
              ? "Review the generated spec, then save"
              : specType === "feature"
              ? "Describe your feature — the agent will interview you to understand it"
              : "Describe the UI you want to redesign — the agent will plan variant generation"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Type selector */}
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setSpecType("feature")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                specType === "feature"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Feature
            </button>
            <button
              type="button"
              onClick={() => setSpecType("ui-refactor")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                specType === "ui-refactor"
                  ? "bg-purple-700 text-purple-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              UI Refactor
            </button>
          </div>
          {specReady && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Create Specification"}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Chat panel */}
        <div
          className={`flex flex-col transition-all duration-300 ${
            specReady ? "w-1/2 border-r border-zinc-800" : "flex-1"
          }`}
        >
          <AgentChat
            agentName={specType === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
            context={content}
            onApplySpec={handleApplySpec}
            initialMessage={initialMessage}
            className="flex-1"
          />
        </div>

        {/* Spec preview panel — appears when spec is generated */}
        {specReady && (
          <div className="w-1/2 flex flex-col overflow-hidden">
            {/* Title input */}
            <div className="border-b border-zinc-800 px-6 py-4">
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Specification Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                placeholder="Feature name..."
                autoFocus
              />
            </div>

            {/* Spec content preview */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            </div>

            {/* Save footer */}
            <div className="border-t border-zinc-800 px-6 py-4 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Continue chatting to refine, or save when ready
              </p>
              <button
                type="button"
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Specification"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
