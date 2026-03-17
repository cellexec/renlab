"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAgentStore } from "../hooks/useAgentStore";
import { AGENT_COLORS, type SubAgent } from "../agents";
import type { Model } from "../components/ModelSelect";

// ── Fuzzy search ──────────────────────────────────────────────────────────────

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

const MODELS: { value: Model; label: string }[] = [
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

// ── Edit dialog field definitions ─────────────────────────────────────────────

type FieldDef = { key: string; label: string; type: "text" | "textarea" | "select" | "color" };

const FIELDS: FieldDef[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "description", label: "Description", type: "text" },
  { key: "model", label: "Model", type: "select" },
  { key: "color", label: "Color", type: "color" },
  { key: "systemPrompt", label: "System Prompt", type: "textarea" },
];

// ── Color mapping for dialog border ────────────────────────────────────────────

const COLOR_BORDER: Record<string, string> = {
  "bg-zinc-600": "border-zinc-500/50 shadow-[0_0_30px_-8px_rgba(113,113,122,0.3)]",
  "bg-blue-600": "border-blue-500/50 shadow-[0_0_30px_-8px_rgba(59,130,246,0.3)]",
  "bg-purple-600": "border-purple-500/50 shadow-[0_0_30px_-8px_rgba(168,85,247,0.3)]",
  "bg-amber-600": "border-amber-500/50 shadow-[0_0_30px_-8px_rgba(245,158,11,0.3)]",
  "bg-red-600": "border-red-500/50 shadow-[0_0_30px_-8px_rgba(239,68,68,0.3)]",
  "bg-emerald-600": "border-emerald-500/50 shadow-[0_0_30px_-8px_rgba(16,185,129,0.3)]",
  "bg-pink-600": "border-pink-500/50 shadow-[0_0_30px_-8px_rgba(236,72,153,0.3)]",
  "bg-cyan-600": "border-cyan-500/50 shadow-[0_0_30px_-8px_rgba(6,182,212,0.3)]",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const router = useRouter();
  const { agents, loaded, addAgent, updateAgent, deleteAgent } = useAgentStore();

  // --- List state ---
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<SubAgent | null>(null);
  const [mouseActive, setMouseActive] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Edit dialog state ---
  const [dialogAgent, setDialogAgent] = useState<SubAgent | null>(null); // null = closed, agent = editing
  const [isNewAgent, setIsNewAgent] = useState(false);
  const [dialogFieldIndex, setDialogFieldIndex] = useState(0);
  const [dialogEditingField, setDialogEditingField] = useState<string | null>(null); // which field is focused for editing
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const dialogFieldRefs = useRef<Map<string, HTMLElement>>(new Map());

  // --- Computed ---
  const filtered = useMemo(() => {
    if (!query) return agents;
    return agents.filter((a) =>
      fuzzyMatch(a.name, query) || fuzzyMatch(a.description, query) || fuzzyMatch(a.model, query)
    );
  }, [agents, query]);

  const dialogHasChanges = dialogAgent !== null && FIELDS.some((f) => editValues[f.key] !== savedValues[f.key]);

  // --- Reset selection on query change ---
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // --- Scroll list item into view ---
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-item-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedIndex]);

  // --- Mouse guard ---
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

  // --- Open edit dialog ---
  const openDialog = useCallback((agent: SubAgent) => {
    const vals: Record<string, string> = {
      name: agent.name,
      description: agent.description,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      color: agent.color,
    };
    setDialogAgent(agent);
    setEditValues(vals);
    setSavedValues({ ...vals });
    setDialogFieldIndex(0);
    setDialogEditingField(null);
    setIsNewAgent(false);
  }, []);

  // --- Open create dialog ---
  const openCreateDialog = useCallback(() => {
    const defaultColor = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];
    const vals: Record<string, string> = {
      name: "",
      description: "",
      model: "sonnet",
      systemPrompt: "",
      color: defaultColor,
    };
    setDialogAgent({ id: "__new__", name: "", description: "", model: "sonnet", systemPrompt: "", color: defaultColor });
    setEditValues(vals);
    setSavedValues({ ...vals });
    setDialogFieldIndex(0);
    setDialogEditingField("name"); // auto-focus name field for new agents
    setIsNewAgent(true);
    requestAnimationFrame(() => {
      const el = dialogFieldRefs.current.get("name");
      if (el) (el as HTMLInputElement).focus();
    });
  }, []);

  // --- Save dialog ---
  const saveDialog = useCallback(() => {
    if (!dialogAgent) return;
    const data = {
      name: (editValues.name || "").trim() || "Untitled Agent",
      description: (editValues.description || "").trim(),
      model: (editValues.model || "sonnet") as Model,
      systemPrompt: editValues.systemPrompt || "",
      color: editValues.color || AGENT_COLORS[0],
    };
    if (isNewAgent) {
      addAgent(data);
    } else {
      updateAgent(dialogAgent.id, data);
    }
    setDialogAgent(null);
    setDialogEditingField(null);
  }, [dialogAgent, editValues, isNewAgent, addAgent, updateAgent]);

  // --- Close dialog (discard) ---
  const closeDialog = useCallback(() => {
    setDialogAgent(null);
    setDialogEditingField(null);
  }, []);

  // --- Focus a field for editing ---
  const focusField = useCallback((fieldKey: string) => {
    setDialogEditingField(fieldKey);
    requestAnimationFrame(() => {
      const el = dialogFieldRefs.current.get(fieldKey);
      if (el) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          const input = el as HTMLInputElement | HTMLTextAreaElement;
          input.focus();
          // Move cursor to end
          const len = input.value.length;
          input.setSelectionRange(len, len);
        } else if (el.tagName === "SELECT") {
          (el as HTMLSelectElement).focus();
        }
      }
    });
  }, []);

  // --- Exit field editing ---
  const exitFieldEdit = useCallback(() => {
    setDialogEditingField(null);
    (document.activeElement as HTMLElement)?.blur();
  }, []);

  // --- Keyboard handler ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Layer 1: Delete confirm dialog
      if (confirmDelete) {
        if (e.key === "Enter") { e.preventDefault(); deleteAgent(confirmDelete.id); setConfirmDelete(null); return; }
        if (e.key === "Escape") { e.preventDefault(); setConfirmDelete(null); return; }
        return;
      }

      // Layer 2: Edit dialog open
      if (dialogAgent) {
        // Layer 2a: Editing a specific field
        if (dialogEditingField) {
          const field = FIELDS.find((f) => f.key === dialogEditingField);
          if (e.key === "Escape") {
            e.preventDefault();
            setEditValues((prev) => ({ ...prev, [dialogEditingField]: savedValues[dialogEditingField] }));
            exitFieldEdit();
            return;
          }
          // Color field: arrow left/right to cycle, Enter to confirm
          if (field?.type === "color") {
            if (e.key === "ArrowLeft" || e.key === "h") {
              e.preventDefault();
              const curIdx = AGENT_COLORS.indexOf(editValues.color as typeof AGENT_COLORS[number]);
              const nextIdx = curIdx > 0 ? curIdx - 1 : AGENT_COLORS.length - 1;
              setEditValues((prev) => ({ ...prev, color: AGENT_COLORS[nextIdx] }));
              return;
            }
            if (e.key === "ArrowRight" || e.key === "l") {
              e.preventDefault();
              const curIdx = AGENT_COLORS.indexOf(editValues.color as typeof AGENT_COLORS[number]);
              const nextIdx = curIdx < AGENT_COLORS.length - 1 ? curIdx + 1 : 0;
              setEditValues((prev) => ({ ...prev, color: AGENT_COLORS[nextIdx] }));
              return;
            }
            if (e.key === "Enter") { e.preventDefault(); exitFieldEdit(); return; }
            return;
          }
          // Enter saves field (except in textarea where Enter adds newline)
          if (e.key === "Enter" && field?.type !== "textarea") {
            e.preventDefault();
            exitFieldEdit();
            return;
          }
          // Tab moves to next field
          if (e.key === "Tab") {
            e.preventDefault();
            exitFieldEdit();
            const idx = FIELDS.findIndex((f) => f.key === dialogEditingField);
            const nextIdx = e.shiftKey ? Math.max(0, idx - 1) : Math.min(FIELDS.length - 1, idx + 1);
            setDialogFieldIndex(nextIdx);
            focusField(FIELDS[nextIdx].key);
            return;
          }
          return; // Let input handle other keys
        }

        // Layer 2b: Navigating fields (not editing)
        if (e.key === "Escape") {
          e.preventDefault();
          if (dialogHasChanges) {
            saveDialog();
          } else {
            closeDialog();
          }
          return;
        }
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setDialogFieldIndex((i) => Math.min(i + 1, FIELDS.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setDialogFieldIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          focusField(FIELDS[dialogFieldIndex].key);
          return;
        }
        return;
      }

      // Layer 3: Search focused
      if (searchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (query) { setQuery(""); } else { searchRef.current?.blur(); setSearchFocused(false); }
          return;
        }
        if (e.key === "Enter") { e.preventDefault(); searchRef.current?.blur(); setSearchFocused(false); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return; }
        return;
      }

      // Layer 4: List navigation
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "/") { e.preventDefault(); setSearchFocused(true); requestAnimationFrame(() => searchRef.current?.focus()); }
      else if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); const agent = filtered[selectedIndex]; if (agent) openDialog(agent); }
      else if (e.key === "n") { e.preventDefault(); openCreateDialog(); }
      else if (e.key === "d") { e.preventDefault(); const agent = filtered[selectedIndex]; if (agent) setConfirmDelete(agent); }
      else if (e.key === "Escape") { e.preventDefault(); router.push("/"); }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [searchFocused, query, filtered, selectedIndex, dialogAgent, dialogEditingField, dialogFieldIndex, dialogHasChanges, confirmDelete,
      deleteAgent, router, openDialog, openCreateDialog, saveDialog, closeDialog, focusField, exitFieldEdit, savedValues]);

  if (!loaded) return null;

  const selectedId = filtered[selectedIndex]?.id;

  return (
    <div className="flex h-full flex-col text-zinc-100">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-zinc-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Agents</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} — create and manage agents for chat sessions
            </p>
          </div>
          <button
            tabIndex={-1}
            onClick={openCreateDialog}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
            <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">n</kbd>
          </button>
        </div>
      </div>

      {/* Content area with boxed panel */}
      <div className="flex-1 min-h-0 overflow-hidden p-5">
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
                placeholder="Filter agents…"
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
              />
            </div>
          </div>

          {/* Agent list */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                {agents.length === 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <svg className="h-10 w-10 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
                    </svg>
                    <p className="text-sm text-zinc-600">No agents yet</p>
                    <p className="text-[12px] text-zinc-700">Press <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">n</kbd> to create one</p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600">No matching agents</p>
                )}
              </div>
            ) : (
              filtered.map((agent, i) => {
                const isSelected = agent.id === selectedId && !searchFocused;
                return (
                  <div
                    key={agent.id}
                    data-item-index={i}
                    onClick={() => openDialog(agent)}
                    onMouseMove={() => { if (mouseActive && selectedIndex !== i) setSelectedIndex(i); }}
                    className={`border-b border-white/[0.04] px-6 py-4 transition-all duration-100 cursor-pointer border-l-2 ${
                      isSelected
                        ? "bg-violet-500/[0.06] border-l-violet-500/60"
                        : "border-l-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-3 w-3 shrink-0 rounded-full ${agent.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <FuzzyText text={agent.name} query={query} className={`text-sm font-medium ${isSelected ? "text-zinc-100" : "text-zinc-300"}`} />
                          <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500 font-mono">
                            {agent.model}
                          </span>
                          {isSelected && (
                            <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">Enter to edit</kbd>
                          )}
                        </div>
                        {agent.description && (
                          <FuzzyText text={agent.description} query={query} className="text-[12px] text-zinc-500 block mt-1 truncate" highlightClass="text-violet-400 font-medium" />
                        )}
                        {agent.systemPrompt && (
                          <span className="text-[11px] text-zinc-700 block mt-0.5 truncate font-mono">{agent.systemPrompt.slice(0, 80)}{agent.systemPrompt.length > 80 ? "…" : ""}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom hints bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950 px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">j</kbd> <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">k</kbd> navigate</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd> edit</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">/</kbd> search</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">n</kbd> new</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">d</kbd> delete</span>
        <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd> back</span>
      </div>

      {/* ================================================================= */}
      {/*  EDIT / CREATE DIALOG                                             */}
      {/* ================================================================= */}
      {dialogAgent && (
        <>
          <div
            data-overlay-open
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (dialogHasChanges) saveDialog(); else closeDialog(); }}
          />
          <div
            className={`fixed inset-4 md:inset-y-12 md:inset-x-[20%] lg:inset-y-16 lg:inset-x-[25%] z-50 flex flex-col rounded-2xl border-2 bg-zinc-950/95 backdrop-blur-2xl overflow-hidden transition-colors duration-200 ${COLOR_BORDER[editValues.color] ?? "border-white/[0.08] shadow-2xl"}`}
            style={{ animation: "dashOverlayIn 0.2s ease-out" }}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${editValues.color}`} />
                <span className="text-sm font-medium text-zinc-200">{editValues.name || (isNewAgent ? "New Agent" : "Edit Agent")}</span>
                {editValues.model && (
                  <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500 font-mono">{editValues.model}</span>
                )}
              </div>
              <button
                onClick={() => { if (dialogHasChanges) saveDialog(); else closeDialog(); }}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[11px]">{dialogHasChanges ? "Save & Close" : "Close"}</span>
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
              </button>
            </div>

            {/* Field list */}
            <div className="flex-1 overflow-y-auto">
              {FIELDS.map((field, fi) => {
                const isFieldSelected = dialogFieldIndex === fi && !dialogEditingField;
                const isFieldEditing = dialogEditingField === field.key;
                const value = editValues[field.key] ?? "";
                const isDirty = value !== savedValues[field.key];

                return (
                  <div
                    key={field.key}
                    onClick={() => { setDialogFieldIndex(fi); if (!isFieldEditing) focusField(field.key); }}
                    className={`border-b border-white/[0.04] px-6 py-4 transition-all duration-100 cursor-pointer border-l-2 ${
                      isFieldEditing
                        ? "bg-amber-500/[0.06] border-l-amber-500/60"
                        : isFieldSelected
                          ? "bg-violet-500/[0.06] border-l-violet-500/60"
                          : "border-l-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        isFieldEditing ? "bg-amber-400" : isFieldSelected ? "bg-violet-400" : "bg-transparent"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{field.label}</span>
                          {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                          {isFieldEditing && (
                            <span className="flex items-center gap-1.5 ml-auto">
                              {field.type === "color" && (
                                <>
                                  <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">&larr;</kbd>
                                  <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">&rarr;</kbd>
                                </>
                              )}
                              {field.type !== "textarea" && (
                                <kbd className="rounded bg-amber-500/15 border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium text-amber-400">Enter</kbd>
                              )}
                              <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400">Esc</kbd>
                            </span>
                          )}
                          {isFieldSelected && (
                            <kbd className="ml-auto rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400">Enter</kbd>
                          )}
                        </div>

                        {/* Field content */}
                        {field.type === "text" && (
                          isFieldEditing ? (
                            <input
                              ref={(el) => { if (el) dialogFieldRefs.current.set(field.key, el); }}
                              type="text"
                              value={value}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              className="w-full max-w-lg rounded-lg border border-amber-500/20 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/40"
                              placeholder={`Enter ${field.label.toLowerCase()}…`}
                            />
                          ) : (
                            <span className={`text-sm ${value ? "text-zinc-300" : "text-zinc-700"}`}>{value || `No ${field.label.toLowerCase()}`}</span>
                          )
                        )}

                        {field.type === "textarea" && (
                          isFieldEditing ? (
                            <textarea
                              ref={(el) => { if (el) dialogFieldRefs.current.set(field.key, el); }}
                              value={value}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              rows={4}
                              className="w-full max-w-lg rounded-lg border border-amber-500/20 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/40 resize-none font-mono text-[12px]"
                              placeholder="Optional system prompt…"
                            />
                          ) : (
                            <span className={`text-[12px] font-mono block truncate ${value ? "text-zinc-400" : "text-zinc-700"}`}>
                              {value ? (value.slice(0, 120) + (value.length > 120 ? "…" : "")) : "No system prompt"}
                            </span>
                          )
                        )}

                        {field.type === "select" && (
                          isFieldEditing ? (
                            <select
                              ref={(el) => { if (el) dialogFieldRefs.current.set(field.key, el); }}
                              value={value}
                              onChange={(e) => setEditValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              className="rounded-lg border border-amber-500/20 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/40"
                            >
                              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-sm text-zinc-300">{MODELS.find((m) => m.value === value)?.label ?? value}</span>
                          )
                        )}

                        {field.type === "color" && (
                          <div className="flex gap-2 py-0.5">
                            {AGENT_COLORS.map((c) => (
                              <button
                                key={c}
                                ref={(el) => { if (el && c === AGENT_COLORS[0]) dialogFieldRefs.current.set(field.key, el); }}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditValues((prev) => ({ ...prev, color: c })); }}
                                className={`h-6 w-6 rounded-full ${c} transition-all ${
                                  value === c
                                    ? isFieldEditing ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-zinc-900" : "ring-2 ring-white/30 ring-offset-1 ring-offset-zinc-900"
                                    : "opacity-40 hover:opacity-100"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dialog bottom hints */}
            <div className="shrink-0 border-t border-white/[0.06] px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
              <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">j</kbd> <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">k</kbd> navigate</span>
              <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd> edit field</span>
              <span><kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Tab</kbd> next</span>
              <span className="ml-auto">
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
                {dialogHasChanges ? " save & close" : " close"}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <>
          <div data-overlay-open className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px]">
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Delete Agent</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                Delete <span className="text-zinc-300 font-medium">{confirmDelete.name}</span>? This cannot be undone.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { deleteAgent(confirmDelete.id); setConfirmDelete(null); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-400/20 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  <kbd className="rounded bg-red-500/25 px-1.5 py-0.5 text-[9px] font-medium text-red-400">Enter</kbd>
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
