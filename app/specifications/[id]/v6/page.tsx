"use client";

import { useState, useEffect, useRef, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarkdownEditor } from "../../../components/MarkdownEditor";
import { AgentChat } from "../../../components/AgentChat";
import { VersionHistory } from "../../../components/VersionHistory";
import { PipelineTriggerButton } from "../../../components/PipelineTriggerButton";
import { DesignPipelineTriggerButton } from "../../../components/DesignPipelineTriggerButton";
import { useSpecificationStore } from "../../../hooks/useSpecificationStore";
import { usePipelineStore } from "../../../hooks/usePipelineStore";
import { useDesignPipelineStore } from "../../../hooks/useDesignPipelineStore";
import { useProjectContext } from "../../../components/ProjectContext";
import type { SpecificationStatus } from "../../../specifications";

/* ------------------------------------------------------------------ */
/*  Keyframe animations                                                */
/* ------------------------------------------------------------------ */

const dashKeyframes = `
@keyframes dashFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dashCardGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); }
  50% { box-shadow: 0 0 24px 2px rgba(139,92,246,0.08); }
}
@keyframes dashOverlayIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes dashOverlayOut {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.97); }
}
@keyframes dashSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dashPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

/* ------------------------------------------------------------------ */
/*  Status helpers                                                      */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<SpecificationStatus, { label: string; dot: string; bg: string; text: string; border: string }> = {
  draft:     { label: "Draft",     dot: "bg-zinc-400",    bg: "bg-zinc-400/10",    text: "text-zinc-400",    border: "border-zinc-400/20" },
  pipeline:  { label: "Pipeline",  dot: "bg-blue-400",    bg: "bg-blue-400/10",    text: "text-blue-300",    border: "border-blue-400/20" },
  failed:    { label: "Failed",    dot: "bg-red-400",     bg: "bg-red-400/10",     text: "text-red-300",     border: "border-red-400/20" },
  cancelled: { label: "Cancelled", dot: "bg-amber-400",   bg: "bg-amber-400/10",   text: "text-amber-300",   border: "border-amber-400/20" },
  done:      { label: "Done",      dot: "bg-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-300", border: "border-emerald-400/20" },
};

/* ------------------------------------------------------------------ */
/*  Card definition                                                     */
/* ------------------------------------------------------------------ */

type CardId = "metadata" | "actions" | "content" | "versions" | "chat" | "pipeline";

interface CardDef {
  id: CardId;
  title: string;
  icon: React.ReactNode;
}

const CARD_DEFS: CardDef[] = [
  {
    id: "metadata",
    title: "Metadata",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
  {
    id: "actions",
    title: "Quick Actions",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    id: "content",
    title: "Content",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    id: "versions",
    title: "Version Timeline",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "chat",
    title: "AI Assistant",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
  {
    id: "pipeline",
    title: "Pipeline",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
  },
];

// Navigation order: top-left(0), top-right(1), mid-left(2), mid-right(3), bot-left(4), bot-right(5)
const NAV_ORDER: CardId[] = ["metadata", "actions", "content", "versions", "chat", "pipeline"];

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function SpecV6Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { activeProject, activeProjectId } = useProjectContext();

  const {
    specifications,
    loaded,
    getLatestVersion,
    getVersions,
    saveVersion,
    updateTitle,
    isEditable,
    updateStatus,
  } = useSpecificationStore(activeProjectId);

  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  /* ---------- Core state ---------- */
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);

  /* ---------- Navigation state ---------- */
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [activeCard, setActiveCard] = useState<CardId | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ---------- Mouse tracking ---------- */
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseMovedRef = useRef(false);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

  /* ---------- Load initial content ---------- */
  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  /* ---------- Track dirty state ---------- */
  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  /* ---------- Save handler ---------- */
  const handleSave = async () => {
    if (!spec || !editable || saving) return;
    setSaving(true);
    try {
      if (title !== spec.title) await updateTitle(id, title);
      await saveVersion(id, content, undefined);
      initialContentRef.current = content;
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleApplySpec = (specContent: string) => {
    if (editable) setContent(specContent);
  };

  const handleRestore = (restoredContent: string) => {
    if (editable) setContent(restoredContent);
  };

  /* ---------- Content preview ---------- */
  const contentPreview = useMemo(() => {
    const lines = content.split("\n").slice(0, 20);
    return lines.join("\n");
  }, [content]);

  /* ---------- Search filtering ---------- */
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return CARD_DEFS;
    const q = searchQuery.toLowerCase();
    return CARD_DEFS.filter((c) => c.title.toLowerCase().includes(q));
  }, [searchQuery]);

  const filteredNavOrder = useMemo(() => {
    return filteredCards.map((c) => c.id);
  }, [filteredCards]);

  /* ---------- Focus search input ---------- */
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  /* ---------- Keyboard handler ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Search mode
      if (searchOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchOpen(false);
          setSearchQuery("");
          return;
        }
        if (e.key === "Enter" && filteredNavOrder.length > 0) {
          e.preventDefault();
          setSearchOpen(false);
          setSearchQuery("");
          const idx = NAV_ORDER.indexOf(filteredNavOrder[0]);
          if (idx >= 0) setFocusedIndex(idx);
          setActiveCard(filteredNavOrder[0]);
          return;
        }
        return; // let typing happen in search
      }

      // Card overlay mode
      if (activeCard) {
        if (e.key === "Escape") {
          e.preventDefault();
          setActiveCard(null);
          return;
        }
        return; // don't intercept other keys inside overlay
      }

      // Escape at grid level -> go back
      if (e.key === "Escape") {
        e.preventDefault();
        router.push("/specifications");
        return;
      }

      // Don't intercept typing in inputs
      if (isInput) return;

      const currentNavOrder = filteredNavOrder.length > 0 ? filteredNavOrder : NAV_ORDER;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          // Move down in 2-col grid means +2
          const currentCardId = NAV_ORDER[focusedIndex];
          const currentFilterIdx = currentNavOrder.indexOf(currentCardId);
          if (currentFilterIdx >= 0 && currentFilterIdx + 2 < currentNavOrder.length) {
            const nextCardId = currentNavOrder[currentFilterIdx + 2];
            const nextIdx = NAV_ORDER.indexOf(nextCardId);
            if (nextIdx >= 0) setFocusedIndex(nextIdx);
          } else if (currentFilterIdx >= 0) {
            // Wrap: go to top of same column
            const col = currentFilterIdx % 2;
            const targetCardId = currentNavOrder[col < currentNavOrder.length ? col : 0];
            const targetIdx = NAV_ORDER.indexOf(targetCardId);
            if (targetIdx >= 0) setFocusedIndex(targetIdx);
          }
          mouseMovedRef.current = false;
          break;
        }
        case "k": {
          e.preventDefault();
          const currentCardId = NAV_ORDER[focusedIndex];
          const currentFilterIdx = currentNavOrder.indexOf(currentCardId);
          if (currentFilterIdx >= 0 && currentFilterIdx - 2 >= 0) {
            const prevCardId = currentNavOrder[currentFilterIdx - 2];
            const prevIdx = NAV_ORDER.indexOf(prevCardId);
            if (prevIdx >= 0) setFocusedIndex(prevIdx);
          } else if (currentFilterIdx >= 0) {
            // Wrap: go to bottom of same column
            const col = currentFilterIdx % 2;
            let lastInCol = col;
            for (let i = col; i < currentNavOrder.length; i += 2) {
              lastInCol = i;
            }
            const targetCardId = currentNavOrder[lastInCol];
            const targetIdx = NAV_ORDER.indexOf(targetCardId);
            if (targetIdx >= 0) setFocusedIndex(targetIdx);
          }
          mouseMovedRef.current = false;
          break;
        }
        case "h":
        case "ArrowLeft": {
          e.preventDefault();
          const currentCardId = NAV_ORDER[focusedIndex];
          const currentFilterIdx = currentNavOrder.indexOf(currentCardId);
          if (currentFilterIdx >= 0 && currentFilterIdx % 2 === 1) {
            const leftCardId = currentNavOrder[currentFilterIdx - 1];
            const leftIdx = NAV_ORDER.indexOf(leftCardId);
            if (leftIdx >= 0) setFocusedIndex(leftIdx);
          }
          mouseMovedRef.current = false;
          break;
        }
        case "l":
        case "ArrowRight": {
          e.preventDefault();
          const currentCardId = NAV_ORDER[focusedIndex];
          const currentFilterIdx = currentNavOrder.indexOf(currentCardId);
          if (currentFilterIdx >= 0 && currentFilterIdx % 2 === 0 && currentFilterIdx + 1 < currentNavOrder.length) {
            const rightCardId = currentNavOrder[currentFilterIdx + 1];
            const rightIdx = NAV_ORDER.indexOf(rightCardId);
            if (rightIdx >= 0) setFocusedIndex(rightIdx);
          }
          mouseMovedRef.current = false;
          break;
        }
        case "Enter": {
          e.preventDefault();
          setActiveCard(NAV_ORDER[focusedIndex]);
          break;
        }
        case "/": {
          e.preventDefault();
          setSearchOpen(true);
          break;
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [focusedIndex, activeCard, searchOpen, filteredNavOrder, router]);

  /* ---------- Mouse hover with movement tracking ---------- */
  const handleCardMouseMove = (e: React.MouseEvent, cardIndex: number) => {
    if (!lastMousePosRef.current) {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
    const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
    if (dx > 3 || dy > 3) {
      mouseMovedRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (focusedIndex !== cardIndex) {
        setFocusedIndex(cardIndex);
      }
    }
  };

  /* ================================================================ */
  /*  LOADING STATE                                                    */
  /* ================================================================ */
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <style>{dashKeyframes}</style>
        <div className="h-6 w-6 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin" />
      </div>
    );
  }

  /* ================================================================ */
  /*  NOT FOUND STATE                                                  */
  /* ================================================================ */
  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100">
        <style>{dashKeyframes}</style>
        <p className="text-lg font-light tracking-wide text-zinc-400">Specification not found</p>
        <p className="text-sm text-zinc-600">It may have been deleted or moved.</p>
        <button
          onClick={() => router.push("/specifications")}
          className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-sm text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-300 transition-all"
        >
          Back to specifications
        </button>
      </div>
    );
  }

  // Non-null alias for use inside nested functions (TS doesn't narrow through closures)
  const s = spec;
  const statusStyle = STATUS_STYLE[s.status];
  const focusedCardId = NAV_ORDER[focusedIndex];

  /* ================================================================ */
  /*  Card content renderers                                           */
  /* ================================================================ */

  function renderCardPreview(cardId: CardId) {
    switch (cardId) {
      case "metadata":
        return (
          <div className="space-y-3">
            <div className="text-sm text-zinc-200 font-medium truncate">{title || "Untitled"}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${s.status === "pipeline" ? "animate-pulse" : ""}`} />
                {statusStyle.label}
              </span>
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 border border-white/[0.06]">
                {s.type === "ui-refactor" ? "UI Refactor" : "Feature"}
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-zinc-600">
              <div>Created {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
              <div>Updated {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
              {latestVersion && <div className="font-mono">Version {latestVersion.versionNumber}</div>}
            </div>
          </div>
        );
      case "actions": {
        const actions = [
          { label: "Save", kbd: "s", available: editable && hasChanges },
          { label: "Version History", kbd: "h", available: true },
          { label: "AI Chat", kbd: "c", available: true },
          { label: "Run Pipeline", kbd: "p", available: editable },
          { label: "Change Status", kbd: "d", available: s.status === "failed" || s.status === "cancelled" },
        ];
        return (
          <div className="space-y-1">
            {actions.map((action) => (
              <div
                key={action.label}
                className={`flex items-center justify-between py-1.5 px-2 rounded text-[12px] ${
                  action.available
                    ? "text-zinc-400"
                    : "text-zinc-700"
                }`}
              >
                <span>{action.label}</span>
                <kbd className="text-[10px] font-mono text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.5 rounded">
                  {action.kbd}
                </kbd>
              </div>
            ))}
          </div>
        );
      }
      case "content":
        return (
          <div className="space-y-2">
            {content ? (
              <pre className="text-[11px] text-zinc-500 font-mono whitespace-pre-wrap leading-relaxed line-clamp-[12] overflow-hidden">
                {contentPreview}
              </pre>
            ) : (
              <p className="text-[12px] text-zinc-600 italic">No content yet</p>
            )}
            {content && (
              <p className="text-[10px] text-zinc-700">
                {content.split("\n").length} lines total
              </p>
            )}
          </div>
        );
      case "versions":
        return (
          <div className="space-y-2">
            {versions.length === 0 ? (
              <p className="text-[12px] text-zinc-600 italic">No versions yet</p>
            ) : (
              versions.slice(-5).reverse().map((v) => (
                <div key={v.id} className="flex items-center gap-3 py-1">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-violet-400/60" />
                    <div className="w-px h-3 bg-white/[0.06]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-zinc-400">v{v.versionNumber}</span>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    {v.changeNote && (
                      <p className="text-[10px] text-zinc-600 truncate">{v.changeNote}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      case "chat":
        return (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <svg className="h-8 w-8 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <p className="text-[11px] text-zinc-600">
              {s.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
            </p>
          </div>
        );
      case "pipeline": {
        const isActive = hasActiveRun(id) || hasActiveDesignRun(id);
        const runId = activeRunId || activeDesignRunId;
        return (
          <div className="space-y-2">
            {isActive ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[12px] text-blue-300 font-medium">Pipeline Running</span>
                </div>
                {runId && (
                  <Link
                    href={s.type === "ui-refactor" ? `/design-pipelines/${runId}` : `/pipelines/${runId}`}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-400/80 hover:text-blue-300 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View run
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                    </svg>
                  </Link>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-zinc-600" />
                <span className="text-[12px] text-zinc-500">No active pipeline</span>
              </div>
            )}
            <p className="text-[10px] text-zinc-700">
              Type: {s.type === "ui-refactor" ? "Design Pipeline" : "Feature Pipeline"}
            </p>
          </div>
        );
      }
    }
  }

  /* ================================================================ */
  /*  Card overlay content renderers                                   */
  /* ================================================================ */

  function renderCardOverlay(cardId: CardId) {
    switch (cardId) {
      case "metadata":
        return (
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                readOnly={!editable}
                className={`
                  w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3
                  text-zinc-100 text-sm outline-none placeholder:text-zinc-700
                  focus:border-violet-500/30 transition-colors
                  ${!editable ? "cursor-default opacity-60" : ""}
                `}
                placeholder="Untitled Specification"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Status</label>
                <div className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                  <span className={`w-2 h-2 rounded-full ${statusStyle.dot} ${s.status === "pipeline" ? "animate-pulse" : ""}`} />
                  {statusStyle.label}
                </div>
                {(s.status === "failed" || s.status === "cancelled") && (
                  <button
                    onClick={() => updateStatus(id, "draft")}
                    className="block mt-2 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
                  >
                    Reset to Draft
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Type</label>
                <span className="text-sm text-zinc-300">
                  {s.type === "ui-refactor" ? "UI Refactor" : "Feature"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Created</label>
                <span className="text-sm text-zinc-400">
                  {new Date(s.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Last Updated</label>
                <span className="text-sm text-zinc-400">
                  {new Date(s.updatedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
            {latestVersion && (
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Current Version</label>
                <span className="text-sm font-mono text-zinc-400">v{latestVersion.versionNumber}</span>
              </div>
            )}
            {editable && hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full mt-2 py-2.5 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-400/20 text-sm font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        );
      case "actions":
        return (
          <div className="p-6 space-y-2">
            {[
              {
                label: "Save Specification",
                desc: "Save current changes",
                available: editable && hasChanges,
                action: handleSave,
              },
              {
                label: "Version History",
                desc: "Browse and restore previous versions",
                available: true,
                action: () => { setActiveCard("versions"); },
              },
              {
                label: "AI Chat",
                desc: `Chat with ${s.type === "ui-refactor" ? "Design" : "Feature"} Spec Expert`,
                available: true,
                action: () => { setActiveCard("chat"); },
              },
              {
                label: "Edit Content",
                desc: "Open the markdown editor",
                available: true,
                action: () => { setActiveCard("content"); },
              },
              ...(s.status === "failed" || s.status === "cancelled"
                ? [{
                    label: "Reset to Draft",
                    desc: "Unlock this specification for editing",
                    available: true,
                    action: () => updateStatus(id, "draft"),
                  }]
                : []),
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                disabled={!item.available}
                className={`
                  w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all
                  ${item.available
                    ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] text-zinc-300"
                    : "border-white/[0.03] bg-white/[0.01] text-zinc-600 cursor-not-allowed"
                  }
                `}
              >
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-[11px] text-zinc-600 mt-0.5">{item.desc}</div>
                </div>
                <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        );
      case "content":
        return (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Version viewing banner */}
            {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
              <div className="flex items-center gap-3 px-4 py-2 border-b border-blue-400/20 bg-blue-400/[0.05]">
                <span className="text-[12px] text-blue-300">Viewing v{viewingVersion.versionNumber}</span>
                <button
                  onClick={() => setViewingVersion(null)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
                >
                  Back to current
                </button>
              </div>
            )}
            {!editable && !viewingVersion && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.02]">
                <svg className="h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-[11px] text-zinc-600">Read-only</span>
              </div>
            )}
            <div className="flex-1 min-h-0 p-1">
              <MarkdownEditor
                value={viewingVersion ? viewingVersion.content : content}
                onChange={editable && !viewingVersion ? setContent : () => {}}
                placeholder="Begin writing your specification..."
                viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
              />
            </div>
            {editable && hasChanges && (
              <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-400/20 text-sm font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
        );
      case "versions":
        return (
          <div className="flex-1 min-h-0 flex flex-col">
            <VersionHistory
              versions={versions}
              onRestore={(restoredContent) => {
                handleRestore(restoredContent);
                setViewingVersion(null);
              }}
              onView={(versionContent, versionNumber) => {
                setViewingVersion({ content: versionContent, versionNumber });
                setActiveCard("content");
              }}
              canRestore={editable}
              viewingVersionNumber={viewingVersion?.versionNumber ?? null}
              className="flex-1"
            />
          </div>
        );
      case "chat":
        return (
          <div className="flex-1 min-h-0 flex flex-col">
            <AgentChat
              agentName={s.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
              context={content}
              onApplySpec={(specContent) => {
                handleApplySpec(specContent);
                setActiveCard("content");
              }}
              className="flex-1"
            />
          </div>
        );
      case "pipeline":
        return (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${hasActiveRun(id) || hasActiveDesignRun(id) ? "bg-blue-400 animate-pulse" : "bg-zinc-600"}`} />
              <span className="text-sm text-zinc-300 font-medium">
                {hasActiveRun(id) || hasActiveDesignRun(id) ? "Pipeline Running" : "No Active Pipeline"}
              </span>
            </div>
            {(activeRunId || activeDesignRunId) && (
              <Link
                href={s.type === "ui-refactor" ? `/design-pipelines/${activeDesignRunId}` : `/pipelines/${activeRunId}`}
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                View active run
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
                </svg>
              </Link>
            )}
            <div className="border-t border-white/[0.06] pt-4">
              <p className="text-[12px] text-zinc-500 mb-3">
                Type: {s.type === "ui-refactor" ? "Design Pipeline" : "Feature Pipeline"}
              </p>
              {editable && s.type === "feature" && activeProject && (
                <PipelineTriggerButton
                  specificationId={id}
                  specVersionId={latestVersion?.id ?? null}
                  specContent={content}
                  specTitle={title}
                  threshold={activeProject.pipelineThreshold}
                  maxRetries={activeProject.maxRetries}
                  hasActiveRun={hasActiveRun(id)}
                  activeRunId={getActiveRunId(id)}
                  onTrigger={triggerPipeline}
                />
              )}
              {editable && s.type === "ui-refactor" && activeProject && (
                <DesignPipelineTriggerButton
                  specificationId={id}
                  specVersionId={latestVersion?.id ?? null}
                  specContent={content}
                  specTitle={title}
                  hasActiveRun={hasActiveDesignRun(id)}
                  activeRunId={getActiveDesignRunId(id)}
                  onTrigger={triggerDesignPipeline}
                />
              )}
            </div>
          </div>
        );
    }
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="relative flex h-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <style>{dashKeyframes}</style>

      {/* ============================================================ */}
      {/*  HEADER                                                      */}
      {/* ============================================================ */}
      <div
        className="relative z-10 px-6 pt-5 pb-4 border-b border-white/[0.04]"
        style={{ animation: "dashFadeIn 0.4s ease-out" }}
      >
        <div className="flex items-center gap-1.5 text-[11px] mb-2">
          <button
            onClick={() => router.push("/specifications")}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Specifications
          </button>
          <span className="text-zinc-800">/</span>
          <span className="text-zinc-500 truncate max-w-[250px]">{s.title}</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight truncate">{s.title}</h1>
          <div className="flex items-center gap-2">
            {hasChanges && editable && (
              <span className="flex items-center gap-1.5 text-[11px] text-amber-400/80">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Unsaved
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${s.status === "pipeline" ? "animate-pulse" : ""}`} />
              {statusStyle.label}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  CARD GRID                                                   */}
      {/* ============================================================ */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto"
          style={{ animation: "dashSlideUp 0.5s ease-out" }}
        >
          {CARD_DEFS.map((card) => {
            const navIndex = NAV_ORDER.indexOf(card.id);
            const isFocused = focusedCardId === card.id && !activeCard;
            const isVisible = filteredCards.some((c) => c.id === card.id);

            if (!isVisible && searchQuery) return null;

            return (
              <div
                key={card.id}
                className={`
                  relative rounded-xl border backdrop-blur-sm
                  transition-all duration-200 cursor-pointer
                  ${isFocused
                    ? "border-violet-500/40 bg-white/[0.04] shadow-[0_0_24px_2px_rgba(139,92,246,0.06)]"
                    : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.04] hover:border-white/[0.08]"
                  }
                `}
                style={{ animationDelay: `${navIndex * 60}ms` }}
                onClick={() => setActiveCard(card.id)}
                onMouseMove={(e) => handleCardMouseMove(e, navIndex)}
              >
                {/* Glass effect top highlight */}
                <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

                {/* Card header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`${isFocused ? "text-violet-400" : "text-zinc-500"} transition-colors`}>
                      {card.icon}
                    </span>
                    <span className={`text-[12px] font-semibold uppercase tracking-wider ${isFocused ? "text-zinc-300" : "text-zinc-500"} transition-colors`}>
                      {card.title}
                    </span>
                  </div>
                  {isFocused && (
                    <kbd className="text-[9px] font-mono text-violet-400/60 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                      Enter
                    </kbd>
                  )}
                </div>

                {/* Card content */}
                <div className="px-4 pb-4">
                  {renderCardPreview(card.id)}
                </div>

                {/* Focused left border */}
                {isFocused && (
                  <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-violet-400/60" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/*  BOTTOM HINTS BAR                                            */}
      {/* ============================================================ */}
      <div className="relative z-10 border-t border-white/[0.04] px-4 py-1.5 flex items-center justify-center gap-4 text-[10px] text-zinc-600 select-none">
        <span><kbd className="font-mono text-zinc-500">j</kbd>/<kbd className="font-mono text-zinc-500">k</kbd> navigate</span>
        <span><kbd className="font-mono text-zinc-500">h</kbd>/<kbd className="font-mono text-zinc-500">l</kbd> columns</span>
        <span><kbd className="font-mono text-zinc-500">Enter</kbd> open</span>
        <span><kbd className="font-mono text-zinc-500">/</kbd> search</span>
        <span><kbd className="font-mono text-zinc-500">Esc</kbd> back</span>
      </div>

      {/* ============================================================ */}
      {/*  SEARCH OVERLAY                                              */}
      {/* ============================================================ */}
      {searchOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
          />
          <div
            className="fixed z-50 top-[20%] left-1/2 -translate-x-1/2 w-[400px]"
            style={{ animation: "dashOverlayIn 0.15s ease-out" }}
          >
            <div className="rounded-xl border border-white/[0.1] bg-zinc-900/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search cards..."
                  className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
                />
                <kbd className="text-[10px] font-mono text-zinc-600 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">
                  Esc
                </kbd>
              </div>
              {filteredCards.length > 0 ? (
                <div className="py-1">
                  {filteredCards.map((card, i) => (
                    <button
                      key={card.id}
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        const idx = NAV_ORDER.indexOf(card.id);
                        if (idx >= 0) setFocusedIndex(idx);
                        setActiveCard(card.id);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === 0 ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="text-zinc-500">{card.icon}</span>
                      <span className="text-sm text-zinc-300">{card.title}</span>
                      {i === 0 && (
                        <kbd className="ml-auto text-[9px] font-mono text-zinc-600 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">
                          Enter
                        </kbd>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-zinc-600">
                  No matching cards
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/*  CARD OVERLAY — full screen for card content                 */}
      {/* ============================================================ */}
      {activeCard && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveCard(null)}
          />
          <div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ animation: "dashOverlayIn 0.2s ease-out" }}
          >
            {/* Overlay header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <span className="text-violet-400">
                  {CARD_DEFS.find((c) => c.id === activeCard)?.icon}
                </span>
                <span className="text-sm font-semibold text-zinc-200">
                  {CARD_DEFS.find((c) => c.id === activeCard)?.title}
                </span>
              </div>
              <button
                onClick={() => setActiveCard(null)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-all"
              >
                <span className="text-[11px]">Close</span>
                <kbd className="text-[10px] font-mono text-zinc-600 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">
                  Esc
                </kbd>
              </button>
            </div>

            {/* Overlay content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-auto">
              {renderCardOverlay(activeCard)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
