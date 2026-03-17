"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "../components/ProjectContext";
import type { KnowledgeUpdate, KnowledgeFrontmatter } from "../knowledge";

interface DocEntry {
  slug: string;
  frontmatter: KnowledgeFrontmatter;
}

interface KnowledgeStatus {
  exists: boolean;
  docCount: number;
  lastUpdate: KnowledgeUpdate | null;
  updates: KnowledgeUpdate[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  architecture: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20", dot: "bg-violet-500" },
  component:    { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20",   dot: "bg-blue-500" },
  decision:     { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20",  dot: "bg-amber-500" },
  pattern:      { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-500" },
  api:          { bg: "bg-cyan-500/10",   text: "text-cyan-400",   border: "border-cyan-500/20",   dot: "bg-cyan-500" },
};

const CATEGORY_ORDER = ["architecture", "component", "pattern", "decision", "api"];

// =============================================================================
// Fuzzy search
// =============================================================================

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
  text: string; query: string; className?: string; highlightClass?: string;
}) {
  if (!query) return <span className={className}>{text}</span>;
  const indices = fuzzyIndices(text, query);
  if (!indices || indices.size === 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {Array.from(text).map((ch, i) =>
        indices.has(i) ? (
          <span key={i} className={highlightClass ?? "text-violet-300 font-semibold"}>{ch}</span>
        ) : (<span key={i}>{ch}</span>)
      )}
    </span>
  );
}

// =============================================================================
// Main page
// =============================================================================

export default function KnowledgePage() {
  const router = useRouter();
  const { activeProject } = useProjectContext();
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapLog, setBootstrapLog] = useState<string[]>([]);

  // Vimstyle state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mouse handling
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const projectId = activeProject?.id;

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [statusRes, docsRes] = await Promise.all([
        fetch(`/api/knowledge?projectId=${projectId}`),
        fetch(`/api/knowledge/docs?projectId=${projectId}`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (docsRes.ok) setDocs(await docsRes.json());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBootstrap = async () => {
    if (!projectId) return;
    setBootstrapping(true);
    setBootstrapLog([]);
    try {
      const res = await fetch("/api/knowledge/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "status" || data.type === "text") {
              setBootstrapLog((prev) => [...prev.slice(-50), data.message || data.text]);
            } else if (data.type === "tool") {
              setBootstrapLog((prev) => [...prev.slice(-50), `[${data.name}] (${data.count})`]);
            } else if (data.type === "done") {
              setBootstrapLog((prev) => [...prev, "Bootstrap complete!"]);
            } else if (data.type === "error") {
              setBootstrapLog((prev) => [...prev, `Error: ${data.message}`]);
            }
          } catch {}
        }
      }
      await fetchData();
    } finally {
      setBootstrapping(false);
    }
  };

  // Filtered + grouped flat list
  const filtered = useMemo(() => {
    let result = docs;
    if (query.trim()) {
      result = result.filter((d) =>
        fuzzyMatch(d.frontmatter.title, query) ||
        fuzzyMatch(d.frontmatter.category || "", query) ||
        fuzzyMatch(d.frontmatter.description || "", query)
      );
    }
    // Sort by category order
    const sorted: DocEntry[] = [];
    for (const cat of CATEGORY_ORDER) {
      sorted.push(...result.filter((d) => (d.frontmatter.category || "other") === cat));
    }
    // Add remaining (uncategorized)
    sorted.push(...result.filter((d) => !CATEGORY_ORDER.includes(d.frontmatter.category || "other")));
    return sorted;
  }, [docs, query]);

  // Section boundaries
  const sections = useMemo(() => {
    const result: { category: string; startIndex: number; count: number }[] = [];
    let idx = 0;
    const cats = [...CATEGORY_ORDER, "other"];
    for (const cat of cats) {
      const count = filtered.filter((d) => (d.frontmatter.category || "other") === cat).length;
      if (count > 0) {
        result.push({ category: cat, startIndex: idx, count });
        idx += count;
      }
    }
    return result;
  }, [filtered]);

  // Clamp selection
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-item-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Mouse tracking
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      if (!mouseActive && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) setMouseActive(true);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [mouseActive]);

  // Keyboard handler (capture phase)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // LAYER 1: Search focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (query) { setQuery(""); } else { searchRef.current?.blur(); setSearchFocused(false); }
        } else if (e.key === "Enter") {
          e.preventDefault();
          searchRef.current?.blur();
          setSearchFocused(false);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
        return;
      }

      // LAYER 2: List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "/") {
        e.preventDefault();
        setSearchFocused(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setMouseActive(false);
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setMouseActive(false);
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const doc = filtered[selectedIndex];
        if (doc) router.push(`/knowledge/${doc.slug}`);
      } else if (e.key === "b" && status?.exists && !bootstrapping) {
        e.preventDefault();
        handleBootstrap();
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.back();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [searchFocused, query, filtered, selectedIndex, router, status, bootstrapping]);

  // Loading / no project states
  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p className="text-sm">Select a project to view its knowledge base.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-zinc-100">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-zinc-950 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Knowledge Base</h1>
          <span className="text-sm text-zinc-500">
            {status?.exists
              ? `${status.docCount} doc${status.docCount !== 1 ? "s" : ""}`
              : "Not initialized"}
          </span>
          <div className="flex-1" />
          {status?.exists && (
            <button
              onClick={handleBootstrap}
              disabled={bootstrapping}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all disabled:opacity-50"
            >
              {bootstrapping ? "Bootstrapping..." : "Re-bootstrap"}
              <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">b</kbd>
            </button>
          )}
        </div>
        {status?.lastUpdate && (
          <p className="text-[11px] text-zinc-600">
            Last updated: {new Date(status.lastUpdate.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {status.lastUpdate.commitSha && (
              <span className="ml-1 font-mono">{status.lastUpdate.commitSha.slice(0, 8)}</span>
            )}
          </p>
        )}
      </div>

      {/* Content area with boxed panel */}
      <div className="flex-1 min-h-0 overflow-hidden p-8">
        {/* Bootstrap log */}
        {bootstrapping && (
          <div className="mb-5 p-4 rounded-xl border-2 border-white/[0.08] bg-zinc-950/60">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-4 w-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-zinc-200">Bootstrapping knowledge base...</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-[11px] text-zinc-500">
              {bootstrapLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {/* Not initialized */}
        {!status?.exists && !bootstrapping && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-6">
              <svg className="w-12 h-12 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-2">Initialize Knowledge Base</h2>
            <p className="text-sm text-zinc-500 mb-6 text-center max-w-md">
              An AI agent will scan your codebase and generate documentation about architecture, patterns, and components.
            </p>
            <button
              onClick={handleBootstrap}
              disabled={bootstrapping}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Bootstrap Knowledge
            </button>
          </div>
        )}

        {/* Docs list in boxed panel */}
        {status?.exists && !bootstrapping && (
          <div className="flex flex-col h-full rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 overflow-hidden">
            {/* Search bar */}
            <div className="shrink-0 border-b border-white/[0.06] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                {!searchFocused && !query && (
                  <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">/</kbd>
                )}
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Filter documents..."
                  className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
                />
                {query && (
                  <span className="text-[10px] text-zinc-600">
                    {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {/* List */}
            <div ref={listRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollPaddingTop: 28 }}>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <p className="text-sm text-zinc-500">No matching documents</p>
                  <p className="text-xs text-zinc-700 mt-1">Try a different search</p>
                </div>
              ) : (
                sections.map(({ category, startIndex, count }) => {
                  const colors = CATEGORY_COLORS[category] ?? { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20", dot: "bg-zinc-500" };
                  return (
                    <div key={category}>
                      {/* Section header */}
                      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-white/[0.04] px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
                            {category}
                          </span>
                          <span className="text-[10px] text-zinc-700 font-mono">({count})</span>
                        </div>
                      </div>

                      {/* Items */}
                      {filtered.slice(startIndex, startIndex + count).map((doc, gi) => {
                        const idx = startIndex + gi;
                        const isSelected = idx === selectedIndex;
                        const confidence = doc.frontmatter.confidence;

                        return (
                          <div
                            key={doc.slug}
                            data-item-index={idx}
                            onClick={() => { setSelectedIndex(idx); router.push(`/knowledge/${doc.slug}`); }}
                            onMouseMove={() => {
                              if (mouseActive && selectedIndex !== idx) setSelectedIndex(idx);
                            }}
                            className={`border-b border-white/[0.04] px-4 py-2.5 cursor-pointer transition-all duration-75 ${
                              isSelected
                                ? "bg-violet-500/[0.08] border-l-2 border-l-violet-500"
                                : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Selection dot */}
                              <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                                isSelected ? "bg-violet-400" : "bg-transparent"
                              }`} />

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <FuzzyText
                                    text={doc.frontmatter.title}
                                    query={query}
                                    className={`text-sm truncate ${isSelected ? "text-zinc-100" : "text-zinc-300"}`}
                                  />
                                  {isSelected && (
                                    <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 shrink-0">Enter</kbd>
                                  )}
                                </div>
                                {doc.frontmatter.description && (
                                  <span className="text-[11px] text-zinc-600 mt-0.5 block truncate">{doc.frontmatter.description}</span>
                                )}
                              </div>

                              {/* Confidence score */}
                              {confidence != null && (
                                <span className={`text-xs font-mono tabular-nums font-medium shrink-0 w-8 text-right ${
                                  confidence >= 85 ? "text-emerald-400" : confidence >= 70 ? "text-amber-400" : "text-zinc-500"
                                }`}>
                                  {confidence}
                                </span>
                              )}

                              {/* Tags */}
                              {doc.frontmatter.tags && doc.frontmatter.tags.length > 0 && (
                                <div className="flex gap-1 shrink-0">
                                  {doc.frontmatter.tags.slice(0, 2).map((tag) => (
                                    <span key={tag} className="px-1.5 py-0.5 text-[10px] text-zinc-600 bg-white/[0.03] rounded">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom hints bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-5 py-2 flex items-center gap-5 text-xs text-zinc-600">
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">j</kbd>{" "}
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">k</kbd> navigate
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Enter</kbd> open
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">/</kbd> search
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">b</kbd> bootstrap
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">Esc</kbd> back
        </span>
      </div>
    </div>
  );
}
