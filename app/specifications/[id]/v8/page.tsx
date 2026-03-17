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
/*  Status pill styles                                                 */
/* ------------------------------------------------------------------ */

const STATUS_BADGE: Record<SpecificationStatus, { label: string; cls: string; dot: string }> = {
  chat:      { label: "Chat",      dot: "bg-cyan-400", cls: "bg-cyan-400/10 text-cyan-300 animate-pulse" },
  draft:     { label: "Draft",     cls: "bg-zinc-400/10 text-zinc-400 border-white/[0.08]",           dot: "bg-zinc-400" },
  pipeline:  { label: "Pipeline",  cls: "bg-blue-400/10 text-blue-300 border-blue-400/20",            dot: "bg-blue-400" },
  failed:    { label: "Failed",    cls: "bg-red-400/10 text-red-300 border-red-400/20",               dot: "bg-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20",      dot: "bg-yellow-400" },
  done:      { label: "Done",      cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",   dot: "bg-emerald-400" },
};

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const keyframes = `
@keyframes slideOverlayIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes versionBannerIn {
  from { transform: translateY(-4px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes sectionExpand {
  from { opacity: 0; max-height: 0; }
  to { opacity: 1; max-height: 2000px; }
}
@keyframes sectionCollapse {
  from { opacity: 1; }
  to { opacity: 0; }
}
`;

/* ------------------------------------------------------------------ */
/*  Section definitions                                                */
/* ------------------------------------------------------------------ */

type SectionId = "header" | "info" | "editor" | "history" | "chat" | "actions";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  collapsible: boolean;
  defaultExpanded: boolean;
}

const SECTION_DEFS: SectionDef[] = [
  {
    id: "header",
    label: "Header",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
    collapsible: false,
    defaultExpanded: true,
  },
  {
    id: "info",
    label: "Info Bar",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    collapsible: false,
    defaultExpanded: true,
  },
  {
    id: "editor",
    label: "Editor",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
    collapsible: true,
    defaultExpanded: true,
  },
  {
    id: "history",
    label: "Version History",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    collapsible: true,
    defaultExpanded: false,
  },
  {
    id: "chat",
    label: "AI Chat",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    collapsible: true,
    defaultExpanded: false,
  },
  {
    id: "actions",
    label: "Actions",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    collapsible: true,
    defaultExpanded: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Kbd hint component                                                 */
/* ------------------------------------------------------------------ */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-mono font-medium text-zinc-400 bg-white/[0.06] border border-white/[0.1] rounded">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SpecV8Page({ params }: { params: Promise<{ id: string }> }) {
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

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  // Section state
  const [selectedSection, setSelectedSection] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(() => {
    const initial = new Set<SectionId>();
    SECTION_DEFS.forEach((s) => { if (s.defaultExpanded) initial.add(s.id); });
    return initial;
  });
  const [focusedSection, setFocusedSection] = useState<SectionId | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const initialContentRef = useRef("");
  const initializedRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mouseMovedRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const { hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);

  // Filter sections by search
  const visibleSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTION_DEFS;
    const q = searchQuery.toLowerCase();
    return SECTION_DEFS.filter((s) => s.label.toLowerCase().includes(q));
  }, [searchQuery]);

  // Load initial content once
  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  // Track dirty state
  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  // Clamp selected section
  useEffect(() => {
    if (selectedSection >= visibleSections.length) {
      setSelectedSection(Math.max(0, visibleSections.length - 1));
    }
  }, [visibleSections.length, selectedSection]);

  // Scroll selected section into view
  useEffect(() => {
    const sectionDef = visibleSections[selectedSection];
    if (!sectionDef) return;
    const el = sectionRefs.current[sectionDef.id];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedSection, visibleSections]);

  const handleSave = async () => {
    if (!spec || !editable) return;
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

  const toggleSection = (sectionId: SectionId) => {
    const def = SECTION_DEFS.find((s) => s.id === sectionId);
    if (!def?.collapsible) return;
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const zenMode = () => {
    const next = new Set<SectionId>();
    next.add("header");
    next.add("info");
    next.add("editor");
    setExpandedSections(next);
    setFocusedSection(null);
    // Find editor section index and select it
    const editorIdx = visibleSections.findIndex((s) => s.id === "editor");
    if (editorIdx >= 0) setSelectedSection(editorIdx);
  };

  // Mouse "wait for actual movement" pattern
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
      const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
      if (dx > 3 || dy > 3) {
        mouseMovedRef.current = true;
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Keyboard handler
  useEffect(() => {
    if (!spec) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === "input" || tagName === "textarea" || target.isContentEditable;

      // Layer 1: Search mode
      if (searchOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSearchOpen(false);
          setSearchQuery("");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSearchOpen(false);
          setSearchQuery("");
          return;
        }
        // Let the search input handle other keys
        return;
      }

      // Layer 2: Title editing
      if (editingTitle) {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEditingTitle(false);
          titleInputRef.current?.blur();
        }
        return;
      }

      // Layer 3: Focused section (editing mode)
      if (focusedSection) {
        if (e.key === "Escape") {
          e.preventDefault();
          setFocusedSection(null);
          return;
        }
        // Ctrl+S while in a section
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          handleSave();
          return;
        }
        // Let the focused section's inputs handle other keys
        return;
      }

      // Layer 4: Section navigation
      if (!isInput) {
        if (e.key === "Escape") {
          e.preventDefault();
          router.push("/specifications");
          return;
        }

        if (e.key === "/") {
          e.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 0);
          return;
        }

        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedSection((i) => Math.min(i + 1, visibleSections.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedSection((i) => Math.max(i - 1, 0));
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          const section = visibleSections[selectedSection];
          if (section?.collapsible) {
            toggleSection(section.id);
          }
          return;
        }

        if (e.key === "i") {
          e.preventDefault();
          const section = visibleSections[selectedSection];
          if (section && expandedSections.has(section.id)) {
            setFocusedSection(section.id);
            // If it's the header, focus the title input
            if (section.id === "header" && editable) {
              setEditingTitle(true);
              setTimeout(() => titleInputRef.current?.focus(), 0);
            }
          }
          return;
        }

        if (e.key === "z" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          zenMode();
          return;
        }

        // Ctrl+S from section nav
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          handleSave();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [spec, searchOpen, editingTitle, focusedSection, selectedSection, visibleSections, expandedSections, editable, router]);

  /* ---------- Loading state ---------- */
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <style>{keyframes}</style>
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  /* ---------- Not found state ---------- */
  if (!spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-500">
        <style>{keyframes}</style>
        <div className="text-center">
          <p className="text-lg font-light tracking-wide text-zinc-400">Specification not found</p>
          <p className="mt-1 text-sm text-zinc-600">It may have been deleted or moved.</p>
        </div>
        <button
          onClick={() => router.push("/specifications")}
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-6 py-2.5 text-sm text-zinc-300 transition-all hover:bg-white/[0.08] hover:border-white/[0.15]"
        >
          Back to Specifications
        </button>
      </div>
    );
  }

  // Build hints based on current state
  const hints: { key: string; label: string }[] = [];
  if (searchOpen) {
    hints.push({ key: "Esc", label: "Close search" }, { key: "Enter", label: "Confirm" });
  } else if (editingTitle) {
    hints.push({ key: "Esc", label: "Stop editing" }, { key: "Enter", label: "Confirm" });
  } else if (focusedSection) {
    hints.push({ key: "Esc", label: "Back to nav" }, { key: "Ctrl+S", label: "Save" });
  } else {
    hints.push(
      { key: "j/k", label: "Navigate" },
      { key: "Enter", label: "Toggle" },
      { key: "i", label: "Focus in" },
      { key: "/", label: "Search" },
      { key: "z", label: "Zen mode" },
      { key: "Esc", label: "Back" },
    );
  }

  /* ---------- Render helper: section card wrapper ---------- */
  function SectionCard({
    def,
    index,
    children,
  }: {
    def: SectionDef;
    index: number;
    children: React.ReactNode;
  }) {
    const isSelected = index === selectedSection && !focusedSection && !searchOpen;
    const isFocused = focusedSection === def.id;
    const isExpanded = expandedSections.has(def.id);

    return (
      <div
        ref={(el) => { sectionRefs.current[def.id] = el; }}
        className={`
          rounded-xl border transition-all duration-200
          ${isFocused
            ? "border-l-2 border-l-amber-500 border-amber-500/20 bg-amber-500/[0.03]"
            : isSelected
              ? "border-l-2 border-l-violet-500 border-violet-500/15 bg-violet-500/[0.03]"
              : "border-white/[0.06] bg-white/[0.02]"
          }
        `}
        onMouseEnter={() => {
          if (mouseMovedRef.current && !focusedSection && !searchOpen) {
            const idx = visibleSections.findIndex((s) => s.id === def.id);
            if (idx >= 0) setSelectedSection(idx);
          }
        }}
      >
        {/* Section header */}
        {def.collapsible ? (
          <button
            type="button"
            onClick={() => toggleSection(def.id)}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left group"
          >
            <span className={`transition-colors duration-200 ${isFocused ? "text-amber-400" : isSelected ? "text-violet-400" : "text-zinc-500"}`}>
              {def.icon}
            </span>
            <span className={`text-[13px] font-medium ${isFocused ? "text-amber-200" : isSelected ? "text-zinc-100" : "text-zinc-400"} transition-colors`}>
              {def.label}
            </span>

            {/* Chevron */}
            <svg
              className={`w-3.5 h-3.5 ml-1 text-zinc-600 transition-transform duration-300 ${isExpanded ? "rotate-90" : "rotate-0"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>

            {/* Inline hint */}
            {isSelected && !isFocused && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
                {isExpanded ? (
                  <>
                    <Kbd>i</Kbd><span>focus</span>
                    <Kbd>Enter</Kbd><span>collapse</span>
                  </>
                ) : (
                  <>
                    <Kbd>Enter</Kbd><span>expand</span>
                  </>
                )}
              </span>
            )}
            {isFocused && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-amber-600">
                <Kbd>Esc</Kbd><span>back</span>
              </span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span className={`transition-colors duration-200 ${isFocused ? "text-amber-400" : isSelected ? "text-violet-400" : "text-zinc-500"}`}>
              {def.icon}
            </span>
            <span className={`text-[13px] font-medium ${isFocused ? "text-amber-200" : isSelected ? "text-zinc-100" : "text-zinc-400"} transition-colors`}>
              {def.label}
            </span>
            {isSelected && !isFocused && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
                <Kbd>i</Kbd><span>focus</span>
              </span>
            )}
          </div>
        )}

        {/* Section content */}
        {(isExpanded || !def.collapsible) && (
          <div className={`${def.collapsible ? "border-t border-white/[0.04]" : ""}`}>
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <style>{keyframes}</style>

      {/* ============================================================= */}
      {/*  SEARCH OVERLAY                                                */}
      {/* ============================================================= */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm"
          style={{ animation: "fadeIn 0.15s ease-out" }}
          onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
        >
          <div
            className="w-[420px] rounded-xl border border-white/[0.1] bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
              <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none"
                autoFocus
              />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[280px] overflow-y-auto py-1">
              {visibleSections.map((section, idx) => (
                <button
                  key={section.id}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${idx === 0 ? "bg-white/[0.04]" : "hover:bg-white/[0.04]"}`}
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                    const realIdx = SECTION_DEFS.findIndex((s) => s.id === section.id);
                    setSelectedSection(realIdx >= 0 ? realIdx : 0);
                    if (section.collapsible && !expandedSections.has(section.id)) {
                      toggleSection(section.id);
                    }
                  }}
                >
                  <span className="text-zinc-500">{section.icon}</span>
                  <span className="text-[13px] text-zinc-300">{section.label}</span>
                  {expandedSections.has(section.id) && (
                    <span className="text-[10px] text-zinc-600 ml-auto">expanded</span>
                  )}
                </button>
              ))}
              {visibleSections.length === 0 && (
                <div className="px-4 py-6 text-center text-[12px] text-zinc-600">No matching sections</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/*  SCROLLABLE SECTIONS                                           */}
      {/* ============================================================= */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

        {/* ----- SECTION: Header ----- */}
        <SectionCard def={SECTION_DEFS[0]} index={visibleSections.indexOf(SECTION_DEFS[0])}>
          <div className="px-4 pb-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 mb-3">
              <button
                onClick={() => router.push("/specifications")}
                className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Specifications
              </button>
              <span className="text-[10px] text-zinc-700">/</span>
              <span className="text-[11px] text-zinc-400 truncate max-w-[240px]">{spec.title}</span>
            </div>

            {/* Editable title */}
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={!editable}
              onFocus={() => { setEditingTitle(true); setFocusedSection("header"); }}
              onBlur={() => setEditingTitle(false)}
              className={`
                w-full bg-transparent text-2xl font-semibold tracking-tight text-zinc-100
                outline-none placeholder:text-zinc-700 caret-violet-400
                ${editingTitle ? "border-b border-amber-500/40 pb-1" : "border-b border-transparent pb-1"}
                ${!editable ? "cursor-default" : ""}
                transition-all duration-200
              `}
              placeholder="Untitled Specification"
            />
          </div>
        </SectionCard>

        {/* ----- SECTION: Info Bar ----- */}
        <SectionCard def={SECTION_DEFS[1]} index={visibleSections.indexOf(SECTION_DEFS[1])}>
          <div className="px-4 pb-3 flex items-center gap-2.5 flex-wrap">
            {/* Status */}
            <span className={`inline-flex items-center gap-1.5 rounded-md border backdrop-blur-md px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[spec.status].cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[spec.status].dot}`} />
              {STATUS_BADGE[spec.status].label}
            </span>

            {/* Type */}
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${spec.type === "ui-refactor" ? "text-purple-400/80 bg-purple-500/10 border-purple-500/15" : "text-blue-400/80 bg-blue-500/10 border-blue-500/15"}`}>
              {spec.type}
            </span>

            {/* Version */}
            {latestVersion && (
              <span className="text-[11px] text-zinc-500 font-mono bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-0.5">
                v{latestVersion.versionNumber}
              </span>
            )}

            {/* Last saved */}
            <span className="text-[11px] text-zinc-600">
              {new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>

            {/* Unsaved */}
            {hasChanges && editable && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/80">
                <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                Unsaved
              </span>
            )}

            {/* Pipeline links */}
            {activeRunId && (
              <Link
                href={`/pipelines/${activeRunId}`}
                className="inline-flex items-center gap-1 rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-300 transition-all hover:bg-blue-400/20"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                Pipeline
              </Link>
            )}
            {activeDesignRunId && (
              <Link
                href={`/design-pipelines/${activeDesignRunId}`}
                className="inline-flex items-center gap-1 rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 text-[11px] font-medium text-purple-300 transition-all hover:bg-purple-400/20"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                Design Pipeline
              </Link>
            )}
          </div>
        </SectionCard>

        {/* ----- SECTION: Editor ----- */}
        <SectionCard def={SECTION_DEFS[2]} index={visibleSections.indexOf(SECTION_DEFS[2])}>
          <div className={`transition-shadow duration-300 ${focusedSection === "editor" ? "ring-1 ring-inset ring-amber-500/20 rounded-b-xl" : ""}`}>
            {/* Version preview banner */}
            {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
              <div
                className="flex items-center gap-3 border-b border-blue-400/20 px-4 py-2 bg-blue-400/10"
                style={{ animation: "versionBannerIn 0.25s ease-out" }}
              >
                <svg className="h-3.5 w-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[11px] text-blue-300 font-medium">Viewing v{viewingVersion.versionNumber}</span>
                <button
                  onClick={() => setViewingVersion(null)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-[11px] text-blue-300 transition-all hover:bg-blue-400/20"
                >
                  Back to current
                </button>
              </div>
            )}

            {/* Read-only banner */}
            {!editable && !viewingVersion && (
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 bg-white/[0.02]">
                <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-[11px] text-zinc-500">
                  Read-only — <span className="text-zinc-400 font-medium">{spec.status}</span>
                </span>
              </div>
            )}

            {/* The editor itself */}
            <div className="min-h-[400px]">
              <MarkdownEditor
                value={viewingVersion ? viewingVersion.content : content}
                onChange={editable && !viewingVersion ? setContent : () => {}}
                placeholder="Begin writing your specification..."
                viewOnly={!editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ----- SECTION: Version History ----- */}
        <SectionCard def={SECTION_DEFS[3]} index={visibleSections.indexOf(SECTION_DEFS[3])}>
          <div className={`${focusedSection === "history" ? "ring-1 ring-inset ring-amber-500/20 rounded-b-xl" : ""}`}>
            <VersionHistory
              versions={versions}
              onRestore={(restoredContent) => {
                handleRestore(restoredContent);
                setViewingVersion(null);
              }}
              onView={(versionContent, versionNumber) => {
                setViewingVersion({ content: versionContent, versionNumber });
                // Auto-expand editor if collapsed
                if (!expandedSections.has("editor")) {
                  setExpandedSections((prev) => new Set([...prev, "editor"]));
                }
              }}
              canRestore={editable}
              viewingVersionNumber={viewingVersion?.versionNumber ?? null}
              className=""
            />
          </div>
        </SectionCard>

        {/* ----- SECTION: AI Chat ----- */}
        <SectionCard def={SECTION_DEFS[4]} index={visibleSections.indexOf(SECTION_DEFS[4])}>
          <div className={`min-h-[350px] ${focusedSection === "chat" ? "ring-1 ring-inset ring-amber-500/20 rounded-b-xl" : ""}`}>
            <AgentChat
              agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
              context={content}
              onApplySpec={(specContent) => {
                handleApplySpec(specContent);
              }}
              className=""
            />
          </div>
        </SectionCard>

        {/* ----- SECTION: Actions ----- */}
        <SectionCard def={SECTION_DEFS[5]} index={visibleSections.indexOf(SECTION_DEFS[5])}>
          <div className={`px-4 pb-4 flex flex-wrap items-center gap-2 ${focusedSection === "actions" ? "ring-1 ring-inset ring-amber-500/20 rounded-b-xl p-4" : ""}`}>
            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges || !editable}
              className={`
                inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-200
                ${hasChanges && editable
                  ? "bg-violet-500/15 text-violet-300 border border-violet-400/20 hover:bg-violet-500/25"
                  : "text-zinc-500 border border-white/[0.06] hover:bg-white/[0.04] hover:text-zinc-300"
                }
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
              {saving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
            </button>

            {/* Pipeline triggers */}
            {activeProject && editable && spec.type === "feature" && (
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
            {activeProject && editable && spec.type === "ui-refactor" && (
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

            {/* Change status / reset to draft */}
            {(spec.status === "failed" || spec.status === "cancelled") && (
              <button
                type="button"
                onClick={() => updateStatus(id, "draft")}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[13px] text-zinc-400 transition-all hover:bg-white/[0.08] hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Reset to Draft
              </button>
            )}
          </div>
        </SectionCard>

        {/* Bottom spacer for scroll breathing room */}
        <div className="h-4" />
      </div>

      {/* ============================================================= */}
      {/*  BOTTOM HINTS BAR                                              */}
      {/* ============================================================= */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-1.5 border-t border-white/[0.04] bg-zinc-950">
        {hints.map((h, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Kbd>{h.key}</Kbd>
            <span>{h.label}</span>
          </span>
        ))}
        <span className="ml-auto text-[10px] text-zinc-700">v8 - Stacked Sections</span>
      </div>
    </div>
  );
}
