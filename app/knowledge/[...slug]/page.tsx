"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useProjectContext } from "../../components/ProjectContext";
import type { KnowledgeFrontmatter } from "../../knowledge";

interface KnowledgeDoc {
  slug: string;
  frontmatter: KnowledgeFrontmatter;
  content: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  architecture: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  component: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  decision: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  pattern: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  api: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
};

export default function KnowledgeDocPage() {
  const params = useParams();
  const { activeProject } = useProjectContext();
  const [doc, setDoc] = useState<KnowledgeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const slug = Array.isArray(params.slug) ? params.slug.join("/") : (params.slug ?? "");

  useEffect(() => {
    if (!activeProject?.id || !slug) return;

    fetch(`/api/knowledge/docs?projectId=${activeProject.id}&slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Document not found");
        setDoc(await res.json());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeProject?.id, slug]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500">{error || "Document not found"}</p>
        <Link href="/knowledge" className="text-sm text-violet-400 hover:text-violet-300">
          Back to Knowledge Base
        </Link>
      </div>
    );
  }

  const fm = doc.frontmatter;
  const colors = CATEGORY_COLORS[fm.category] ?? CATEGORY_COLORS.api;

  // Build breadcrumb segments
  const slugParts = slug.split("/");
  const category = slugParts.length > 1 ? slugParts[0] : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-zinc-500 mb-6">
          <Link href="/" className="hover:text-zinc-300">Dashboard</Link>
          <span>/</span>
          <Link href="/knowledge" className="hover:text-zinc-300">Knowledge</Link>
          {category && (
            <>
              <span>/</span>
              <span className="capitalize">{category}</span>
            </>
          )}
          <span>/</span>
          <span className="text-zinc-300">{fm.title}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-zinc-100 mb-2">{fm.title}</h1>
            {fm.description && <p className="text-sm text-zinc-400">{fm.description}</p>}
          </div>
          <span className={`shrink-0 px-2 py-1 text-xs font-medium rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
            {fm.category}
          </span>
        </div>

        <div className="flex gap-8">
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-400 prose-strong:text-zinc-200 prose-code:text-violet-400 prose-code:bg-white/[0.04] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/[0.06] prose-a:text-violet-400 prose-li:text-zinc-400">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {doc.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Metadata sidebar */}
          <div className="shrink-0 w-56 space-y-5">
            {/* Confidence */}
            {fm.confidence != null && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 mb-2">Confidence</p>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${fm.confidence >= 85 ? "bg-emerald-500" : fm.confidence >= 70 ? "bg-amber-500" : "bg-zinc-500"}`}
                      style={{ width: `${fm.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">{fm.confidence}%</span>
                </div>
              </div>
            )}

            {/* File paths */}
            {fm.filePaths && fm.filePaths.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 mb-2">File Paths</p>
                <div className="space-y-1">
                  {fm.filePaths.map((fp) => (
                    <p key={fp} className="text-xs text-zinc-500 font-mono truncate">{fp}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {fm.tags && fm.tags.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {fm.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] text-zinc-500 bg-white/[0.04] border border-white/[0.06] rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Related specs */}
            {fm.relatedSpecs && fm.relatedSpecs.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 mb-2">Related Specs</p>
                <div className="space-y-1">
                  {fm.relatedSpecs.map((specId) => (
                    <Link key={specId} href={`/specifications/${specId}`} className="block text-xs text-violet-400 hover:text-violet-300 truncate">
                      {specId.slice(0, 8)}...
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline run */}
            {fm.pipelineRunId && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 mb-2">Pipeline Run</p>
                <Link href={`/pipelines/${fm.pipelineRunId}`} className="text-xs text-violet-400 hover:text-violet-300 font-mono">
                  {fm.pipelineRunId.slice(0, 8)}...
                </Link>
              </div>
            )}

            {/* Last updated */}
            {fm.lastUpdated && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600 mb-2">Last Updated</p>
                <p className="text-xs text-zinc-500">{new Date(fm.lastUpdated).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
