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

function fuzzyIndices(text: string, query: string): Set<number> | null {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const indices = new Set<number>();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti);
    if (idx === -1) return null;
    indices.add(idx);
    ti = idx + 1;
  }
  return indices;
}

function FuzzyText({ text, query, className, highlightClass }: {
  text: string;
  query: string;
  className?: string;
  highlightClass?: string;
}) {
  if (!query) return <span className={className}>{text}</span>;
  const indices = fuzzyIndices(text, query);
  if (!indices || indices.size === 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {Array.from(text).map((ch, i) =>
        indices.has(i) ? (
          <span key={i} className={highlightClass ?? "text-violet-300 font-semibold"}>{ch}</span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </span>
  );
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
  const [searchFocused, setSearchFocused] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
  const [appQuery, setAppQuery] = useState("");
  const [appSearchFocused, setAppSearchFocused] = useState(false);
  const appSearchRef = useRef<HTMLInputElement>(null);
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
    }
  }, []);

  // Initial load
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

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const navigateInto = useCallback(
    (path: string) => {
      setHistory((h) => [...h, currentPath]);
      fetchDirs(path);
    },
    [currentPath, fetchDirs]
  );

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    fetchDirs(prev);
  }, [history, fetchDirs]);

  const selectEntry = useCallback(
    (entry: DirEntry) => {
      setSelectedPath((prev) => (prev === entry.path ? null : entry.path));
    },
    []
  );

  // Detect apps
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

  // ── Browse keyboard (global) ─────────────────────────────────────────────
  useEffect(() => {
    if (step !== "browse" || loading) return;

    const handler = (e: KeyboardEvent) => {
      // Search focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (query) {
            setQuery("");
          } else {
            searchRef.current?.blur();
            setSearchFocused(false);
          }
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          searchRef.current?.blur();
          setSearchFocused(false);
        } else if (e.key === "Backspace" && query === "") {
          e.preventDefault();
          goBack();
        }
        return;
      }

      // List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        e.preventDefault();
        router.back();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearchFocused(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedPath && !detecting) {
          handleDetect();
        } else {
          const entry = filtered[selectedIndex];
          if (entry) navigateInto(entry.path);
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        goBack();
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const entry = filtered[selectedIndex];
        if (entry) selectEntry(entry);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading, searchFocused, query, filtered, selectedIndex, selectedPath, detecting, history]);

  // ── Apps keyboard (global) ───────────────────────────────────────────────
  const visibleApps = useMemo(() => {
    let list = showImported ? apps : apps.filter((a) => !existingPaths.has(a.path));
    if (appQuery) list = list.filter((a) => fuzzyMatch(a.name, appQuery) || fuzzyMatch(a.path, appQuery));
    return list;
  }, [apps, showImported, existingPaths, appQuery]);

  const importedCount = useMemo(() => apps.filter((a) => existingPaths.has(a.path)).length, [apps, existingPaths]);

  useEffect(() => {
    setAppIndex((i) => Math.min(i, Math.max(0, visibleApps.length - 1)));
  }, [visibleApps.length]);

  useEffect(() => {
    if (!appListRef.current) return;
    const item = appListRef.current.children[appIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [appIndex]);

  useEffect(() => {
    if (step !== "apps") return;

    const handler = (e: KeyboardEvent) => {
      // Search focused
      if (appSearchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (appQuery) {
            setAppQuery("");
          } else {
            appSearchRef.current?.blur();
            setAppSearchFocused(false);
          }
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setAppIndex((i) => Math.min(i + 1, visibleApps.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setAppIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          appSearchRef.current?.blur();
          setAppSearchFocused(false);
        }
        return;
      }

      // List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setAppSearchFocused(true);
        requestAnimationFrame(() => appSearchRef.current?.focus());
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setAppIndex((i) => Math.min(i + 1, visibleApps.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setAppIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setAppIndex((i) => Math.min(i + 1, visibleApps.length - 1));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setAppIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
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

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, appSearchFocused, appQuery, visibleApps, appIndex, appSelected.size]);

  // ── Browse step ──────────────────────────────────────────────────────────
  if (step === "browse") {
    return (
      <div className="flex h-full flex-col text-zinc-100">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Import Project</h1>
              <p className="mt-0.5 text-[12px] text-zinc-500 font-mono truncate">{currentPath}</p>
            </div>
            {selectedPath && (
              <button
                tabIndex={-1}
                onClick={handleDetect}
                disabled={detecting}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
              >
                {detecting ? "Scanning…" : "Import"}
                <kbd className="rounded bg-violet-500/40 px-1 py-0.5 text-[9px] font-medium text-violet-200">Enter</kbd>
              </button>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="shrink-0 border-b border-zinc-800 px-6 py-2.5">
          <div className="flex items-center gap-2 max-w-xl">
            {history.length > 0 && (
              <button
                tabIndex={-1}
                type="button"
                onClick={goBack}
                className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Filter folders…"
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />
            {!searchFocused && (
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">/</kbd>
            )}
          </div>
        </div>

        {/* Directory listing */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-600">
              {query ? "No matching folders" : "Empty directory"}
            </div>
          ) : (
            filtered.map((dir, i) => {
              const isHighlighted = i === selectedIndex && !searchFocused;
              const isSelected = dir.path === selectedPath;
              return (
                <div
                  key={dir.path}
                  onClick={() => { setSelectedIndex(i); selectEntry(dir); }}
                  onDoubleClick={() => navigateInto(dir.path)}
                  onMouseMove={() => { if (selectedIndex !== i) setSelectedIndex(i); }}
                  className={`border-b border-zinc-800/50 px-6 py-3 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-violet-500/[0.06] border-l-2 border-l-violet-500/60"
                      : isHighlighted
                        ? "bg-white/[0.03] border-l-2 border-l-zinc-600/60"
                        : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3 max-w-xl">
                    <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                      isSelected ? "bg-violet-400" : isHighlighted ? "bg-zinc-500" : "bg-transparent"
                    }`} />
                    {dir.hasFiles ? (
                      <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    )}
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <FuzzyText text={dir.name} query={query} className={`text-[13px] truncate ${isSelected ? "text-violet-300 font-medium" : "text-zinc-200"}`} />
                      {dir.isMonorepo && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/15 to-indigo-500/15 border border-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                          🧩 Monorepo
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <svg className="h-4 w-4 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom hints */}
        <div className="shrink-0 border-t border-zinc-800 px-6 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd> <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd> navigate</span>
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> {selectedPath ? "import" : "open"}</span>
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Space</kbd> select</span>
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Backspace</kbd> back</span>
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd> search</span>
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd> close</span>
        </div>
      </div>
    );
  }

  // ── Apps step ────────────────────────────────────────────────────────────
  if (step === "apps") {
    return (
      <div className="flex h-full flex-col text-zinc-100">
        {/* Header */}
        <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                tabIndex={-1}
                type="button"
                onClick={() => setStep("browse")}
                className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">{repoName}</h1>
                <p className="mt-0.5 text-[12px] text-zinc-500 font-mono truncate">{selectedPath}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {importedCount > 0 && (
                <button
                  tabIndex={-1}
                  type="button"
                  onClick={() => setShowImported((v) => !v)}
                  className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                    showImported ? "bg-zinc-800 text-zinc-300" : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {showImported ? "Hide" : "Show"} {importedCount} imported
                  <kbd className="ml-1.5 rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">h</kbd>
                </button>
              )}
              {appSelected.size > 0 && (
                <button
                  tabIndex={-1}
                  onClick={handleImport}
                  className="rounded-lg bg-violet-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-violet-500"
                >
                  Import {appSelected.size} app{appSelected.size !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="shrink-0 border-b border-zinc-800 px-6 py-2.5">
          <div className="flex items-center gap-2 max-w-xl">
            <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              ref={appSearchRef}
              type="text"
              value={appQuery}
              onChange={(e) => { setAppQuery(e.target.value); setAppIndex(0); }}
              onFocus={() => setAppSearchFocused(true)}
              onBlur={() => setAppSearchFocused(false)}
              placeholder="Filter apps…"
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            />
            {!appSearchFocused && (
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">/</kbd>
            )}
          </div>
        </div>

        {/* Apps list */}
        <div ref={appListRef} className="flex-1 overflow-y-auto">
          {visibleApps.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-zinc-400">
                {apps.length === 0 ? "No apps detected" : appQuery ? "No matching apps" : "All apps already imported"}
              </p>
              {apps.length === 0 && (
                <p className="mt-1 text-[12px] text-zinc-600">Looking in: apps/, packages/, services/, libs/</p>
              )}
            </div>
          ) : (
            visibleApps.map((app, i) => {
              const alreadyImported = existingPaths.has(app.path);
              const isChecked = appSelected.has(app.path);
              const isHighlighted = i === appIndex && !appSearchFocused;
              return (
                <div
                  key={app.path}
                  onClick={() => { setAppIndex(i); if (!alreadyImported) toggleApp(app.path); }}
                  onMouseMove={() => { if (appIndex !== i) setAppIndex(i); }}
                  className={`border-b border-zinc-800/50 px-6 py-3 transition-colors cursor-pointer ${
                    alreadyImported ? "opacity-40" : ""
                  } ${
                    isHighlighted
                      ? isChecked
                        ? "bg-violet-500/[0.06] border-l-2 border-l-violet-500/60"
                        : "bg-white/[0.03] border-l-2 border-l-zinc-600/60"
                      : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3 max-w-xl">
                    <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                      isHighlighted ? (isChecked ? "bg-violet-400" : "bg-zinc-500") : "bg-transparent"
                    }`} />
                    {/* Checkbox */}
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      alreadyImported
                        ? "border-zinc-700 bg-zinc-800"
                        : isChecked
                          ? "border-violet-500 bg-violet-500"
                          : "border-zinc-600 bg-zinc-800"
                    }`}>
                      {(isChecked || alreadyImported) && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FuzzyText text={app.name} query={appQuery} className={`text-[13px] font-medium ${isChecked ? "text-violet-300" : "text-zinc-200"}`} />
                        {app.hasPackageJson && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">package.json</span>
                        )}
                        {alreadyImported && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">imported</span>
                        )}
                        {isHighlighted && !alreadyImported && (
                          <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Space to {isChecked ? "deselect" : "select"}</kbd>
                        )}
                      </div>
                      <FuzzyText text={app.path} query={appQuery} className="text-[11px] text-zinc-600 font-mono truncate block" highlightClass="text-violet-400 font-medium" />
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
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="shrink-0 border-t border-red-900/30 bg-red-950/20 px-6 py-2">
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}

        {/* Bottom hints */}
        <div className="shrink-0 border-t border-zinc-800 px-6 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd> <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd> navigate</span>
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Space</kbd> toggle</span>
          {appSelected.size > 0 && <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> import</span>}
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd> search</span>
          {importedCount > 0 && <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">h</kbd> {showImported ? "hide" : "show"} imported</span>}
          <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd> back</span>
        </div>
      </div>
    );
  }

  // ── Importing step ───────────────────────────────────────────────────────
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        <p className="text-[13px] text-zinc-400">{status}</p>
      </div>
    </div>
  );
}
