"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentChat } from "../../components/AgentChat";
import { useSpecificationStore } from "../../hooks/useSpecificationStore";
import { useProjectContext } from "../../components/ProjectContext";
import { getSupabase } from "../../lib/supabase";
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
  const [saving, setSaving] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [specType, setSpecType] = useState<SpecificationType>("feature");
  const [specId, setSpecId] = useState<string | null>(null);
  const creatingRef = useRef(false);

  // Read pre-composed message from sessionStorage when arriving from review issues
  useEffect(() => {
    if (searchParams.get("fromIssues") !== "1") return;
    const message = sessionStorage.getItem("spec-from-issues");
    if (message) {
      sessionStorage.removeItem("spec-from-issues");
      setInitialMessage(message);
    }
  }, [searchParams]);

  // Eagerly create the spec with "chat" status so the session can be linked immediately
  useEffect(() => {
    if (specId || creatingRef.current) return;
    creatingRef.current = true;
    createSpecification("New Specification", activeProjectId ?? undefined, specType).then(async (id) => {
      await getSupabase().from("specifications").update({ status: "chat" }).eq("id", id);
      setSpecId(id);
    }).catch(() => { creatingRef.current = false; });
  }, [createSpecification, activeProjectId, specType, specId]);

  const activeTypeConfig = SPEC_TYPES.find((t) => t.value === specType) ?? SPEC_TYPES[0];

  const handleApplySpec = async (specContent: string) => {
    if (saving || !specId) return;
    const specTitle = extractTitle(specContent) || "Untitled";
    setSaving(true);
    try {
      await getSupabase().from("specifications").update({ title: specTitle, status: "draft" }).eq("id", specId);
      await saveVersion(specId, specContent, "Initial version");
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
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        router.back();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [cycleType, router]);

  return (
    <div className="flex h-full flex-col text-zinc-100">
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1">
          <div className={`flex-1 flex flex-col min-h-0 m-8 rounded-xl border-2 transition-colors duration-200 bg-zinc-950/60 overflow-hidden ${activeTypeConfig.borderColor}`}>
            {/* Title + type selector + actions */}
            <div className="shrink-0 flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
              <span className="text-sm font-semibold text-zinc-200">New Spec</span>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5 inline-flex gap-0.5">
                {SPEC_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    tabIndex={-1}
                    onClick={() => setSpecType(type.value)}
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
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
              <div className="flex-1" />
              {saving && <span className="text-[11px] text-zinc-500">Saving...</span>}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => router.back()}
                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
              </button>
            </div>
            {specId ? (
              <AgentChat
                agentName={specType === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
                onApplySpec={handleApplySpec}
                applyLabel="Save as Initial Version"
                specificationId={specId}
                initialMessage={initialMessage}
                autoFocus
                className="flex-1"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">Initializing...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
