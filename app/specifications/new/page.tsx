"use client";

import { useState, useEffect, useCallback } from "react";
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

const SPEC_TYPES: { value: SpecificationType; label: string; color: string; borderColor: string }[] = [
  { value: "feature", label: "Feature", color: "text-blue-400", borderColor: "border-blue-500/50 shadow-[0_0_24px_-6px_rgba(59,130,246,0.2)]" },
  { value: "ui-refactor", label: "UI Refactor", color: "text-purple-400", borderColor: "border-purple-500/50 shadow-[0_0_24px_-6px_rgba(168,85,247,0.2)]" },
];

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
  const activeTypeConfig = SPEC_TYPES.find((t) => t.value === specType) ?? SPEC_TYPES[0];

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

  // Tab to cycle spec type (consumed, doesn't bubble)
  const cycleType = useCallback((reverse: boolean) => {
    const idx = SPEC_TYPES.findIndex((t) => t.value === specType);
    const next = reverse
      ? (idx - 1 + SPEC_TYPES.length) % SPEC_TYPES.length
      : (idx + 1) % SPEC_TYPES.length;
    setSpecType(SPEC_TYPES[next].value);
  }, [specType]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cycleType(e.shiftKey);
        return;
      }
      if (e.key === "Escape") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return; // let AgentChat handle it
        e.preventDefault();
        router.back();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [cycleType, router]);

  return (
    <div className="flex h-full flex-col text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-950 px-6 py-3 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">New Specification</h1>
        <div className="flex items-center gap-3">
          {specReady && (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Create Specification"}
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => router.back()}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            Cancel
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Chat in boxed panel */}
        <div className={`flex flex-col transition-all duration-300 ${specReady ? "w-1/2" : "flex-1"}`}>
          <div className={`flex-1 flex flex-col min-h-0 m-8 ${specReady ? "mr-4" : ""} rounded-xl border-2 transition-colors duration-200 bg-zinc-950/60 overflow-hidden ${activeTypeConfig.borderColor}`}>
            {/* Type selector inside box */}
            <div className="shrink-0 flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5 inline-flex gap-0.5">
                {SPEC_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    tabIndex={-1}
                    onClick={() => setSpecType(type.value)}
                    className={`inline-flex items-center px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                      specType === type.value
                        ? `bg-white/[0.06] ${type.color}`
                        : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Tab</kbd>
            </div>
            <AgentChat
              agentName={specType === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
              context={content}
              onApplySpec={handleApplySpec}
              initialMessage={initialMessage}
              autoFocus
              className="flex-1"
            />
          </div>
        </div>

        {/* Spec preview panel — appears when spec is generated */}
        {specReady && (
          <div className="w-1/2 flex flex-col overflow-hidden pr-8 py-8">
            <div className="flex-1 flex flex-col rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 overflow-hidden">
              {/* Title input */}
              <div className="border-b border-white/[0.06] px-5 py-3">
                <label className="block text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1.5">
                  Specification Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  placeholder="Feature name..."
                  tabIndex={-1}
                />
              </div>

              {/* Spec content preview */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              </div>

              {/* Save footer */}
              <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-between">
                <p className="text-xs text-zinc-600">
                  Continue chatting to refine, or save when ready
                </p>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleSave}
                  disabled={!title.trim() || saving}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Specification"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
