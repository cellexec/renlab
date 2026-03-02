"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  architecture: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  component: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  decision: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  pattern: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  api: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] text-zinc-500 tabular-nums">{value}%</span>
    </div>
  );
}

export default function KnowledgePage() {
  const { activeProject } = useProjectContext();
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapLog, setBootstrapLog] = useState<string[]>([]);

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

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Select a project to view its knowledge base.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    );
  }

  // Group docs by category
  const grouped: Record<string, DocEntry[]> = {};
  for (const doc of docs) {
    const cat = doc.frontmatter.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(doc);
  }

  const categoryOrder = ["architecture", "component", "pattern", "decision", "api"];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Knowledge Base</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {status?.exists
              ? `${status.docCount} document${status.docCount !== 1 ? "s" : ""} indexed`
              : "Not initialized yet"}
          </p>
        </div>
        {status?.exists && (
          <button
            onClick={handleBootstrap}
            disabled={bootstrapping}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            {bootstrapping ? "Bootstrapping..." : "Re-bootstrap"}
          </button>
        )}
      </div>

      {/* Bootstrap state */}
      {bootstrapping && (
        <div className="mb-8 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
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
        <div className="flex flex-col items-center justify-center py-20">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-6">
            <svg className="w-12 h-12 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-2">Initialize Knowledge Base</h2>
          <p className="text-sm text-zinc-500 mb-6 text-center max-w-md">
            An AI agent will scan your codebase and generate documentation about architecture, patterns, and components.
            This knowledge improves spec writing, coding context, and review accuracy.
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

      {/* Docs list by category */}
      {status?.exists && !bootstrapping && (
        <div className="space-y-8">
          {categoryOrder.map((cat) => {
            const catDocs = grouped[cat];
            if (!catDocs || catDocs.length === 0) return null;
            const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.api;

            return (
              <div key={cat}>
                <h2 className="text-sm font-semibold text-zinc-300 mb-3 capitalize">{cat}</h2>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {catDocs.map((doc) => (
                    <Link
                      key={doc.slug}
                      href={`/knowledge/${doc.slug}`}
                      className="group p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 line-clamp-1">
                          {doc.frontmatter.title}
                        </h3>
                        <span className={`shrink-0 ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {cat}
                        </span>
                      </div>
                      {doc.frontmatter.description && (
                        <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{doc.frontmatter.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        {doc.frontmatter.confidence != null && (
                          <ConfidenceBar value={doc.frontmatter.confidence} />
                        )}
                        {doc.frontmatter.tags && doc.frontmatter.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {doc.frontmatter.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 text-[10px] text-zinc-600 bg-white/[0.03] rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Last update info */}
          {status.lastUpdate && (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-zinc-600">
                Last updated: {new Date(status.lastUpdate.createdAt).toLocaleString()} ({status.lastUpdate.type})
                {status.lastUpdate.commitSha && (
                  <span className="ml-2 font-mono">{status.lastUpdate.commitSha.slice(0, 8)}</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
