"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "../../components/ProjectContext";
import type { Stack } from "../../projects";

const STACKS: { value: Stack; label: string }[] = [
  { value: "nextjs", label: "Next.js" },
  { value: "nextjs-supabase", label: "Next.js + Supabase" },
  { value: "nextjs-supabase-auth", label: "Next.js + Supabase + Auth" },
];

interface DirEntry {
  name: string;
  path: string;
  hasFiles: boolean;
  isMonorepo: boolean;
}

interface DetectedApp {
  name: string;
  path: string;
  hasPackageJson: boolean;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function fuzzyScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  let ti = 0;
  let prevMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return -Infinity;
    if (idx === prevMatch + 1) score += 5;
    if (idx === 0 || lower[idx - 1] === " " || lower[idx - 1] === "-" || lower[idx - 1] === "_") score += 3;
    score -= (idx - ti);
    prevMatch = idx;
    ti = idx + 1;
  }
  return score;
}

type Step = "browse" | "apps" | "importing";

export default function ImportMonorepoPage() {
  const router = useRouter();
  const { projects, addProjects } = useProjectContext();

  const [step, setStep] = useState<Step>("browse");

  // Browse state
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const useButtonRef = useRef<HTMLButtonElement>(null);

  // Apps step state
  const [repoName, setRepoName] = useState("");
  const [apps, setApps] = useState<DetectedApp[]>([]);
  const [appSelected, setAppSelected] = useState<Set<string>>(new Set());
  const [stacks, setStacks] = useState<Map<string, Stack>>(new Map());
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [appIndex, setAppIndex] = useState(0);
  const [showImported, setShowImported] = useState(false);
  const appListRef = useRef<HTMLDivElement>(null);

  const existingPaths = new Set(projects.map((p) => p.path));

  // Fetch directories
  const fetchDirs = useCallback(async (dirPath?: string) => {
    setLoading(true);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const res = await fetch(`/api/folders${params}`);
      const data = await res.json();
      if (data.current) {
        setCurrentPath(data.current);
        setDirs(data.dirs ?? []);
        setQuery("");
        setSelectedIndex(0);
        setSelectedPath(null);
      }
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  // Initial load — use configured default path if set
  useEffect(() => {
    const defaultPath = localStorage.getItem("importDefaultPath") || undefined;
    fetchDirs(defaultPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered dirs
  const filtered = useMemo(() => {
    if (!query) return dirs;
    return dirs
      .filter((d) => fuzzyMatch(d.name, query))
      .sort((a, b) => fuzzyScore(b.name, query) - fuzzyScore(a.name, query));
  }, [dirs, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Navigate into a folder
  const navigateInto = useCallback(
    (path: string) => {
      setHistory((h) => [...h, currentPath]);
      fetchDirs(path);
    },
    [currentPath, fetchDirs]
  );

  // Go back
  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    fetchDirs(prev);
  }, [history, fetchDirs]);

  // Select a folder (mark it for import)
  const selectEntry = useCallback(
    (entry: DirEntry) => {
      setSelectedPath((prev) => (prev === entry.path ? null : entry.path));
    },
    []
  );

  // Keyboard handler
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab" && !e.shiftKey && selectedPath && !detecting) {
        e.preventDefault();
        useButtonRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const entry = filtered[selectedIndex];
        if (!entry) return;
        if (e.shiftKey) {
          // Shift+Enter = select/toggle for import
          selectEntry(entry);
        } else {
          // Enter = navigate into folder
          navigateInto(entry.path);
        }
      } else if (e.key === "Backspace" && query === "") {
        e.preventDefault();
        goBack();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (query) {
          setQuery("");
        } else {
          router.back();
        }
      }
    },
    [filtered, selectedIndex, query, selectedPath, detecting, navigateInto, goBack, selectEntry, router]
  );

  // Double-click tracking
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseClick = useCallback(
    (entry: DirEntry, index: number) => {
      setSelectedIndex(index);
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        // Double click → navigate into
        navigateInto(entry.path);
        return;
      }
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        selectEntry(entry);
      }, 250);
    },
    [navigateInto, selectEntry]
  );

  // Detect apps in selected path
  async function handleDetect() {
    if (!selectedPath) return;
    setDetecting(true);
    setError("");
    try {
      const res = await fetch("/api/monorepo/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: selectedPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Detection failed");
      setRepoName(data.repoName);
      setApps(data.apps);
      const preSelected = new Set<string>();
      const defaultStacks = new Map<string, Stack>();
      for (const app of data.apps as DetectedApp[]) {
        if (!existingPaths.has(app.path)) preSelected.add(app.path);
        defaultStacks.set(app.path, "nextjs");
      }
      setAppSelected(preSelected);
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
    setAppSelected((prev) => {
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
    const toImport = apps.filter((a) => appSelected.has(a.path));
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
          repoPath: selectedPath!,
        }))
      );
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("apps");
    }
  }

  // Browse step — fullscreen fzf-style
  if (step === "browse") {
    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <h1 className="text-sm font-semibold text-zinc-100">Import Project</h1>
          <span className="text-[11px] text-zinc-600 font-mono truncate">{currentPath}</span>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          {history.length > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Go back"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Filter folders…"
            autoFocus
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
          />
          <kbd className="hidden sm:inline-block shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            ESC
          </kbd>
        </div>

        {/* Directory listing */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-600">
              {query ? "No matching folders" : "Empty directory"}
            </div>
          ) : (
            filtered.map((dir, i) => {
              const isHighlighted = i === selectedIndex;
              const isSelected = dir.path === selectedPath;
              return (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => handleMouseClick(dir, i)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                    isHighlighted ? "bg-zinc-800/80" : ""
                  }`}
                >
                  {/* Folder icon */}
                  {dir.hasFiles ? (
                    <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  )}
                  <span className={`flex-1 flex items-center gap-2 min-w-0 text-sm ${isSelected ? "text-violet-300 font-medium" : "text-zinc-300"}`}>
                    <span className="truncate">{dir.name}</span>
                    {dir.isMonorepo && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/15 to-indigo-500/15 border border-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                        🧩 Monorepo
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <svg className="h-4 w-4 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {/* Navigate hint on highlighted row */}
                  {isHighlighted && !isSelected && (
                    <span className="shrink-0 text-[10px] text-zinc-600 font-mono">
                      enter open · shift+enter select
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3">
          <div className="flex-1 min-w-0">
            {selectedPath ? (
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="truncate text-sm text-violet-300 font-mono">{selectedPath}</span>
              </div>
            ) : (
              <span className="text-sm text-zinc-600">Select a folder to import</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-[13px] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              ref={useButtonRef}
              type="button"
              onClick={handleDetect}
              disabled={!selectedPath || detecting}
              onKeyDown={(e) => {
                if (e.key === "Tab" && e.shiftKey) {
                  e.preventDefault();
                  inputRef.current?.focus();
                }
              }}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {detecting ? "Scanning…" : "Use Project"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Apps step — visible list (filter out already-imported unless toggled)
  const visibleApps = useMemo(() => {
    if (showImported) return apps;
    return apps.filter((a) => !existingPaths.has(a.path));
  }, [apps, showImported, existingPaths]);

  const importedCount = useMemo(() => apps.filter((a) => existingPaths.has(a.path)).length, [apps, existingPaths]);

  // Clamp appIndex when visible list changes
  useEffect(() => {
    setAppIndex((i) => Math.min(i, Math.max(0, visibleApps.length - 1)));
  }, [visibleApps.length]);

  // Scroll highlighted app into view
  useEffect(() => {
    if (!appListRef.current) return;
    const item = appListRef.current.children[appIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [appIndex]);

  if (step === "apps") {
    const appsKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAppIndex((i) => Math.min(i + 1, visibleApps.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAppIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        const app = visibleApps[appIndex];
        if (app && !existingPaths.has(app.path)) toggleApp(app.path);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (appSelected.size > 0) handleImport();
      } else if (e.key === "h") {
        e.preventDefault();
        setShowImported((v) => !v);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setStep("browse");
      }
    };

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100" onKeyDown={appsKeyDown} tabIndex={0} ref={(el) => el?.focus()}>
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={() => setStep("browse")}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <svg className="h-4 w-4 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-sm font-medium text-zinc-200">{repoName}</span>
            <span className="truncate text-[11px] text-zinc-600 font-mono">{selectedPath}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {importedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowImported((v) => !v)}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  showImported ? "bg-zinc-800 text-zinc-300" : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {showImported ? "Hide" : "Show"} {importedCount} imported
                <kbd className="ml-1.5 rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">H</kbd>
              </button>
            )}
          </div>
        </div>

        <div ref={appListRef} className="flex-1 overflow-y-auto py-1">
          {visibleApps.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-zinc-400">
                {apps.length === 0 ? "No apps detected" : "All apps already imported"}
              </p>
              {apps.length === 0 && (
                <p className="mt-1 text-[12px] text-zinc-600">Looking in: apps/, packages/, services/, libs/</p>
              )}
            </div>
          ) : (
            visibleApps.map((app, i) => {
              const alreadyImported = existingPaths.has(app.path);
              const isSelected = appSelected.has(app.path);
              const isHighlighted = i === appIndex;
              return (
                <div
                  key={app.path}
                  onClick={() => { setAppIndex(i); if (!alreadyImported) toggleApp(app.path); }}
                  onMouseEnter={() => setAppIndex(i)}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                    isHighlighted ? "bg-zinc-800/80" : ""
                  } ${alreadyImported ? "opacity-40" : ""}`}
                >
                  {/* Checkbox visual */}
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    alreadyImported
                      ? "border-zinc-700 bg-zinc-800"
                      : isSelected
                        ? "border-violet-500 bg-violet-500"
                        : "border-zinc-600 bg-zinc-800"
                  }`}>
                    {(isSelected || alreadyImported) && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-medium ${isSelected ? "text-violet-300" : "text-zinc-200"}`}>{app.name}</span>
                      {app.hasPackageJson && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">package.json</span>
                      )}
                      {alreadyImported && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">imported</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-600 font-mono truncate">{app.path}</p>
                  </div>
                  {!alreadyImported && (
                    <select
                      value={stacks.get(app.path) ?? "nextjs"}
                      onChange={(e) => { e.stopPropagation(); setAppStack(app.path, e.target.value as Stack); }}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-300 outline-none focus:border-violet-500/30"
                    >
                      {STACKS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="border-t border-red-900/30 bg-red-950/20 px-4 py-2">
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-3 text-[11px] text-zinc-600">
            <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Space</kbd> toggle</span>
            <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> import</span>
            <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd> back</span>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setStep("browse")}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-[13px] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={appSelected.size === 0}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Import {appSelected.size} app{appSelected.size !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // Importing step
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950">
      <div className="text-center">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        <p className="text-[13px] text-zinc-400">{status}</p>
      </div>
    </div>
  );
}
