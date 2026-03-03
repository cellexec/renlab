"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "../../components/ProjectContext";
import { FolderBrowser } from "../../components/FolderBrowser";
import type { Stack } from "../../projects";

const STACKS: { value: Stack; label: string }[] = [
  { value: "nextjs", label: "Next.js" },
  { value: "nextjs-supabase", label: "Next.js + Supabase" },
  { value: "nextjs-supabase-auth", label: "Next.js + Supabase + Auth" },
];

interface DetectedApp {
  name: string;
  path: string;
  hasPackageJson: boolean;
}

type Step = "select" | "apps" | "importing";

export default function ImportMonorepoPage() {
  const router = useRouter();
  const { projects, addProjects } = useProjectContext();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("select");

  // Step 1: select repo root
  const [repoPath, setRepoPath] = useState("");

  // Step 2: detected apps
  const [repoName, setRepoName] = useState("");
  const [apps, setApps] = useState<DetectedApp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stacks, setStacks] = useState<Map<string, Stack>>(new Map());
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");

  // Step 3: importing
  const [status, setStatus] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const existingPaths = new Set(projects.map((p) => p.path));

  async function handleDetect() {
    if (!repoPath) return;
    setDetecting(true);
    setError("");

    try {
      const res = await fetch("/api/monorepo/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Detection failed");

      setRepoName(data.repoName);
      setApps(data.apps);

      // Pre-select apps that aren't already imported
      const preSelected = new Set<string>();
      const defaultStacks = new Map<string, Stack>();
      for (const app of data.apps as DetectedApp[]) {
        if (!existingPaths.has(app.path)) {
          preSelected.add(app.path);
        }
        defaultStacks.set(app.path, "nextjs");
      }
      setSelected(preSelected);
      setStacks(defaultStacks);
      setStep("apps");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  }

  function toggleApp(appPath: string) {
    if (existingPaths.has(appPath)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appPath)) next.delete(appPath);
      else next.add(appPath);
      return next;
    });
  }

  function setAppStack(appPath: string, stack: Stack) {
    setStacks((prev) => new Map(prev).set(appPath, stack));
  }

  async function handleImport() {
    const toImport = apps.filter((a) => selected.has(a.path));
    if (toImport.length === 0) return;

    setStep("importing");
    setStatus(`Importing ${toImport.length} app${toImport.length > 1 ? "s" : ""}...`);

    try {
      await addProjects(
        toImport.map((app) => ({
          title: app.name,
          description: "",
          path: app.path,
          stack: stacks.get(app.path) ?? "nextjs",
          repoPath,
        }))
      );
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("apps");
    }
  }

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors" onClick={() => router.push("/")}>Home</span>
              <span>/</span>
              <span className="hover:text-zinc-300 cursor-pointer transition-colors" onClick={() => router.push("/projects")}>Projects</span>
              <span>/</span>
              <span className="text-zinc-300">Import Monorepo</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Import Monorepo</h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              Select a monorepo root to detect and import individual apps
            </p>
          </div>

          <div className="max-w-2xl animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">

              {/* Step 1: Select repo root */}
              {step === "select" && (
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Monorepo Root *</label>
                    <FolderBrowser
                      value={repoPath}
                      onChange={(p) => setRepoPath(p)}
                    />
                    {repoPath && (
                      <p className="mt-1.5 truncate font-mono text-[12px] text-zinc-500">
                        Selected: {repoPath}
                      </p>
                    )}
                  </div>

                  {error && <p className="text-[12px] text-red-400">{error}</p>}

                  <div className="flex gap-2">
                    <button
                      onClick={handleDetect}
                      disabled={!repoPath || detecting}
                      className="flex-1 bg-violet-600 hover:bg-violet-500 rounded-lg px-3 py-2.5 text-[13px] font-medium text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {detecting ? "Scanning..." : "Detect Apps"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-[13px] text-zinc-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Select apps */}
              {step === "apps" && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-medium text-zinc-100">{repoName}</h3>
                        <p className="text-[12px] text-zinc-500 font-mono truncate">{repoPath}</p>
                      </div>
                    </div>

                    {apps.length === 0 ? (
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                        <p className="text-[13px] text-zinc-400">No apps detected in conventional directories</p>
                        <p className="mt-1 text-[12px] text-zinc-600">Looking for subdirectories in: apps/, packages/, services/, libs/</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[12px] text-zinc-500">
                          Found {apps.length} app{apps.length > 1 ? "s" : ""} — select which to import
                        </p>
                        {apps.map((app) => {
                          const alreadyImported = existingPaths.has(app.path);
                          const isSelected = selected.has(app.path);

                          return (
                            <div
                              key={app.path}
                              className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-200 ${
                                alreadyImported
                                  ? "border-white/[0.04] bg-white/[0.01] opacity-50"
                                  : isSelected
                                    ? "border-violet-500/30 bg-violet-500/[0.06]"
                                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={alreadyImported}
                                onChange={() => toggleApp(app.path)}
                                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-violet-500 focus:ring-violet-500/30 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-medium text-zinc-200">{app.name}</span>
                                  {app.hasPackageJson && (
                                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500">package.json</span>
                                  )}
                                  {alreadyImported && (
                                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">already imported</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-600 font-mono truncate">{app.path}</p>
                              </div>
                              {!alreadyImported && (
                                <select
                                  value={stacks.get(app.path) ?? "nextjs"}
                                  onChange={(e) => setAppStack(app.path, e.target.value as Stack)}
                                  className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[12px] text-zinc-300 outline-none focus:border-violet-500/30"
                                >
                                  {STACKS.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {error && <p className="text-[12px] text-red-400">{error}</p>}

                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      disabled={selected.size === 0}
                      className="flex-1 bg-violet-600 hover:bg-violet-500 rounded-lg px-3 py-2.5 text-[13px] font-medium text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Import {selected.size} app{selected.size !== 1 ? "s" : ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep("select"); setApps([]); setError(""); }}
                      className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-[13px] text-zinc-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Importing */}
              {step === "importing" && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                    <p className="text-[13px] text-zinc-400">{status}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
