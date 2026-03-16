"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useProjectContext } from "../components/ProjectContext";
import { useDevServer } from "../hooks/useDevServer";
import { useDatabase } from "../hooks/useDatabase";
import { LogViewer } from "../components/LogViewer";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  section: string;
  label: string;
  description: string;
  action: () => void;
  disabled: boolean;
  badge?: { label: string; color: string };
}

// ── Fuzzy helpers ────────────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LocalDevPage() {
  const { activeProject } = useProjectContext();

  const devServer = useDevServer({
    projectId: activeProject?.id ?? null,
    projectPath: activeProject?.path,
    repoPath: activeProject?.repoPath,
  });

  const db = useDatabase({
    projectId: activeProject?.id ?? null,
    projectPath: activeProject?.path,
    repoPath: activeProject?.repoPath,
  });

  const [mounted, setMounted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [logSource, setLogSource] = useState<"server" | "database">("server");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Action items ─────────────────────────────────────────────────────────

  const serverCanStart = devServer.status === "idle" || devServer.status === "error";
  const serverCanStop = devServer.status === "running" || devServer.status === "starting";
  const serverDisabled = !activeProject || devServer.isLoading;
  const dbBusy = db.commandStatus === "running";
  const dbDisabled = !activeProject || db.isLoading || dbBusy;
  const appName = activeProject?.path.split("/").pop() ?? "app";

  const allItems: ActionItem[] = useMemo(() => {
    const items: ActionItem[] = [];

    // Dev Server actions
    items.push(
      {
        id: "server-start",
        section: "Dev Server",
        label: "Start Server",
        description: "Start the Next.js development server",
        action: devServer.start,
        disabled: serverDisabled || !serverCanStart,
        badge: devServer.status === "running" && devServer.port
          ? { label: `localhost:${devServer.port}`, color: "text-emerald-400 bg-emerald-500/10" }
          : undefined,
      },
      {
        id: "server-stop",
        section: "Dev Server",
        label: "Stop Server",
        description: "Stop the running development server",
        action: devServer.stop,
        disabled: serverDisabled || !serverCanStop,
      },
      {
        id: "server-restart",
        section: "Dev Server",
        label: "Restart Server",
        description: "Stop and restart the development server",
        action: devServer.restart,
        disabled: serverDisabled || !serverCanStop,
      },
      {
        id: "server-clear-cache",
        section: "Dev Server",
        label: "Clear .next Cache",
        description: "Remove the .next build cache directory",
        action: devServer.clearCache,
        disabled: serverDisabled || !serverCanStart,
      },
    );

    // Database actions
    if (db.isMonorepo) {
      items.push(
        {
          id: "services-start",
          section: "Services",
          label: "Start Services",
          description: "Start Docker services for the monorepo",
          action: db.servicesStart,
          disabled: dbDisabled || db.servicesUp,
          badge: db.servicesUp
            ? { label: "Running", color: "text-emerald-400 bg-emerald-500/10" }
            : undefined,
        },
        {
          id: "services-stop",
          section: "Services",
          label: "Stop Services",
          description: "Stop all Docker services",
          action: db.servicesStop,
          disabled: dbDisabled || !db.servicesUp,
        },
        {
          id: "db-migrate",
          section: `${appName} DB`,
          label: "Migrate",
          description: `Run database migrations for ${appName}`,
          action: db.dbMigrate,
          disabled: dbDisabled,
        },
        {
          id: "db-seed",
          section: `${appName} DB`,
          label: "Seed",
          description: `Seed the ${appName} database with initial data`,
          action: db.dbSeed,
          disabled: dbDisabled,
        },
        {
          id: "db-reset",
          section: `${appName} DB`,
          label: "Reset",
          description: `Reset the ${appName} database (destructive)`,
          action: db.dbReset,
          disabled: dbDisabled,
        },
        {
          id: "auth-migrate",
          section: "Auth DB",
          label: "Migrate",
          description: "Run auth database migrations",
          action: db.authMigrate,
          disabled: dbDisabled,
        },
        {
          id: "auth-seed",
          section: "Auth DB",
          label: "Seed",
          description: "Seed the auth database",
          action: db.authSeed,
          disabled: dbDisabled,
        },
        {
          id: "auth-reset",
          section: "Auth DB",
          label: "Reset",
          description: "Reset the auth database (destructive)",
          action: db.authReset,
          disabled: dbDisabled,
        },
      );
    } else {
      items.push(
        {
          id: "supabase-start",
          section: "Database",
          label: "Start Supabase",
          description: "Start the local Supabase instance",
          action: db.start,
          disabled: dbDisabled || db.servicesUp,
          badge: db.servicesUp
            ? { label: "Running", color: "text-emerald-400 bg-emerald-500/10" }
            : undefined,
        },
        {
          id: "supabase-stop",
          section: "Database",
          label: "Stop Supabase",
          description: "Stop the local Supabase instance",
          action: db.stop,
          disabled: dbDisabled || !db.servicesUp,
        },
        {
          id: "db-migrate-up",
          section: "Database",
          label: "Migrate",
          description: "Run pending database migrations",
          action: db.migrateUp,
          disabled: dbDisabled,
        },
        {
          id: "db-reset-single",
          section: "Database",
          label: "Reset",
          description: "Reset the database (destructive)",
          action: db.dbReset,
          disabled: dbDisabled,
        },
        {
          id: "db-seed-single",
          section: "Database",
          label: "Seed",
          description: "Seed the database with initial data",
          action: db.dbSeed,
          disabled: dbDisabled,
        },
      );
    }

    return items;
  }, [activeProject, devServer, db, serverCanStart, serverCanStop, serverDisabled, dbDisabled, appName]);

  // ── Filtered items ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!searchQuery) return allItems;
    return allItems.filter(
      (item) => fuzzyMatch(item.label, searchQuery) || fuzzyMatch(item.description, searchQuery) || fuzzyMatch(item.section, searchQuery)
    );
  }, [allItems, searchQuery]);

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (searchQuery) setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Execute action ───────────────────────────────────────────────────────

  const executeItem = useCallback((item: ActionItem) => {
    if (item.disabled) return;
    // Switch log source based on section
    if (item.section === "Dev Server") {
      setLogSource("server");
    } else {
      setLogSource("database");
    }
    item.action();
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Search focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (searchQuery) {
            setSearchQuery("");
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
        }
        return;
      }

      // List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
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
        const item = filtered[selectedIndex];
        if (item) executeItem(item);
      } else if (e.key === "l") {
        e.preventDefault();
        setLogSource((s) => (s === "server" ? "database" : "server"));
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [searchFocused, searchQuery, filtered, selectedIndex, executeItem]);

  // ── Status badges ────────────────────────────────────────────────────────

  const serverStatusCfg = {
    idle:     { dot: "bg-zinc-500",                label: "Idle",     color: "text-zinc-400 bg-zinc-500/10" },
    starting: { dot: "bg-amber-500 animate-pulse", label: "Starting", color: "text-amber-400 bg-amber-500/10" },
    running:  { dot: "bg-emerald-500",              label: "Running",  color: "text-emerald-400 bg-emerald-500/10" },
    stopping: { dot: "bg-amber-500 animate-pulse", label: "Stopping", color: "text-amber-400 bg-amber-500/10" },
    error:    { dot: "bg-red-500",                  label: "Error",    color: "text-red-400 bg-red-500/10" },
  }[devServer.status];

  const dbStatusCfg = {
    idle:    { dot: "bg-zinc-500",                label: "Idle",    color: "text-zinc-400 bg-zinc-500/10" },
    running: { dot: "bg-amber-500 animate-pulse", label: "Running", color: "text-amber-400 bg-amber-500/10" },
    done:    { dot: "bg-emerald-500",              label: "Done",    color: "text-emerald-400 bg-emerald-500/10" },
    error:   { dot: "bg-red-500",                  label: "Error",   color: "text-red-400 bg-red-500/10" },
  }[db.commandStatus];

  // ── Group items by section ───────────────────────────────────────────────

  const sections = useMemo(() => {
    const map = new Map<string, ActionItem[]>();
    for (const item of filtered) {
      const list = map.get(item.section);
      if (list) list.push(item);
      else map.set(item.section, [item]);
    }
    return map;
  }, [filtered]);

  const selectedId = filtered[selectedIndex]?.id;
  const logs = logSource === "server" ? devServer.logs : db.logs;
  const clearLogs = logSource === "server" ? devServer.clearLogs : db.clearLogs;

  return (
    <div className={`flex h-full flex-col text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Local Development</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {activeProject ? activeProject.title : "No project selected"}
            </p>
          </div>
          {activeProject && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/[0.06] ${serverStatusCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${serverStatusCfg.dot}`} />
                Server: {serverStatusCfg.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/[0.06] ${dbStatusCfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dbStatusCfg.dot}`} />
                DB: {dbStatusCfg.label}
              </span>
              {devServer.port && devServer.status === "running" && (
                <a
                  href={`http://localhost:${devServer.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium font-mono px-2.5 py-1 rounded-full border border-white/[0.06] text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 transition-colors"
                >
                  localhost:{devServer.port}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-2.5">
        <div className="flex items-center gap-2 max-w-xl">
          <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Filter actions…"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
          />
          {!searchFocused && (
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">/</kbd>
          )}
        </div>
      </div>

      {/* Main content — split: actions list + log viewer */}
      <div className="flex flex-1 overflow-hidden">
        {/* Actions list */}
        <div ref={listRef} className="w-80 shrink-0 overflow-y-auto border-r border-zinc-800">
          {!activeProject ? (
            <div className="py-16 text-center text-sm text-zinc-600 px-4">Select a project to manage</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-600">No matching actions</div>
          ) : (
            Array.from(sections.entries()).map(([section, items]) => (
              <div key={section}>
                <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800/50 px-4 py-2">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{section}</span>
                </div>
                {items.map((item) => {
                  const isSelected = item.id === selectedId && !searchFocused;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        const idx = filtered.findIndex((f) => f.id === item.id);
                        if (idx >= 0) setSelectedIndex(idx);
                        executeItem(item);
                      }}
                      onMouseMove={() => {
                        const idx = filtered.findIndex((f) => f.id === item.id);
                        if (idx >= 0 && idx !== selectedIndex) setSelectedIndex(idx);
                      }}
                      className={`px-4 py-3 transition-colors cursor-pointer border-b border-zinc-800/50 ${
                        item.disabled ? "opacity-40" : ""
                      } ${
                        isSelected
                          ? "bg-violet-500/[0.04] border-l-2 border-l-violet-500/60"
                          : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${isSelected ? "bg-violet-400" : "bg-transparent"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FuzzyText text={item.label} query={searchQuery} className="text-[13px] font-medium text-zinc-200" />
                            {item.badge && (
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${item.badge.color}`}>
                                {item.badge.label}
                              </span>
                            )}
                            {isSelected && !item.disabled && (
                              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Enter</kbd>
                            )}
                          </div>
                          <FuzzyText text={item.description} query={searchQuery} className="text-[11px] text-zinc-500 block mt-0.5" highlightClass="text-violet-400 font-medium" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Log viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Log source tabs */}
          <div className="shrink-0 flex items-center gap-1 border-b border-zinc-800 px-4 py-2">
            <button
              tabIndex={-1}
              onClick={() => setLogSource("server")}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                logSource === "server" ? "bg-white/[0.06] text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Server Logs
            </button>
            <button
              tabIndex={-1}
              onClick={() => setLogSource("database")}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                logSource === "database" ? "bg-white/[0.06] text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Database Logs
            </button>
            <kbd className="ml-1 rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">l</kbd>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <LogViewer logs={logs} onClear={clearLogs} />
          </div>
        </div>
      </div>

      {/* Bottom hints */}
      <div className="shrink-0 border-t border-zinc-800 px-6 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd> <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd> navigate</span>
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> execute</span>
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd> search</span>
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">l</kbd> toggle logs</span>
      </div>
    </div>
  );
}
