"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useProjectContext } from "../components/ProjectContext";

const IMPORT_PATH_KEY = "importDefaultPath";

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

/** Returns indices of matched characters, or null if no match. */
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

function FuzzyHighlight({ text, query, className, highlightClass }: {
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

// ── Setting item type ────────────────────────────────────────────────────────

interface SettingItem {
  id: string;
  section: string;
  title: string;
  description: string;
  render: () => React.ReactNode;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { activeProject, updateProject } = useProjectContext();
  const [threshold, setThreshold] = useState(80);
  const [maxRetries, setMaxRetries] = useState(2);
  const [scrollLines, setScrollLines] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Tab group
  type SettingsTab = "project" | "global";
  const [activeTab, setActiveTab] = useState<SettingsTab>(activeProject ? "project" : "global");

  // Host settings
  const [importPath, setImportPath] = useState("");
  const [savedImportPath, setSavedImportPath] = useState("");

  // Navigation
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(IMPORT_PATH_KEY);
    if (stored) {
      setImportPath(stored);
      setSavedImportPath(stored);
    } else {
      fetch("/api/folders").then((r) => r.json()).then((data) => {
        if (data.current) {
          setImportPath(data.current);
          setSavedImportPath(data.current);
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (activeProject) {
      setThreshold(activeProject.pipelineThreshold);
      setMaxRetries(activeProject.maxRetries);
      setScrollLines(activeProject.scrollLines);
    }
  }, [activeProject]);

  // ── Setting items ────────────────────────────────────────────────────────

  const allItems: SettingItem[] = useMemo(() => {
    const items: SettingItem[] = [];

    // ── Global settings ──
    if (activeTab === "global") {
      items.push({
        id: "import-path",
        section: "Host",
        title: "Default Import Path",
        description: "Starting directory when browsing for projects to import",
        render: () => (
          <input
            ref={(el) => { if (el) inputRefs.current.set("import-path", el); }}
            type="text"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            onFocus={() => setEditingId("import-path")}
            onBlur={() => setEditingId(null)}
            placeholder="~/projects"
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-200 font-mono placeholder-zinc-600 outline-none transition-colors focus:border-violet-500/30"
          />
        ),
      });
    }

    // ── Project settings ──
    if (activeTab === "project" && activeProject) {
      items.push(
        {
          id: "threshold",
          section: "Pipeline",
          title: "Review Score Threshold",
          description: "Minimum score (0-100) to auto-merge pipeline results",
          render: () => (
            <div className="flex items-center gap-4">
              <input
                ref={(el) => { if (el) inputRefs.current.set("threshold", el); }}
                type="range"
                min={0}
                max={100}
                step={5}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onFocus={() => setEditingId("threshold")}
                onBlur={() => setEditingId(null)}
                className="flex-1 accent-violet-500 h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(139,92,246,0.4)]
                  [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-violet-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <span className="text-lg font-bold tabular-nums text-zinc-100 w-10 text-right font-mono">
                {threshold}
              </span>
            </div>
          ),
        },
        {
          id: "retries",
          section: "Pipeline",
          title: "Max Review Retries",
          description: "How many times the coder agent can retry after review rejection",
          render: () => (
            <div className="flex items-center gap-3">
              <button
                tabIndex={-1}
                onClick={() => setMaxRetries((v) => Math.max(0, v - 1))}
                disabled={maxRetries <= 0}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-300 text-sm transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                -
              </button>
              <input
                ref={(el) => { if (el) inputRefs.current.set("retries", el); }}
                type="number"
                min={0}
                max={5}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Math.min(5, Math.max(0, Number(e.target.value) || 0)))}
                onFocus={() => setEditingId("retries")}
                onBlur={() => setEditingId(null)}
                className="w-12 text-center rounded-lg border border-white/[0.06] bg-white/[0.03] py-1 text-lg font-bold tabular-nums text-zinc-100 font-mono outline-none transition-colors focus:border-violet-500/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <button
                tabIndex={-1}
                onClick={() => setMaxRetries((v) => Math.min(5, v + 1))}
                disabled={maxRetries >= 5}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-300 text-sm transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          ),
        },
        {
          id: "scroll-lines",
          section: "Editor",
          title: "Scroll Lines (j/k)",
          description: "Number of lines to scroll per j/k press in view mode",
          render: () => (
            <div className="flex items-center gap-3">
              <button
                tabIndex={-1}
                onClick={() => setScrollLines((v) => Math.max(1, v - 1))}
                disabled={scrollLines <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-300 text-sm transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                -
              </button>
              <input
                ref={(el) => { if (el) inputRefs.current.set("scroll-lines", el); }}
                type="number"
                min={1}
                max={20}
                value={scrollLines}
                onChange={(e) => setScrollLines(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                onFocus={() => setEditingId("scroll-lines")}
                onBlur={() => setEditingId(null)}
                className="w-12 text-center rounded-lg border border-white/[0.06] bg-white/[0.03] py-1 text-lg font-bold tabular-nums text-zinc-100 font-mono outline-none transition-colors focus:border-violet-500/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <button
                tabIndex={-1}
                onClick={() => setScrollLines((v) => Math.min(20, v + 1))}
                disabled={scrollLines >= 20}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-300 text-sm transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          ),
        }
      );
    }

    return items;
  }, [activeTab, activeProject, importPath, threshold, maxRetries, scrollLines]);

  // ── Filtered items ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!searchQuery) return allItems;
    return allItems.filter(
      (item) => fuzzyMatch(item.title, searchQuery) || fuzzyMatch(item.description, searchQuery) || fuzzyMatch(item.section, searchQuery)
    );
  }, [allItems, searchQuery]);

  // Reset selection on tab change
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeTab]);

  // Clamp selection
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Save logic ───────────────────────────────────────────────────────────

  const hostChanged = importPath !== savedImportPath;
  const projectChanged = activeProject
    ? threshold !== activeProject.pipelineThreshold || maxRetries !== activeProject.maxRetries || scrollLines !== activeProject.scrollLines
    : false;
  const hasChanges = hostChanged || projectChanged;

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setSaved(false);

    if (hostChanged) {
      const trimmed = importPath.trim();
      if (trimmed) {
        try {
          const res = await fetch(`/api/folders?path=${encodeURIComponent(trimmed)}`);
          const data = await res.json();
          const resolved = data.current || trimmed;
          setImportPath(resolved);
          setSavedImportPath(resolved);
          localStorage.setItem(IMPORT_PATH_KEY, resolved);
        } catch {
          setSavedImportPath(trimmed);
          localStorage.setItem(IMPORT_PATH_KEY, trimmed);
        }
      } else {
        localStorage.removeItem(IMPORT_PATH_KEY);
        setSavedImportPath(importPath);
      }
    }

    if (projectChanged && activeProject) {
      await updateProject(activeProject.id, { pipelineThreshold: threshold, maxRetries, scrollLines });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [hasChanges, saving, hostChanged, projectChanged, importPath, activeProject, threshold, maxRetries, scrollLines, updateProject]);

  // ── Keyboard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // When search is focused
      if (searchOpen && document.activeElement === searchRef.current) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchQuery("");
          setSearchOpen(false);
          searchRef.current?.blur();
        } else if (e.key === "Enter") {
          e.preventDefault();
          setSearchOpen(false);
          searchRef.current?.blur();
        }
        return;
      }

      // When editing an input
      if (editingId) {
        if (e.key === "Enter") {
          e.preventDefault();
          (document.activeElement as HTMLElement)?.blur();
          if (hasChanges && !saving) handleSave();
        } else if (e.key === "Escape") {
          e.preventDefault();
          // Reset to saved values
          setImportPath(savedImportPath);
          if (activeProject) {
            setThreshold(activeProject.pipelineThreshold);
            setMaxRetries(activeProject.maxRetries);
            setScrollLines(activeProject.scrollLines);
          }
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      // List navigation mode
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeProject) setActiveTab("project");
        return;
      } else if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        setActiveTab("global");
        return;
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearchOpen(true);
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
        if (item) {
          const el = inputRefs.current.get(item.id);
          el?.focus();
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editingId, searchOpen, filtered, selectedIndex, hasChanges, saving, handleSave, savedImportPath, activeProject]);

  // ── Render ───────────────────────────────────────────────────────────────

  // Group filtered items by section
  const sections = useMemo(() => {
    const map = new Map<string, SettingItem[]>();
    for (const item of filtered) {
      const list = map.get(item.section);
      if (list) list.push(item);
      else map.set(item.section, [item]);
    }
    return map;
  }, [filtered]);

  // Flat index → check which item is at selectedIndex
  const selectedId = filtered[selectedIndex]?.id;

  return (
    <div className={`flex h-full flex-col bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Settings</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          {activeProject ? activeProject.title : "No project selected"}
        </p>
      </div>

      {/* Tab group */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-2.5">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-xs text-zinc-600 flex items-center gap-1">
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&larr;</kbd>
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">&rarr;</kbd>
            <span className="ml-0.5">switch tab</span>
          </span>
        </div>
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 inline-flex gap-1">
          <button
            onClick={() => { if (activeProject) setActiveTab("project"); }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "project"
                ? "bg-white/[0.06] text-zinc-100"
                : activeProject
                  ? "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-300"
                  : "text-zinc-700 cursor-not-allowed"
            }`}
            disabled={!activeProject}
          >
            Project
          </button>
          <button
            onClick={() => setActiveTab("global")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "global"
                ? "bg-white/[0.06] text-zinc-100"
                : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-300"
            }`}
          >
            Global
          </button>
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
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            placeholder="Filter settings…"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
          />
          {!searchOpen && (
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">/</kbd>
          )}
        </div>
      </div>

      {/* Settings list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-600">No matching settings</div>
        ) : (
          Array.from(sections.entries()).map(([section, items]) => (
            <div key={section}>
              <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800/50 px-6 py-2">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{section}</span>
              </div>
              {items.map((item) => {
                const isSelected = item.id === selectedId && !editingId && !searchOpen;
                const isEditing = item.id === editingId;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      const idx = filtered.findIndex((f) => f.id === item.id);
                      if (idx >= 0) setSelectedIndex(idx);
                    }}
                    className={`border-b border-zinc-800/50 px-6 py-4 transition-colors cursor-pointer ${
                      isEditing
                        ? "bg-amber-500/[0.06] border-l-2 border-l-amber-500/60"
                        : isSelected
                          ? "bg-violet-500/[0.04] border-l-2 border-l-violet-500/60"
                          : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-4 max-w-xl">
                      {/* Selection indicator */}
                      <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        isEditing ? "bg-amber-400" : isSelected ? "bg-violet-400" : "bg-transparent"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FuzzyHighlight text={item.title} query={searchQuery} className="text-[13px] font-medium text-zinc-200" />
                          {isEditing && (
                            <span className="flex items-center gap-1.5">
                              {hasChanges && (
                                <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">Enter to save</kbd>
                              )}
                              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Esc to discard</kbd>
                            </span>
                          )}
                          {isSelected && (
                            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">Enter to edit</kbd>
                          )}
                        </div>
                        <FuzzyHighlight text={item.description} query={searchQuery} className="text-[12px] text-zinc-500 mb-3 block" highlightClass="text-violet-400 font-medium" />
                        {item.render()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Bottom hints bar */}
      <div className="shrink-0 border-t border-zinc-800 px-6 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">&larr;</kbd> <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">&rarr;</kbd> tab</span>
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd> <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd> navigate</span>
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> edit</span>
        <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd> search</span>
        {hasChanges && <span><kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd> save</span>}
      </div>

      {/* Sticky save bar */}
      <div
        className={`fixed bottom-12 left-0 right-0 z-50 flex items-center justify-center transition-all duration-300 pointer-events-none ${
          hasChanges || saved ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-xl px-5 py-3 shadow-2xl shadow-black/40">
          {saved ? (
            <div className="flex items-center gap-2 text-[13px] text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </div>
          ) : (
            <>
              <span className="text-[13px] text-zinc-400">Unsaved changes</span>
              <button
                tabIndex={-1}
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-all duration-200 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">Enter</kbd>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
