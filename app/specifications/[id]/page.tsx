"use client";

import { useState, useEffect, useRef, use, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { AgentChat } from "../../components/AgentChat";
import { PipelineTriggerButton } from "../../components/PipelineTriggerButton";
import { DesignPipelineTriggerButton } from "../../components/DesignPipelineTriggerButton";
import { useSpecificationStore } from "../../hooks/useSpecificationStore";
import { usePipelineStore } from "../../hooks/usePipelineStore";
import { useDesignPipelineStore } from "../../hooks/useDesignPipelineStore";
import { useProjectContext } from "../../components/ProjectContext";
import type { SpecificationStatus } from "../../specifications";

/* ------------------------------------------------------------------ */
/*  Keyframe animations                                                */
/* ------------------------------------------------------------------ */

const keyframes = `
@keyframes dashOverlayIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes modalIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes hintBarIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes toastIn {
  0% { opacity: 0; transform: translateY(8px) scale(0.96); }
  15% { opacity: 1; transform: translateY(0) scale(1); }
  85% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-4px) scale(0.98); }
}
`;

/* ------------------------------------------------------------------ */
/*  Status badge config                                                */
/* ------------------------------------------------------------------ */

const STATUS_BADGE: Record<SpecificationStatus, { label: string; cls: string; dot: string }> = {
  draft:     { label: "Draft",     cls: "bg-zinc-400/10 text-zinc-400 border-white/[0.08]", dot: "bg-zinc-400" },
  pipeline:  { label: "Pipeline",  cls: "bg-blue-400/10 text-blue-300 border-blue-400/20 animate-pulse", dot: "bg-blue-400" },
  failed:    { label: "Failed",    cls: "bg-red-400/10 text-red-300 border-red-400/20", dot: "bg-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-yellow-400/10 text-yellow-300 border-yellow-400/20", dot: "bg-yellow-400" },
  done:      { label: "Done",      cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20", dot: "bg-emerald-400" },
};

/* ------------------------------------------------------------------ */
/*  Heading extraction from markdown                                   */
/* ------------------------------------------------------------------ */

interface HeadingEntry {
  level: number;
  text: string;
  line: number;
  id: string;
}

function extractHeadings(markdown: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const slugCounts = new Map<string, number>();
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const text = match[2].replace(/[*_`~\[\]]/g, "");
      let slug = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      headings.push({ level: match[1].length, text, line: i, id: slug });
    }
  }
  return headings;
}

/* ------------------------------------------------------------------ */
/*  Outline item type                                                  */
/* ------------------------------------------------------------------ */

interface OutlineItem {
  type: "heading";
  label: string;
  value: string;
  headingId?: string;
  headingLevel?: number;
  headingLine?: number;
}

/* ------------------------------------------------------------------ */
/*  Inline diff computation + viewer                                   */
/* ------------------------------------------------------------------ */

type DiffLine = { type: "unchanged" | "added" | "removed"; text: string };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length, n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) { result.push({ type: "unchanged", text: oldLines[i - 1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { result.push({ type: "added", text: newLines[j - 1] }); j--; }
    else { result.push({ type: "removed", text: oldLines[i - 1] }); i--; }
  }
  result.reverse();
  return result;
}

/** Word-level diff between two strings. Returns spans with highlight flags. */
type WordSpan = { text: string; highlight: boolean };

function computeWordDiff(oldStr: string, newStr: string): { oldSpans: WordSpan[]; newSpans: WordSpan[] } {
  // Tokenize into words and whitespace
  const tokenize = (s: string) => s.match(/\S+|\s+/g) || [];
  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);

  // LCS on tokens
  const m = oldTokens.length, n = newTokens.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldTokens[i - 1] === newTokens[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack to find matching tokens
  const oldMatch = new Set<number>();
  const newMatch = new Set<number>();
  let oi = m, ni = n;
  while (oi > 0 && ni > 0) {
    if (oldTokens[oi - 1] === newTokens[ni - 1]) { oldMatch.add(oi - 1); newMatch.add(ni - 1); oi--; ni--; }
    else if (dp[oi][ni - 1] >= dp[oi - 1][ni]) { ni--; }
    else { oi--; }
  }

  // Build spans, merging consecutive same-highlight tokens
  const buildSpans = (tokens: string[], matched: Set<number>): WordSpan[] => {
    const spans: WordSpan[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const hl = !matched.has(i);
      if (spans.length > 0 && spans[spans.length - 1].highlight === hl) {
        spans[spans.length - 1].text += tokens[i];
      } else {
        spans.push({ text: tokens[i], highlight: hl });
      }
    }
    return spans;
  };

  return { oldSpans: buildSpans(oldTokens, oldMatch), newSpans: buildSpans(newTokens, newMatch) };
}

/** Number of context lines to show around each hunk */
const CONTEXT_LINES = 3;

/** Group diff lines into display sections: hunks with context, collapsed gaps */
type DiffSection =
  | { type: "hunk"; startIndex: number; lines: { line: DiffLine; index: number }[] }
  | { type: "collapsed"; count: number; startIndex: number };

function buildSections(lines: DiffLine[]): DiffSection[] {
  // Find ranges of changed lines (expanded by context)
  const changed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "unchanged") {
      for (let c = Math.max(0, i - CONTEXT_LINES); c <= Math.min(lines.length - 1, i + CONTEXT_LINES); c++) {
        changed.add(c);
      }
    }
  }

  const sections: DiffSection[] = [];
  let i = 0;
  while (i < lines.length) {
    if (changed.has(i)) {
      const hunkLines: { line: DiffLine; index: number }[] = [];
      while (i < lines.length && changed.has(i)) {
        hunkLines.push({ line: lines[i], index: i });
        i++;
      }
      sections.push({ type: "hunk", startIndex: hunkLines[0].index, lines: hunkLines });
    } else {
      const start = i;
      while (i < lines.length && !changed.has(i)) i++;
      sections.push({ type: "collapsed", count: i - start, startIndex: start });
    }
  }
  return sections;
}

/** Pair up adjacent removed+added lines for word-level diff */
function pairChangedLines(lines: DiffLine[], startIdx: number, endIdx: number): Map<number, WordSpan[]> {
  const wordSpans = new Map<number, WordSpan[]>();
  let i = startIdx;
  while (i <= endIdx) {
    if (lines[i].type === "removed") {
      // Collect consecutive removed, then consecutive added
      const removedStart = i;
      while (i <= endIdx && lines[i].type === "removed") i++;
      const addedStart = i;
      while (i <= endIdx && lines[i].type === "added") i++;
      const removedCount = addedStart - removedStart;
      const addedCount = i - addedStart;
      const pairs = Math.min(removedCount, addedCount);
      for (let p = 0; p < pairs; p++) {
        const { oldSpans, newSpans } = computeWordDiff(lines[removedStart + p].text, lines[addedStart + p].text);
        wordSpans.set(removedStart + p, oldSpans);
        wordSpans.set(addedStart + p, newSpans);
      }
    } else {
      i++;
    }
  }
  return wordSpans;
}

function DiffView({ oldVersion, newVersion }: { oldVersion: { content: string; versionNumber: number }; newVersion: { content: string; versionNumber: number } }) {
  const lines = useMemo(() => computeDiff(oldVersion.content, newVersion.content), [oldVersion.content, newVersion.content]);
  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const l of lines) { if (l.type === "added") added++; else if (l.type === "removed") removed++; }
    return { added, removed };
  }, [lines]);

  const sections = useMemo(() => buildSections(lines), [lines]);

  // Word-level diffs for each hunk section
  const wordDiffs = useMemo(() => {
    const map = new Map<number, WordSpan[]>();
    for (const sec of sections) {
      if (sec.type !== "hunk") continue;
      const first = sec.lines[0].index;
      const last = sec.lines[sec.lines.length - 1].index;
      const pairs = pairChangedLines(lines, first, last);
      for (const [k, v] of pairs) map.set(k, v);
    }
    return map;
  }, [lines, sections]);

  // Compute change hunk start indices (first line of each contiguous changed block)
  const hunkStarts = useMemo(() => {
    const starts: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].type !== "unchanged") {
        if (i === 0 || lines[i - 1].type === "unchanged") starts.push(i);
      }
    }
    return starts;
  }, [lines]);

  const [activeHunk, setActiveHunk] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to active hunk
  useEffect(() => {
    if (hunkStarts.length === 0 || !scrollRef.current) return;
    const lineIndex = hunkStarts[activeHunk];
    const el = scrollRef.current.querySelector(`[data-diff-line="${lineIndex}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeHunk, hunkStarts]);

  // j/k to jump between hunks
  useEffect(() => {
    if (hunkStarts.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveHunk((i) => Math.min(i + 1, hunkStarts.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveHunk((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [hunkStarts]);

  // Determine which lines belong to the active hunk
  const activeHunkLines = useMemo(() => {
    if (hunkStarts.length === 0) return new Set<number>();
    const start = hunkStarts[activeHunk];
    const set = new Set<number>();
    for (let i = start; i < lines.length && lines[i].type !== "unchanged"; i++) set.add(i);
    return set;
  }, [activeHunk, hunkStarts, lines]);

  const renderLine = (line: DiffLine, i: number) => {
    const isInActiveHunk = activeHunkLines.has(i);
    const spans = wordDiffs.get(i);
    return (
      <div
        key={i}
        data-diff-line={i}
        className={`px-5 py-px transition-colors duration-150 whitespace-pre-wrap break-words ${
          line.type === "added"
            ? isInActiveHunk ? "bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/10" : "bg-emerald-500/10"
            : line.type === "removed"
              ? isInActiveHunk ? "bg-red-500/20 ring-1 ring-inset ring-red-500/10" : "bg-red-500/10"
              : ""
        }`}
      >
        <span className={`select-none mr-2 ${line.type === "added" ? "text-emerald-400" : line.type === "removed" ? "text-red-400" : "text-zinc-700"}`}>
          {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
        </span>
        {spans ? (
          spans.map((span, si) => (
            <span
              key={si}
              className={
                span.highlight
                  ? line.type === "added"
                    ? "text-emerald-200 bg-emerald-400/25 rounded-sm px-px"
                    : "text-red-200 bg-red-400/25 rounded-sm px-px"
                  : line.type === "added" ? "text-emerald-300" : "text-red-300"
              }
            >
              {span.text}
            </span>
          ))
        ) : (
          <span className={line.type === "added" ? "text-emerald-300" : line.type === "removed" ? "text-red-300" : "text-zinc-500"}>
            {line.text || "\u00A0"}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-5 py-2 text-[11px] text-zinc-500 border-b border-white/[0.04]">
        <span className="text-emerald-400">+{stats.added} added</span>
        <span className="text-red-400">-{stats.removed} removed</span>
        {hunkStarts.length > 0 && (
          <span className="ml-auto text-zinc-600">
            change {activeHunk + 1}/{hunkStarts.length}
          </span>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="text-xs font-mono leading-relaxed">
          {sections.map((sec, si) => {
            if (sec.type === "collapsed") {
              return (
                <div key={`c-${si}`} className="flex items-center gap-2 px-5 py-1.5 text-[10px] text-zinc-600 border-y border-white/[0.04] bg-zinc-900/50">
                  <svg className="h-3 w-3 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                  {sec.count} unchanged line{sec.count !== 1 ? "s" : ""}
                </div>
              );
            }
            return sec.lines.map(({ line, index }) => renderLine(line, index));
          })}
        </div>
      </div>
      <div className="shrink-0 border-t border-white/[0.06] px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">j</kbd>
          {" "}
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">k</kbd>
          {" next/prev change"}
        </span>
        <span>
          <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
          {" back"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function EditSpecificationPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { runs: pipelineRuns, hasActiveRun, getActiveRunId, triggerPipeline } = usePipelineStore(activeProject?.id ?? null);
  const { hasActiveRun: hasActiveDesignRun, getActiveRunId: getActiveDesignRunId, triggerDesignPipeline } = useDesignPipelineStore(activeProject?.id ?? null);

  // --- Core state ---
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<{ content: string; versionNumber: number } | null>(null);
  const initialContentRef = useRef("");
  const initializedRef = useRef(false);

  // --- UI state ---
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [outlineIndex, setOutlineIndex] = useState(0);
  const [outlineSearch, setOutlineSearch] = useState("");
  const [outlineSearchFocused, setOutlineSearchFocused] = useState(false);
  const [overlayPanel, setOverlayPanel] = useState<"chat" | "history" | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editorViewOnly, setEditorViewOnly] = useState(true);
  const [pipelineConfirm, setPipelineConfirm] = useState(false);
  const [pipelineDialogIndex, setPipelineDialogIndex] = useState(0);
  const [feedbackDialog, setFeedbackDialog] = useState<{ issues: { text: string; severity: string }[]; summary?: string } | null>(null);
  const [feedbackSelected, setFeedbackSelected] = useState<Set<number>>(new Set());
  const [feedbackIndex, setFeedbackIndex] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- History overlay state ---
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historySelected, setHistorySelected] = useState<Set<string>>(new Set());
  const [historyShowDiff, setHistoryShowDiff] = useState(false);

  // --- Refs ---
  const outlineSearchRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const outlineScrollRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  const spec = specifications.find((s) => s.id === id);
  const versions = getVersions(id);
  const latestVersion = getLatestVersion(id);
  const editable = isEditable(id);
  const activeRunId = getActiveRunId(id);
  const activeDesignRunId = getActiveDesignRunId(id);
  const activeRun = activeRunId ? pipelineRuns.find((r) => r.id === activeRunId) : null;
  // Most recent finished (failed/success/cancelled) run for this spec
  const lastFinishedRun = useMemo(() => {
    return pipelineRuns
      .filter((r) => r.specificationId === id && !["pending", "worktree", "retrieving", "coding", "reviewing", "merging", "updating"].includes(r.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
  }, [pipelineRuns, id]);

  // --- Load initial content once ---
  useEffect(() => {
    if (!loaded || initializedRef.current || !spec) return;
    initializedRef.current = true;
    setTitle(spec.title);
    const initialContent = latestVersion?.content ?? "";
    setContent(initialContent);
    initialContentRef.current = initialContent;
  }, [loaded, spec, latestVersion]);

  // --- Track dirty state ---
  useEffect(() => {
    if (!initializedRef.current) return;
    setHasChanges(content !== initialContentRef.current);
  }, [content]);

  // --- Extract headings from content ---
  const headings = useMemo(() => extractHeadings(viewingVersion ? viewingVersion.content : content), [content, viewingVersion]);

  // --- Build outline items (headings only — metadata is static) ---
  const outlineItems: OutlineItem[] = useMemo(() => {
    return headings.map((h) => ({
      type: "heading" as const,
      label: h.text,
      value: `H${h.level}`,
      headingId: h.id,
      headingLevel: h.level,
      headingLine: h.line,
    }));
  }, [headings]);

  // --- Filtered outline for search ---
  const filteredOutline = useMemo(() => {
    if (!outlineSearch.trim()) return outlineItems;
    const q = outlineSearch.toLowerCase();
    return outlineItems.filter((item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q));
  }, [outlineItems, outlineSearch]);

  // --- Clamp outline index ---
  useEffect(() => {
    if (outlineIndex >= filteredOutline.length) {
      setOutlineIndex(Math.max(0, filteredOutline.length - 1));
    }
  }, [filteredOutline.length, outlineIndex]);

  // --- Save handler ---
  const handleSave = useCallback(async () => {
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
  }, [spec, editable, saving, title, id, content, updateTitle, saveVersion]);

  // --- Show toast ---
  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // --- Apply spec from chat (apply + autosave + toast) ---
  const handleApplySpec = useCallback(async (specContent: string) => {
    if (!editable || !spec || saving) return;
    setContent(specContent);
    initialContentRef.current = specContent;
    setHasChanges(false);
    setSaving(true);
    try {
      await saveVersion(id, specContent, undefined);
      showToast("Applied & saved");
    } finally {
      setSaving(false);
    }
  }, [editable, spec, saving, id, saveVersion, showToast]);

  // --- Fetch review feedback from a pipeline run ---
  const openFeedbackDialog = useCallback(async (runId: string) => {
    setFeedbackLoading(true);
    try {
      const res = await fetch(`/api/pipelines/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      const logs = (data.logs ?? []) as { step: string; stream: string; text: string; iteration?: number }[];
      const maxIter = Math.max(1, ...logs.map((l) => l.iteration ?? 1));
      // Extract review details from last iteration
      const reviewLogs = logs.filter((l) => l.step === "reviewing" && l.stream === "stdout" && (l.iteration ?? 1) === maxIter);
      let summary: string | undefined;
      let issues: string[] = [];
      for (const log of reviewLogs) {
        if (log.text.startsWith("Summary: ")) summary = log.text.replace("Summary: ", "");
        if (log.text.startsWith("Issues:")) {
          issues = log.text.replace("Issues:\n", "").split("\n").map((l) => l.replace(/^\s+-\s*/, "").trim()).filter(Boolean);
        }
      }
      if (issues.length === 0) {
        showToast("No review issues found");
        return;
      }
      const getSeverity = (issue: string) => {
        const lower = issue.toLowerCase();
        if (lower.includes("critical") || lower.includes("security") || lower.includes("crash")) return "critical";
        if (lower.includes("missing") || lower.includes("error") || lower.includes("fail") || lower.includes("wrong")) return "major";
        return "minor";
      };
      setFeedbackDialog({
        issues: issues.map((text) => ({ text, severity: getSeverity(text) })),
        summary,
      });
      setFeedbackSelected(new Set(issues.map((_, i) => i))); // All selected by default
      setFeedbackIndex(0);
      setPipelineConfirm(false);
    } finally {
      setFeedbackLoading(false);
    }
  }, [showToast]);

  // --- Send selected feedback to chat ---
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>(undefined);

  const sendFeedbackToChat = useCallback(() => {
    if (!feedbackDialog) return;
    const selected = feedbackDialog.issues.filter((_, i) => feedbackSelected.has(i));
    if (selected.length === 0) return;
    const message = [
      "The pipeline review rejected the implementation with the following issues. Please refine the specification to address them more clearly so the implementation agent doesn't make these mistakes again:\n",
      ...(feedbackDialog.summary ? [`**Review Summary:** ${feedbackDialog.summary}\n`] : []),
      "**Selected Issues:**",
      ...selected.map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.text}`),
      "\nPlease update the specification to be more explicit about these requirements.",
    ].join("\n");
    setChatInitialMessage(message);
    setFeedbackDialog(null);
    setOverlayPanel("chat");
  }, [feedbackDialog, feedbackSelected]);

  // --- Restore version ---
  const handleRestore = useCallback((restoredContent: string) => {
    if (editable) setContent(restoredContent);
  }, [editable]);

  // --- Save and exit edit mode ---
  const saveAndExitEdit = useCallback(async () => {
    await handleSave();
    setEditorViewOnly(true);
    setDiscardConfirm(false);
    setActivePane("left");
  }, [handleSave]);

  // --- Discard changes and exit edit mode ---
  const discardAndExitEdit = useCallback(() => {
    setContent(initialContentRef.current);
    setHasChanges(false);
    setEditorViewOnly(true);
    setDiscardConfirm(false);
    setActivePane("left");
  }, []);

  // --- Restore version and auto-save ---
  const confirmRestore = useCallback(async () => {
    if (!viewingVersion || !editable || !spec) return;
    setContent(viewingVersion.content);
    initialContentRef.current = viewingVersion.content;
    setHasChanges(false);
    setRestoreConfirm(false);
    setViewingVersion(null);
    // Auto-save as new version
    setSaving(true);
    try {
      await saveVersion(id, viewingVersion.content, `Restored from v${viewingVersion.versionNumber}`);
    } finally {
      setSaving(false);
    }
  }, [viewingVersion, editable, spec, id, saveVersion]);

  // --- Trigger pipeline ---
  const handleTriggerPipeline = useCallback(async () => {
    if (!activeProject || !latestVersion || !editable) return;
    if (spec?.type === "feature") {
      const runId = await triggerPipeline(id, latestVersion.id, content, title, activeProject.pipelineThreshold, activeProject.maxRetries);
      router.push(`/pipelines/${runId}`);
    } else if (spec?.type === "ui-refactor") {
      const runId = await triggerDesignPipeline(id, latestVersion.id, content, title);
      router.push(`/design-pipelines/${runId}`);
    }
    setPipelineConfirm(false);
  }, [activeProject, latestVersion, editable, spec, triggerPipeline, triggerDesignPipeline, id, content, title, router]);

  // --- Scroll outline item into view ---
  const scrollOutlineItemIntoView = useCallback((index: number) => {
    const container = outlineScrollRef.current;
    if (!container) return;
    const items = container.querySelectorAll("[data-outline-item]");
    const el = items[index];
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  // --- Scroll editor to heading by outline index ---
  const scrollEditorToOutlineItem = useCallback((index: number) => {
    const item = filteredOutline[index];
    if (item?.headingId) {
      const el = document.getElementById(item.headingId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [filteredOutline]);

  /* ================================================================== */
  /*  KEYBOARD HANDLER                                                   */
  /* ================================================================== */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInInput = tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;

      // ---- Layer 0: Restore confirm dialog ----
      if (restoreConfirm) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmRestore();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setRestoreConfirm(false);
          return;
        }
        return;
      }

      // ---- Layer 1: Save/Discard dialog ----
      if (discardConfirm) {
        if (e.key === "Enter") {
          e.preventDefault();
          saveAndExitEdit();
          return;
        }
        if (e.key === "q") {
          e.preventDefault();
          discardAndExitEdit();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDiscardConfirm(false);
          return;
        }
        return;
      }

      // ---- Layer 2a: Feedback issue selector ----
      if (feedbackDialog) {
        if (e.key === "Escape") {
          e.preventDefault();
          setFeedbackDialog(null);
          return;
        }
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFeedbackIndex((i) => Math.min(i + 1, feedbackDialog.issues.length - 1));
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setFeedbackIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          e.stopImmediatePropagation();
          setFeedbackSelected((prev) => {
            const next = new Set(prev);
            if (next.has(feedbackIndex)) next.delete(feedbackIndex);
            else next.add(feedbackIndex);
            return next;
          });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          sendFeedbackToChat();
          return;
        }
        return;
      }

      // ---- Layer 2b: Pipeline confirm dialog ----
      if (pipelineConfirm) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPipelineConfirm(false);
          return;
        }
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setPipelineDialogIndex((i) => {
            const count = lastFinishedRun ? 2 : 0; // 0 = new pipeline, 1 = view old (if exists)
            return Math.min(i + 1, count);
          });
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setPipelineDialogIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const el = document.querySelector(`[data-pipeline-option="${pipelineDialogIndex}"]`) as HTMLElement | null;
          if (el) el.click();
          return;
        }
        return;
      }

      // ---- Layer 3: Overlay panel (chat/history) ----
      if (overlayPanel) {
        if (overlayPanel === "history" && versions.length > 0) {
          if (e.key === "Escape") {
            e.preventDefault();
            if (historyShowDiff) {
              setHistoryShowDiff(false);
              setHistorySelected(new Set());
            } else if (historySelected.size > 0) {
              setHistorySelected(new Set());
            } else {
              setOverlayPanel(null);
            }
            return;
          }
          // Skip j/k/Enter/Space if user is typing in an input
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA") {
            if (e.key === "j" || e.key === "ArrowDown") {
              e.preventDefault();
              setHistoryIndex((i) => Math.min(i + 1, versions.length - 1));
              requestAnimationFrame(() => {
                const el = historyScrollRef.current?.querySelector(`[data-history-index="${Math.min(historyIndex + 1, versions.length - 1)}"]`);
                if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" });
              });
              return;
            }
            if (e.key === "k" || e.key === "ArrowUp") {
              e.preventDefault();
              setHistoryIndex((i) => Math.max(i - 1, 0));
              requestAnimationFrame(() => {
                const el = historyScrollRef.current?.querySelector(`[data-history-index="${Math.max(historyIndex - 1, 0)}"]`);
                if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" });
              });
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const v = versions[historyIndex];
              if (v) {
                setViewingVersion({ content: v.content, versionNumber: v.versionNumber });
                setOverlayPanel(null);
              }
              return;
            }
            if (e.key === " ") {
              e.preventDefault();
              e.stopImmediatePropagation();
              const v = versions[historyIndex];
              if (v) {
                setHistorySelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(v.id)) {
                    next.delete(v.id);
                  } else {
                    if (next.size >= 2) {
                      const first = next.values().next().value;
                      if (first !== undefined) next.delete(first);
                    }
                    next.add(v.id);
                  }
                  // Auto-show diff when 2 selected
                  if (next.size === 2) {
                    requestAnimationFrame(() => setHistoryShowDiff(true));
                  }
                  return next;
                });
              }
              return;
            }
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setOverlayPanel(null);
          return;
        }
        return;
      }

      // ---- Layer 4: Outline search focused ----
      if (outlineSearchFocused) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (outlineSearch) {
            setOutlineSearch("");
          } else {
            outlineSearchRef.current?.blur();
            setOutlineSearchFocused(false);
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          outlineSearchRef.current?.blur();
          setOutlineSearchFocused(false);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(outlineIndex + 1, filteredOutline.length - 1);
          setOutlineIndex(next);
          scrollOutlineItemIntoView(next);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = Math.max(outlineIndex - 1, 0);
          setOutlineIndex(prev);
          scrollOutlineItemIntoView(prev);
          return;
        }
        return;
      }

      // ---- Layer 5: Title editing ----
      if (editingTitle) {
        if (e.key === "Enter") {
          e.preventDefault();
          setEditingTitle(false);
          titleInputRef.current?.blur();
          if (spec && title !== spec.title) updateTitle(id, title);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (spec) setTitle(spec.title);
          setEditingTitle(false);
          titleInputRef.current?.blur();
          return;
        }
        return;
      }

      // ---- Layer 6: Editor focused (right pane, not view-only) ----
      if (activePane === "right" && !editorViewOnly && isInInput) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (hasChanges) {
            setDiscardConfirm(true);
          } else {
            setEditorViewOnly(true);
            setActivePane("left");
          }
          return;
        }
        // Let editor handle all other keys
        return;
      }

      // ---- Layer 7: Global navigation (no input focused) ----
      if (isInInput) return;

      // Tab — switch pane
      if (e.key === "Tab") {
        e.preventDefault();
        setActivePane((p) => (p === "left" ? "right" : "left"));
        return;
      }

      // j/k/arrows — navigate outline (left pane) or scroll editor (right pane view mode)
      if (e.key === "j" || e.key === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const isDown = e.key === "j" || e.key === "ArrowDown";
        if (activePane === "left") {
          const next = isDown
            ? Math.min(outlineIndex + 1, filteredOutline.length - 1)
            : Math.max(outlineIndex - 1, 0);
          setOutlineIndex(next);
          scrollOutlineItemIntoView(next);
          scrollEditorToOutlineItem(next);
        } else if (editorViewOnly) {
          // Scroll the editor's inner scrollable container
          const scrollLines = activeProject?.scrollLines ?? 5;
          const wrapper = document.querySelector("[data-spec-editor]");
          // Find the first overflow-y-auto child (the actual scrollable area)
          const scrollable = wrapper?.querySelector(".overflow-y-auto") ?? wrapper;
          if (scrollable) {
            const lineHeight = 24;
            const delta = scrollLines * lineHeight * (isDown ? 1 : -1);
            scrollable.scrollBy({ top: delta, behavior: "smooth" });
          }
        }
        return;
      }

      // / — search outline
      if (e.key === "/") {
        e.preventDefault();
        setActivePane("left");
        setOutlineSearchFocused(true);
        requestAnimationFrame(() => outlineSearchRef.current?.focus());
        return;
      }

      // e — enter edit mode (jump to selected heading if any)
      if (e.key === "e" && editable) {
        e.preventDefault();
        const selectedItem = activePane === "left" ? filteredOutline[outlineIndex] : null;
        setActivePane("right");
        setEditorViewOnly(false);
        requestAnimationFrame(() => {
          const textarea = document.querySelector("[data-spec-editor] textarea") as HTMLTextAreaElement | null;
          if (!textarea) return;
          textarea.focus();
          if (selectedItem?.headingLine !== undefined) {
            const lines = content.split("\n");
            let charOffset = 0;
            for (let i = 0; i < Math.min(selectedItem.headingLine, lines.length); i++) {
              charOffset += lines[i].length + 1;
            }
            const lineEnd = charOffset + (lines[selectedItem.headingLine]?.length ?? 0);
            textarea.setSelectionRange(lineEnd, lineEnd);
            // Scroll textarea so the cursor line is visible
            const lineHeight = textarea.scrollHeight / lines.length;
            textarea.scrollTop = Math.max(0, selectedItem.headingLine * lineHeight - textarea.clientHeight / 3);
          }
        });
        return;
      }

      // r — restore viewed version (show confirmation)
      if (e.key === "r" && viewingVersion && editable) {
        e.preventDefault();
        setRestoreConfirm(true);
        return;
      }

      // l — back to latest version
      if (e.key === "l" && viewingVersion) {
        e.preventDefault();
        setViewingVersion(null);
        return;
      }

      // s — save
      if (e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // h — history overlay
      if (e.key === "h") {
        e.preventDefault();
        setHistoryIndex(0);
        setHistorySelected(new Set());
        setHistoryShowDiff(false);
        setOverlayPanel("history");
        return;
      }

      // c — chat overlay
      if (e.key === "c") {
        e.preventDefault();
        setOverlayPanel("chat");
        return;
      }

      // p — pipeline actions
      if (e.key === "p" && editable && latestVersion) {
        e.preventDefault();
        if (activeRunId) {
          router.push(`/pipelines/${activeRunId}`);
        } else if (activeDesignRunId) {
          router.push(`/design-pipelines/${activeDesignRunId}`);
        } else {
          setPipelineConfirm(true);
          setPipelineDialogIndex(0);
        }
        return;
      }

      // t — edit title
      if (e.key === "t" && editable) {
        e.preventDefault();
        setEditingTitle(true);
        requestAnimationFrame(() => titleInputRef.current?.focus());
        return;
      }

      // Escape — back to list
      if (e.key === "Escape") {
        e.preventDefault();
        if (activePane === "right" && editorViewOnly) {
          setActivePane("left");
        } else {
          router.push("/specifications");
        }
        return;
      }

      // Enter — activate outline item (scroll to heading)
      if (e.key === "Enter" && activePane === "left") {
        e.preventDefault();
        const item = filteredOutline[outlineIndex];
        if (item?.type === "heading" && item.headingId) {
          setActivePane("right");
          // Scroll into view in the editor preview
          requestAnimationFrame(() => {
            const el = document.getElementById(item.headingId!);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    restoreConfirm, confirmRestore, discardConfirm, pipelineConfirm, overlayPanel, outlineSearchFocused,
    editingTitle, activePane, editorViewOnly, outlineIndex, filteredOutline,
    editable, hasChanges, outlineSearch, handleSave, saveAndExitEdit,
    versions, historyIndex, historySelected, historyShowDiff,
    discardAndExitEdit, scrollOutlineItemIntoView, scrollEditorToOutlineItem, router, latestVersion, viewingVersion,
    activeRunId, activeDesignRunId, lastFinishedRun, pipelineDialogIndex,
    feedbackDialog, feedbackIndex, sendFeedbackToChat,
  ]);

  /* ================================================================== */
  /*  LOADING STATE                                                      */
  /* ================================================================== */

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-500">
        <style>{keyframes}</style>
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-violet-400/60 animate-spin" />
      </div>
    );
  }

  /* ================================================================== */
  /*  NOT FOUND STATE                                                    */
  /* ================================================================== */

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
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-sm text-zinc-300 transition-all hover:bg-white/[0.08]"
        >
          Back to Specifications
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[spec.status];

  /* ================================================================== */
  /*  MAIN RENDER                                                        */
  /* ================================================================== */

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden text-zinc-100"
    >
      <style>{keyframes}</style>

      {/* ============================================================= */}
      {/*  TOP ACTION BAR                                                */}
      {/* ============================================================= */}
      <div className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] bg-zinc-950 px-4 py-2">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push("/specifications")}
          className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Specs
        </button>
        <span className="text-zinc-700 text-[11px]">/</span>

        {/* Title */}
        {editingTitle ? (
          <>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (spec) setTitle(spec.title); setEditingTitle(false); }}
              className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-zinc-100 outline-none caret-violet-400 border-b border-violet-400/40 py-0.5"
            />
            <kbd className="shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd>
            <kbd className="shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
          </>
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-[13px] font-semibold text-zinc-200 cursor-default"
            onDoubleClick={() => { if (editable) { setEditingTitle(true); requestAnimationFrame(() => titleInputRef.current?.focus()); } }}
          >
            {title || "Untitled"}
          </span>
        )}

        {/* Unsaved indicator */}
        {hasChanges && editable && (
          <span className="flex items-center gap-1 text-[11px] text-amber-400/80 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Unsaved
          </span>
        )}

        {/* Pipeline link */}
        {activeRunId && (
          <Link
            href={`/pipelines/${activeRunId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300 transition-all hover:bg-blue-400/20 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Pipeline
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
            </svg>
          </Link>
        )}
        {activeDesignRunId && (
          <Link
            href={`/design-pipelines/${activeDesignRunId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/20 bg-purple-400/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-300 transition-all hover:bg-purple-400/20 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            Design
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
            </svg>
          </Link>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !editable}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              hasChanges && editable
                ? "bg-violet-500/20 text-violet-300 border border-violet-400/20 hover:bg-violet-500/30"
                : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] border border-transparent"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">s</kbd>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setOverlayPanel("history")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              overlayPanel === "history"
                ? "bg-amber-500/15 text-amber-300 border border-amber-400/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent"
            }`}
          >
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">h</kbd>
            History
          </button>
          <button
            onClick={() => {
              setOverlayPanel("chat");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              overlayPanel === "chat"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent"
            }`}
          >
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">c</kbd>
            Chat
          </button>
          {editable && (
            <button
              onClick={() => {
                setEditingTitle(true);
                requestAnimationFrame(() => titleInputRef.current?.focus());
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent transition-all"
            >
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">t</kbd>
              Title
            </button>
          )}
          {editable && latestVersion && (
            activeRunId || activeDesignRunId ? (
              <Link
                href={activeRunId ? `/pipelines/${activeRunId}` : `/design-pipelines/${activeDesignRunId}`}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-blue-300 bg-blue-500/10 border border-blue-400/20 hover:bg-blue-500/20 transition-all"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                Pipeline
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">p</kbd>
              </Link>
            ) : (
              <button
                onClick={() => setPipelineConfirm(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Pipeline
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">p</kbd>
              </button>
            )
          )}
        </div>

        {/* Reset to draft for failed/cancelled */}
        {(spec.status === "failed" || spec.status === "cancelled") && (
          <button
            type="button"
            onClick={() => updateStatus(id, "draft")}
            className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-zinc-300"
          >
            Reset to Draft
          </button>
        )}
      </div>

      {/* ============================================================= */}
      {/*  SPLIT PANE: LEFT OUTLINE + RIGHT EDITOR                      */}
      {/* ============================================================= */}
      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden p-8 gap-5">

        {/* ---- LEFT COLUMN: Metadata + Outline (280px) ---- */}
        <div className="w-[280px] shrink-0 flex flex-col gap-5 min-h-0">

          {/* Metadata box — static, not navigable */}
          {spec && (
            <div className="shrink-0 rounded-xl border-2 border-white/[0.08] bg-zinc-950/60 px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-2 py-1">
                Metadata
              </div>
              <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] text-zinc-500">
                <span>Status</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border backdrop-blur-md px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                  {badge.label}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] text-zinc-500">
                <span>Type</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border backdrop-blur-md px-2 py-0.5 text-[10px] font-medium ${
                  spec.type === "ui-refactor"
                    ? "bg-purple-400/10 text-purple-300 border-purple-400/20"
                    : "bg-blue-400/10 text-blue-300 border-blue-400/20"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${spec.type === "ui-refactor" ? "bg-purple-400" : "bg-blue-400"}`} />
                  {spec.type === "ui-refactor" ? "UI Refactor" : "Feature"}
                </span>
              </div>
              {[
                ...(latestVersion ? [{ label: "Version", value: `v${latestVersion.versionNumber}` }] : []),
                { label: "Updated", value: new Date(spec.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) },
              ].map((meta) => (
                <div
                  key={meta.label}
                  className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] text-zinc-500"
                >
                  <span>{meta.label}</span>
                  <span className="text-zinc-400">{meta.value}</span>
                </div>
              ))}
              {activeRun && (
                <>
                  <div className="mx-2 my-1 border-t border-white/[0.06]" />
                  <Link
                    href={`/pipelines/${activeRun.id}`}
                    className="block rounded-lg mx-1 px-2 py-2 bg-blue-500/[0.06] border border-blue-400/10 hover:bg-blue-500/10 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                      <span className="text-[11px] font-medium text-blue-300">Pipeline Running</span>
                      <kbd className="ml-auto rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">p</kbd>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Step</span>
                      <span className="text-blue-300/80 capitalize">{activeRun.status}</span>
                    </div>
                    {activeRun.reviewScore !== null && (
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>Score</span>
                        <span className="text-zinc-400 font-mono">{activeRun.reviewScore}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Iteration</span>
                      <span className="text-zinc-400 font-mono">{activeRun.iterations}/{activeRun.maxRetries + 1}</span>
                    </div>
                  </Link>
                </>
              )}
            </div>
          )}

          {/* Outline box — navigable with j/k */}
          <div
            className={`flex-1 min-h-0 flex flex-col rounded-xl border-2 transition-colors duration-200 overflow-hidden ${
              activePane === "left" ? "border-violet-500/40" : "border-white/[0.08]"
            } bg-zinc-950/60`}
          >
            {/* Outline search */}
            <div className="shrink-0 px-3 pt-3 pb-2">
              <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                outlineSearchFocused ? "border-violet-500/40 bg-violet-500/5" : "border-white/[0.06] bg-white/[0.02]"
              }`}>
                {!outlineSearchFocused && !outlineSearch && (
                  <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-600">/</kbd>
                )}
                <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  ref={outlineSearchRef}
                  type="text"
                  value={outlineSearch}
                  onChange={(e) => { setOutlineSearch(e.target.value); setOutlineIndex(0); }}
                  onFocus={() => setOutlineSearchFocused(true)}
                  onBlur={() => setOutlineSearchFocused(false)}
                  placeholder="Filter outline..."
                  className="flex-1 bg-transparent text-[12px] text-zinc-300 placeholder:text-zinc-600 outline-none"
                />
              </div>
            </div>

            {/* Outline items */}
            <div ref={outlineScrollRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
              {/* Headings */}
            {filteredOutline.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-2 py-1.5">
                  Document Outline
                </div>
                {filteredOutline.map((item, i) => {
                  const isActive = outlineIndex === i && activePane === "left";
                  const indent = ((item.headingLevel ?? 1) - 1) * 12;
                  return (
                    <div
                      key={`heading-${item.headingId}`}
                      data-outline-item
                      onClick={() => {
                        setOutlineIndex(i);
                        if (item.headingId) {
                          setActivePane("right");
                          requestAnimationFrame(() => {
                            const el = document.getElementById(item.headingId!);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }
                      }}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] cursor-pointer transition-all duration-150 ${
                        isActive
                          ? "bg-violet-500/25 text-violet-100 ring-2 ring-violet-400/50 shadow-[0_0_20px_rgba(139,92,246,0.3),0_0_6px_rgba(139,92,246,0.2)]"
                          : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-300"
                      }`}
                      style={{ paddingLeft: `${indent + 10}px` }}
                    >
                      <span className={`h-1 w-1 rounded-full shrink-0 ${isActive ? "bg-violet-400" : "bg-zinc-600"}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredOutline.length === 0 && outlineSearch && (
              <div className="px-3 py-6 text-center text-[12px] text-zinc-600 italic">
                No results for &ldquo;{outlineSearch}&rdquo;
              </div>
            )}
          </div>{/* end outline scroll */}
          </div>{/* end outline box */}
        </div>{/* end left column */}

        {/* ---- RIGHT PANE: Editor ---- */}
        <div
          className={`flex-1 flex flex-col min-h-0 min-w-0 rounded-xl border-2 transition-colors duration-200 overflow-hidden bg-zinc-950/60 ${
            activePane === "right" ? "border-violet-500/40" : "border-white/[0.08]"
          }`}
        >
          {/* Version preview banner */}
          {viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber && (
            <div className="flex items-center gap-3 border-b border-blue-400/20 px-4 py-2 bg-blue-400/10 backdrop-blur-md">
              <svg className="h-3.5 w-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-blue-300 font-medium">Viewing v{viewingVersion.versionNumber}</span>
              {editable && (
                <button
                  onClick={() => setRestoreConfirm(true)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-300 transition-all hover:bg-amber-400/20"
                >
                  <kbd className="rounded bg-amber-500/25 px-1 py-0.5 text-[9px] font-medium text-amber-400">r</kbd>
                  Restore
                </button>
              )}
              <button
                onClick={() => setViewingVersion(null)}
                className={`${editable ? "" : "ml-auto "}inline-flex items-center gap-1.5 rounded-lg border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs text-blue-300 transition-all hover:bg-blue-400/20`}
              >
                <kbd className="rounded bg-blue-500/25 px-1 py-0.5 text-[9px] font-medium text-blue-400">l</kbd>
                Latest
              </button>
            </div>
          )}

          {/* Read-only banner */}
          {!editable && !viewingVersion && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2 bg-white/[0.02]">
              <svg className="h-3.5 w-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-xs text-zinc-500">
                Read-only -- <span className="text-zinc-400 font-medium">{spec.status}</span>
                {(spec.status === "failed" || spec.status === "cancelled") && ". Reset to Draft to edit."}
              </span>
            </div>
          )}

          {/* Edit mode indicator */}
          {!editorViewOnly && editable && (
            <div className="flex items-center gap-2 border-b border-violet-500/20 px-4 py-1.5 bg-violet-500/5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[11px] text-violet-300 font-medium">Edit Mode</span>
              <span className="text-[11px] text-zinc-600 ml-auto">
                Esc to exit
              </span>
            </div>
          )}

          {/* Editor content */}
          <div className="flex flex-1 flex-col min-h-0 p-1" data-spec-editor>
            <MarkdownEditor
              value={viewingVersion ? viewingVersion.content : content}
              onChange={editable && !viewingVersion ? setContent : () => {}}
              placeholder="Begin writing your specification..."
              viewOnly={editorViewOnly || !editable || !!(viewingVersion && latestVersion && viewingVersion.versionNumber !== latestVersion.versionNumber)}
            />
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/*  BOTTOM HINTS BAR                                              */}
      {/* ============================================================= */}
      <div
        className="relative z-10 flex items-center gap-4 border-t border-white/[0.06] bg-zinc-950 px-4 py-1.5"
        style={{ animation: "hintBarIn 0.3s ease-out" }}
      >
        <div className="flex items-center gap-3 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd>
            navigate
          </span>
          <span className="text-zinc-800">|</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Tab</kbd>
            switch pane
          </span>
          <span className="text-zinc-800">|</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">/</kbd>
            search
          </span>
          {editable && (
            <>
              <span className="text-zinc-800">|</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">e</kbd>
                edit
              </span>
            </>
          )}
          {editable && latestVersion && (
            <>
              <span className="text-zinc-800">|</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">p</kbd>
                pipeline
              </span>
            </>
          )}
          <span className="text-zinc-800">|</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
            back
          </span>
        </div>

        <div className="flex-1" />

        {/* Pane indicator */}
        <span className="text-[10px] text-zinc-600 font-mono">
          {activePane === "left" ? "OUTLINE" : editorViewOnly ? "PREVIEW" : "EDIT"}
        </span>
      </div>

      {/* ============================================================= */}
      {/*  FULL-SCREEN FOCUS OVERLAYS (Chat / History)                   */}
      {/* ============================================================= */}

      {/* History overlay */}
      {overlayPanel === "history" && (() => {
        const diffVersions = historySelected.size === 2
          ? (() => {
              const ids = Array.from(historySelected);
              const a = versions.find((v) => v.id === ids[0]);
              const b = versions.find((v) => v.id === ids[1]);
              if (!a || !b) return null;
              return a.versionNumber < b.versionNumber ? [a, b] : [b, a];
            })()
          : null;

        return (
          <>
            <div
              data-overlay-open
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              style={{ animation: "fadeIn 0.15s ease-out" }}
              onClick={() => setOverlayPanel(null)}
            />
            <div
              className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
              style={{ animation: "dashOverlayIn 0.2s ease-out" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  {historyShowDiff && diffVersions ? (
                    <button
                      onClick={() => setHistoryShowDiff(false)}
                      className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                  ) : (
                    <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span className="text-sm font-medium text-zinc-200">
                    {historyShowDiff && diffVersions
                      ? <>v{diffVersions[0].versionNumber} <span className="text-zinc-500 mx-1">&rarr;</span> v{diffVersions[1].versionNumber}</>
                      : "Version History"
                    }
                  </span>
                  {!historyShowDiff && versions.length > 0 && (
                    <span className="text-[11px] text-zinc-500 ml-1">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
                  )}
                  {!historyShowDiff && historySelected.size > 0 && (
                    <span className="text-[11px] text-indigo-400 ml-2">
                      {historySelected.size}/2 selected
                    </span>
                  )}
                </div>
                <button
                  onClick={() => historyShowDiff ? setHistoryShowDiff(false) : setOverlayPanel(null)}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-[11px]">{historyShowDiff ? "Back" : "Close"}</span>
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
                </button>
              </div>

              {/* Diff view */}
              {historyShowDiff && diffVersions ? (
                <DiffView oldVersion={diffVersions[0]} newVersion={diffVersions[1]} />
              ) : (
                /* Version list */
                <div ref={historyScrollRef} className="flex-1 overflow-y-auto">
                  {versions.length === 0 ? (
                    <div className="flex h-full items-center justify-center px-4">
                      <p className="text-xs text-zinc-600 text-center">No versions saved yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/40">
                      {versions.map((v, i) => {
                        const isActive = historyIndex === i;
                        const isChecked = historySelected.has(v.id);
                        const isViewing = viewingVersion?.versionNumber === v.versionNumber;
                        return (
                          <div
                            key={v.id}
                            data-history-index={i}
                            onClick={() => setHistoryIndex(i)}
                            className={`px-5 py-3 cursor-pointer transition-all duration-150 ${
                              isActive
                                ? "bg-violet-500/25 border-l-2 border-l-violet-400 ring-2 ring-violet-400/50 shadow-[0_0_20px_rgba(139,92,246,0.3),0_0_6px_rgba(139,92,246,0.2)]"
                                : "border-l-2 border-l-transparent hover:bg-white/[0.02]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Selection checkbox */}
                              <div
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                  isChecked
                                    ? "border-indigo-500 bg-indigo-500/30"
                                    : "border-zinc-700 bg-transparent"
                                }`}
                              >
                                {isChecked && (
                                  <svg className="h-3 w-3 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>

                              {/* Dot */}
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                isViewing ? "bg-blue-400" : isActive ? "bg-violet-400" : "bg-transparent"
                              }`} />

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${isActive ? "text-zinc-100" : "text-zinc-300"}`}>
                                    v{v.versionNumber}
                                  </span>
                                  {isViewing && (
                                    <span className="text-[10px] font-medium text-blue-300 bg-blue-400/15 rounded-full px-1.5 py-0.5">
                                      viewing
                                    </span>
                                  )}
                                  {/* Inline kbd hints after version name */}
                                  {isActive && (
                                    <span className="flex items-center gap-1.5">
                                      <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd>
                                      <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Space</kbd>
                                    </span>
                                  )}
                                  {v.changeNote && (
                                    <span className="text-[11px] text-zinc-500 truncate">{v.changeNote}</span>
                                  )}
                                </div>
                              </div>

                              {/* Date */}
                              <span className="text-[10px] text-zinc-600 shrink-0">
                                {new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom hints */}
              {!historyShowDiff && (
                <div className="shrink-0 border-t border-white/[0.06] px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
                  <span>
                    <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">j</kbd>
                    {" "}
                    <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">k</kbd>
                    {" navigate"}
                  </span>
                  <span>
                    <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Enter</kbd>
                    {" preview"}
                  </span>
                  <span>
                    <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Space</kbd>
                    {" select for diff"}
                  </span>
                  <span>
                    <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
                    {" close"}
                  </span>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* Chat overlay */}
      {overlayPanel === "chat" && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
            onClick={() => { setOverlayPanel(null); setChatInitialMessage(undefined); }}
          />
          <div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ animation: "dashOverlayIn 0.2s ease-out" }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm font-medium text-zinc-200">AI Assistant</span>
              </div>
              <button
                onClick={() => setOverlayPanel(null)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[11px]">Close</span>
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-auto" data-chat-input>
              <AgentChat
                agentName={spec.type === "ui-refactor" ? "Design Spec Expert" : "Feature Spec Expert"}
                context={content}
                onApplySpec={(specContent) => {
                  handleApplySpec(specContent);
                  setOverlayPanel(null);
                }}
                initialMessage={chatInitialMessage}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
        </>
      )}

      {/* ============================================================= */}
      {/*  FEEDBACK ISSUE SELECTOR                                       */}
      {/* ============================================================= */}
      {feedbackDialog && (
        <>
          <div
            data-overlay-open
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
            onClick={() => setFeedbackDialog(null)}
          />
          <div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ animation: "dashOverlayIn 0.2s ease-out" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Refine Spec from Review Feedback</h2>
                <p className="text-[12px] text-zinc-600 mt-0.5">
                  {feedbackSelected.size}/{feedbackDialog.issues.length} issues selected
                  {feedbackDialog.summary && <span className="text-zinc-700"> — {feedbackDialog.summary}</span>}
                </p>
              </div>
              <button
                onClick={() => setFeedbackDialog(null)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[11px]">Close</span>
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
              </button>
            </div>

            {/* Issue list */}
            <div className="flex-1 overflow-y-auto">
              {feedbackDialog.issues.map((issue, i) => {
                const isSelected = feedbackIndex === i;
                const isChecked = feedbackSelected.has(i);
                const severityColors: Record<string, string> = {
                  critical: "text-red-400 bg-red-500/15 border-red-500/20",
                  major: "text-amber-400 bg-amber-500/15 border-amber-500/20",
                  minor: "text-zinc-400 bg-zinc-500/15 border-zinc-500/20",
                };
                return (
                  <div
                    key={i}
                    onClick={() => {
                      setFeedbackSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      });
                      setFeedbackIndex(i);
                    }}
                    className={`flex items-center gap-4 px-6 py-4 cursor-pointer transition-all duration-100 border-l-2 border-b border-white/[0.04] ${
                      isSelected
                        ? "bg-violet-500/[0.06] border-l-violet-500/60"
                        : "border-l-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isChecked
                        ? "bg-violet-500/30 border-violet-400/60"
                        : "border-zinc-700 bg-transparent"
                    }`}>
                      {isChecked && (
                        <svg className="h-3.5 w-3.5 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm leading-relaxed ${isChecked ? "text-zinc-200" : "text-zinc-500"}`}>
                        {issue.text}
                      </span>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${severityColors[issue.severity] ?? severityColors.minor}`}>
                      {issue.severity}
                    </span>
                    {isSelected && (
                      <kbd className="shrink-0 rounded bg-cyan-500/15 border border-cyan-500/20 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">Space</kbd>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom hints bar */}
            <div className="shrink-0 border-t border-white/[0.06] px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
              <span>
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">j</kbd>
                {" "}
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">k</kbd>
                {" navigate"}
              </span>
              <span>
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Space</kbd>
                {" toggle"}
              </span>
              <span className="ml-auto">
                <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400">Enter</kbd>
                {" send to chat"}
              </span>
              <span>
                <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
                {" close"}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ============================================================= */}
      {/*  PIPELINE DIALOG — navigable list                              */}
      {/* ============================================================= */}
      {pipelineConfirm && (() => {
        const options: { key: string; label: string; description: string; icon: React.ReactNode; action: () => void }[] = [];

        // Option: New pipeline
        options.push({
          key: "new",
          label: "New Pipeline",
          description: lastFinishedRun ? "Start a fresh pipeline run with a new worktree" : `Start the ${spec.type === "ui-refactor" ? "design" : "feature"} pipeline`,
          icon: (
            <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          ),
          action: () => {
            const btn = document.querySelector("[data-pipeline-trigger]") as HTMLButtonElement | null;
            if (btn && !btn.disabled) btn.click();
          },
        });

        // Option: Refine spec from feedback (if last run failed/rejected)
        if (lastFinishedRun && (lastFinishedRun.status === "failed" || lastFinishedRun.status === "rejected")) {
          options.push({
            key: "refine",
            label: "Refine Spec from Feedback",
            description: "Select review issues and send to the AI assistant to improve the spec",
            icon: (
              <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            ),
            action: () => openFeedbackDialog(lastFinishedRun.id),
          });
        }

        // Option: View last run (if exists)
        if (lastFinishedRun) {
          const isFailed = lastFinishedRun.status === "failed" || lastFinishedRun.status === "rejected";
          options.push({
            key: "view",
            label: `View ${isFailed ? "Failed" : "Last"} Pipeline`,
            description: `${lastFinishedRun.status} — ${new Date(lastFinishedRun.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${lastFinishedRun.reviewScore !== null ? ` · score ${lastFinishedRun.reviewScore}` : ""}`,
            icon: isFailed ? (
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25" />
              </svg>
            ),
            action: () => {
              setPipelineConfirm(false);
              router.push(`/pipelines/${lastFinishedRun.id}`);
            },
          });
        }

        return (
          <>
            <div
              data-overlay-open
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              style={{ animation: "fadeIn 0.15s ease-out" }}
              onClick={() => setPipelineConfirm(false)}
            />
            <div
              className="fixed z-50 top-1/2 left-1/2 w-[380px]"
              style={{ animation: "modalIn 0.2s ease-out forwards" }}
            >
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <h2 className="text-sm font-medium text-zinc-200">Pipeline</h2>
                  <p className="text-[12px] text-zinc-600 mt-0.5">Select an action</p>
                </div>

                {/* Navigable options list */}
                <div className="pb-2">
                  {options.map((opt, i) => {
                    const isSelected = pipelineDialogIndex === i;
                    return (
                      <div
                        key={opt.key}
                        data-pipeline-option={i}
                        onClick={opt.action}
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-all duration-100 border-l-2 ${
                          isSelected
                            ? "bg-violet-500/[0.06] border-l-violet-500/60"
                            : "border-l-transparent hover:bg-white/[0.02]"
                        }`}
                      >
                        <div className="shrink-0">{opt.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-medium ${isSelected ? "text-zinc-100" : "text-zinc-300"}`}>
                              {opt.label}
                            </span>
                            {isSelected && (
                              <kbd className="rounded bg-cyan-500/15 border border-cyan-500/20 px-1 py-0.5 text-[9px] font-medium text-cyan-400">Enter</kbd>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-600 block mt-0.5">{opt.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Hidden trigger buttons */}
                <div className="hidden">
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
                </div>

                {/* Bottom hints */}
                <div className="border-t border-white/[0.06] px-5 py-2 flex items-center gap-4 text-[11px] text-zinc-600">
                  <span>
                    <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">j</kbd>
                    {" "}
                    <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">k</kbd>
                    {" navigate"}
                  </span>
                  <span>
                    <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd>
                    {" select"}
                  </span>
                  <span>
                    <kbd className="rounded bg-violet-500/15 border border-violet-500/20 px-1 py-0.5 text-[9px] font-medium text-violet-400">Esc</kbd>
                    {" close"}
                  </span>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ============================================================= */}
      {/*  SAVE/DISCARD DIALOG                                           */}
      {/* ============================================================= */}
      {restoreConfirm && viewingVersion && (
        <>
          <div
            data-overlay-open
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 w-[380px]"
            style={{ animation: "modalIn 0.2s ease-out forwards" }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Restore Version</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                This will create a new version with the content from v{viewingVersion.versionNumber} and save it immediately.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={confirmRestore}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/20 text-sm font-medium hover:bg-amber-500/30 transition-colors"
                >
                  <kbd className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">Enter</kbd>
                  Restore &amp; Save
                </button>
                <button
                  onClick={() => setRestoreConfirm(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">Esc</kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {discardConfirm && (
        <>
          <div
            data-overlay-open
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.15s ease-out" }}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 w-[360px]"
            style={{ animation: "modalIn 0.2s ease-out forwards" }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">Unsaved Changes</h2>
              <p className="text-[13px] text-zinc-500 mb-5">
                You have unsaved changes. Save before leaving edit mode?
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveAndExitEdit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-400/20 text-sm font-medium hover:bg-violet-500/30 transition-colors"
                >
                  <kbd className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-medium text-violet-400">Enter</kbd>
                  Save
                </button>
                <button
                  onClick={discardAndExitEdit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">q</kbd>
                  Discard
                </button>
                <button
                  onClick={() => setDiscardConfirm(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-zinc-600 hover:text-zinc-400 text-sm transition-colors ml-auto"
                >
                  <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">Esc</kbd>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
          <div
            className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-zinc-900/95 backdrop-blur-xl px-4 py-2.5 shadow-2xl shadow-black/40"
            style={{ animation: "toastIn 2s ease-out forwards" }}
          >
            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[13px] font-medium text-emerald-300">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
