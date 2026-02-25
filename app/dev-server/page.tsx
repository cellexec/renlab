"use client";

import { useState, useEffect } from "react";
import { useProjectContext } from "../components/ProjectContext";
import { useDevServer } from "../hooks/useDevServer";
import { LogViewer } from "../components/LogViewer";

const statusConfig = {
  idle:     { dot: "bg-zinc-500",                label: "Idle",        bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  starting: { dot: "bg-amber-500 animate-pulse", label: "Starting...", bg: "bg-amber-500/10",   text: "text-amber-400" },
  running:  { dot: "bg-emerald-500",              label: "Running",     bg: "bg-emerald-500/10", text: "text-emerald-400" },
  stopping: { dot: "bg-amber-500 animate-pulse", label: "Stopping...", bg: "bg-amber-500/10",   text: "text-amber-400" },
  error:    { dot: "bg-red-500",                  label: "Error",       bg: "bg-red-500/10",     text: "text-red-400" },
};

export default function DevServerPage() {
  const { activeProject } = useProjectContext();
  const { status, port, logs, isLoading, start, stop, restart, clearCache, clearLogs } =
    useDevServer({
      projectId: activeProject?.id ?? null,
      projectPath: activeProject?.path,
    });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const cfg = statusConfig[status];
  const canStart = status === "idle" || status === "error";
  const canStop = status === "running" || status === "starting";
  const disabled = !activeProject || isLoading;

  return (
    <div className={`flex h-full flex-col bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      {/* Header */}
      <div className="px-6 py-6 animate-fade-in-up stagger-1">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="text-zinc-300">Dev Server</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Dev Server</h1>
              {activeProject && (
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border backdrop-blur-md ${cfg.bg} ${cfg.text} border-white/[0.06]`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] text-zinc-500">
              {activeProject ? activeProject.title : "No project selected"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {port && status === "running" && (
              <a
                href={`http://localhost:${port}`}
                target="_blank"
                rel="noopener noreferrer"
                className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] hover:text-zinc-100 font-mono"
              >
                localhost:{port}
              </a>
            )}

            <button
              onClick={clearCache}
              disabled={disabled || !canStart}
              title="Remove .next cache directory"
              className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2 text-[13px] font-medium text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear .next
            </button>
            <button
              onClick={start}
              disabled={disabled || !canStart}
              className="bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start
            </button>
            <button
              onClick={stop}
              disabled={disabled || !canStop}
              className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2 text-[13px] font-medium text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Stop
            </button>
            <button
              onClick={restart}
              disabled={disabled || !canStop}
              className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2 text-[13px] font-medium text-zinc-300 transition-all duration-200 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Restart
            </button>
          </div>
        </div>
      </div>

      {!activeProject && (
        <div className="mx-6 mb-4 animate-fade-in-up stagger-2">
          <div className="flex items-center gap-2 backdrop-blur-xl bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl px-4 py-3">
            <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-[12px] text-amber-400">
              No project selected &mdash; select a project from the sidebar to manage its dev server.{" "}
              <a href="/projects/new" className="underline hover:text-amber-300 transition-colors">Add a project</a>{" "}
              or select one from the dropdown.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden px-6 pb-6 animate-fade-in-up stagger-3">
        <LogViewer logs={logs} onClear={clearLogs} />
      </div>
    </div>
  );
}
