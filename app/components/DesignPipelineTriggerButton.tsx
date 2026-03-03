"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseDesignSpec } from "../lib/parseDesignSpec";

interface DesignPipelineTriggerButtonProps {
  specificationId: string;
  specVersionId: string | null;
  specContent: string;
  specTitle: string;
  hasActiveRun: boolean;
  activeRunId: string | null;
  onTrigger: (specificationId: string, specVersionId: string, specContent: string, specTitle: string, variantCount?: number, targetPath?: string) => Promise<string>;
}

export function DesignPipelineTriggerButton({
  specificationId,
  specVersionId,
  specContent,
  specTitle,
  hasActiveRun,
  activeRunId,
  onTrigger,
}: DesignPipelineTriggerButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !specVersionId || !specContent || loading;

  const handleClick = () => {
    if (hasActiveRun && activeRunId) {
      router.push(`/design-pipelines/${activeRunId}`);
      return;
    }
    if (confirming) {
      handleConfirm();
    } else {
      setConfirming(true);
      setError(null);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const handleConfirm = async () => {
    if (!specVersionId) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = parseDesignSpec(specContent);
      const runId = await onTrigger(
        specificationId,
        specVersionId,
        specContent,
        specTitle,
        parsed.variantCount,
        parsed.targetPath,
      );
      router.push(`/design-pipelines/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to trigger design pipeline");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  let label = "Send to Design Pipeline";
  let title = "Send this specification to the design pipeline for variant generation";
  if (hasActiveRun) {
    label = "Design Pipeline Running";
    title = "A design pipeline is already running for this specification";
  } else if (!specVersionId) {
    title = "Save a version first before sending to design pipeline";
  } else if (confirming) {
    label = "Confirm Send?";
  } else if (loading) {
    label = "Starting...";
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={disabled}
        title={title}
        className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
          confirming
            ? "border-purple-600 bg-purple-600/10 text-purple-400 hover:bg-purple-600/20"
            : hasActiveRun
            ? "border-purple-600/50 bg-purple-600/5 text-purple-400 hover:bg-purple-600/10 cursor-pointer"
            : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        <span className="flex items-center gap-2">
          {hasActiveRun ? (
            <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          )}
          {label}
        </span>
      </button>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
