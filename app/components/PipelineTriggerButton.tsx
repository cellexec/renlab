"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PipelineTriggerButtonProps {
  specificationId: string;
  specVersionId: string | null;
  specContent: string;
  specTitle: string;
  threshold: number;
  maxRetries: number;
  hasActiveRun: boolean;
  activeRunId: string | null;
  onTrigger: (specificationId: string, specVersionId: string, specContent: string, specTitle: string, threshold: number, maxRetries: number) => Promise<string>;
}

export function PipelineTriggerButton({
  specificationId,
  specVersionId,
  specContent,
  specTitle,
  threshold,
  maxRetries,
  hasActiveRun,
  activeRunId,
  onTrigger,
}: PipelineTriggerButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !specVersionId || !specContent || loading;

  const handleClick = () => {
    if (hasActiveRun && activeRunId) {
      router.push(`/pipelines/${activeRunId}`);
      return;
    }
    if (confirming) {
      handleConfirm();
    } else {
      setConfirming(true);
      setError(null);
      // Auto-dismiss after 3s
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const handleConfirm = async () => {
    if (!specVersionId) return;
    setLoading(true);
    setError(null);
    try {
      const runId = await onTrigger(specificationId, specVersionId, specContent, specTitle, threshold, maxRetries);
      router.push(`/pipelines/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to trigger pipeline");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  let label = "Send to Pipeline";
  let title = "Send this specification to the pipeline for automated implementation";
  if (hasActiveRun) {
    label = "Pipeline Running";
    title = "A pipeline is already running for this specification";
  } else if (!specVersionId) {
    title = "Save a version first before sending to pipeline";
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
            ? "border-orange-600 bg-orange-600/10 text-orange-400 hover:bg-orange-600/20"
            : hasActiveRun
            ? "border-amber-600/50 bg-amber-600/5 text-amber-500 hover:bg-amber-600/10 cursor-pointer"
            : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        <span className="flex items-center gap-2">
          {hasActiveRun ? (
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
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
