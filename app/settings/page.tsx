"use client";

import { useState, useEffect } from "react";
import { useProjectContext } from "../components/ProjectContext";

export default function SettingsPage() {
  const { activeProject, updateProject } = useProjectContext();
  const [threshold, setThreshold] = useState(80);
  const [maxRetries, setMaxRetries] = useState(2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeProject) {
      setThreshold(activeProject.pipelineThreshold);
      setMaxRetries(activeProject.maxRetries);
    }
  }, [activeProject]);

  const handleSave = async () => {
    if (!activeProject) return;
    setSaving(true);
    setSaved(false);
    await updateProject(activeProject.id, { pipelineThreshold: threshold, maxRetries });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasChanges = activeProject
    ? threshold !== activeProject.pipelineThreshold || maxRetries !== activeProject.maxRetries
    : false;

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="text-zinc-300">Settings</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Settings</h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              {activeProject ? activeProject.title : "No project selected"}
            </p>
          </div>

          {!activeProject ? (
            <div className="flex items-center justify-center py-20 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                <p className="text-sm text-zinc-400">Select a project from the sidebar to configure settings.</p>
              </div>
            </div>
          ) : (
            <div className="max-w-xl animate-fade-in-up" style={{ animationDelay: "120ms" }}>
              {/* Pipeline section */}
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
                <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Pipeline</h2>
                <p className="text-[13px] text-zinc-500 mb-6">
                  Configure automated pipeline settings for this project.
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-[13px] font-medium text-zinc-300 mb-2">
                      Review Score Threshold
                    </label>
                    <p className="text-[12px] text-zinc-500 mb-3">
                      Minimum review score (0-100) required to auto-merge pipeline results.
                      Code scoring below this threshold will not be merged.
                    </p>

                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="flex-1 accent-violet-500 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(139,92,246,0.4)]
                          [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-violet-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                      />
                      <span className="text-2xl font-bold tabular-nums text-zinc-100 w-12 text-right font-mono">
                        {threshold}
                      </span>
                    </div>

                    <div className="flex justify-between mt-1 text-[10px] text-zinc-600 font-mono">
                      <span>0 (accept all)</span>
                      <span>50</span>
                      <span>100 (perfect only)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-zinc-300 mb-2">
                      Max Review Retries
                    </label>
                    <p className="text-[12px] text-zinc-500 mb-3">
                      Number of times the coder agent can retry after a review rejection. 0 disables retries.
                    </p>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setMaxRetries((v) => Math.max(0, v - 1))}
                        disabled={maxRetries <= 0}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        -
                      </button>
                      <span className="text-2xl font-bold tabular-nums text-zinc-100 w-8 text-center font-mono">
                        {maxRetries}
                      </span>
                      <button
                        onClick={() => setMaxRetries((v) => Math.min(5, v + 1))}
                        disabled={maxRetries >= 5}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : saved ? "Saved!" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
