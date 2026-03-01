"use client";

import { useState, useMemo, useCallback } from "react";
import type { SpecificationVersion } from "../specifications";

interface VersionHistoryProps {
  versions: SpecificationVersion[];
  onRestore: (content: string) => void;
  onView?: (content: string, versionNumber: number) => void;
  canRestore?: boolean;
  viewingVersionNumber?: number | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Simple line-by-line diff (no dependencies)
// ---------------------------------------------------------------------------

type DiffLine =
  | { type: "unchanged"; text: string }
  | { type: "added"; text: string }
  | { type: "removed"; text: string };

/**
 * Compute a minimal line-level diff between two strings using the classic
 * LCS (Longest Common Subsequence) approach. This produces clean diffs
 * where unchanged lines stay in place and added/removed lines are grouped.
 */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;

  // For large files, use a row-pair optimisation to save memory on the
  // table, then back-track with the full table for path recovery. Since
  // spec content is typically small we just build the full table.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Back-track to produce the diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "unchanged", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", text: oldLines[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

// ---------------------------------------------------------------------------
// Icons (inline SVGs to avoid deps)
// ---------------------------------------------------------------------------

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-3.5 w-3.5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-3.5 w-3.5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "h-4 w-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Diff viewer sub-component
// ---------------------------------------------------------------------------

function DiffViewer({
  oldVersion,
  newVersion,
  onClose,
}: {
  oldVersion: SpecificationVersion;
  newVersion: SpecificationVersion;
  onClose: () => void;
}) {
  const lines = useMemo(
    () => computeDiff(oldVersion.content, newVersion.content),
    [oldVersion.content, newVersion.content],
  );

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const l of lines) {
      if (l.type === "added") added++;
      else if (l.type === "removed") removed++;
    }
    return { added, removed };
  }, [lines]);

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 bg-white/[0.02]">
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-zinc-200">
          v{oldVersion.versionNumber} <span className="text-zinc-500 mx-1">&rarr;</span> v{newVersion.versionNumber}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <span className="text-emerald-400">+{stats.added}</span>
          <span className="text-red-400">-{stats.removed}</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto px-0 py-2">
        <pre className="text-xs font-mono leading-relaxed">
          {lines.map((line, i) => {
            let bg = "";
            let textColor = "text-zinc-500";
            let prefix = " ";
            if (line.type === "added") {
              bg = "bg-emerald-500/10";
              textColor = "text-emerald-300";
              prefix = "+";
            } else if (line.type === "removed") {
              bg = "bg-red-500/10";
              textColor = "text-red-300";
              prefix = "-";
            }
            return (
              <div key={i} className={`px-4 py-px ${bg}`}>
                <span className={`select-none ${line.type === "unchanged" ? "text-zinc-600" : textColor} mr-2`}>
                  {prefix}
                </span>
                <span className={textColor}>{line.text || "\u00A0"}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VersionHistory({
  versions,
  onRestore,
  onView,
  canRestore = true,
  viewingVersionNumber,
  className,
}: VersionHistoryProps) {
  // Selected version (for action buttons)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Diff mode
  const [diffMode, setDiffMode] = useState(false);
  const [diffIds, setDiffIds] = useState<Set<string>>(new Set());
  const [showDiff, setShowDiff] = useState(false);

  const selected = versions.find((v) => v.id === selectedId);

  const toggleDiffMode = useCallback(() => {
    setDiffMode((prev) => {
      if (prev) {
        // Exiting diff mode: clear selections
        setDiffIds(new Set());
        setShowDiff(false);
      }
      return !prev;
    });
  }, []);

  const toggleDiffId = useCallback((id: string) => {
    setDiffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 2) {
          // Replace the oldest selection
          const first = next.values().next().value;
          if (first !== undefined) next.delete(first);
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  // Resolve diff versions (sorted by version number: old first)
  const diffVersions = useMemo(() => {
    if (diffIds.size !== 2) return null;
    const ids = Array.from(diffIds);
    const a = versions.find((v) => v.id === ids[0]);
    const b = versions.find((v) => v.id === ids[1]);
    if (!a || !b) return null;
    return a.versionNumber < b.versionNumber ? [a, b] : [b, a];
  }, [diffIds, versions]);

  // -----------------------------------------------------------------------
  // Diff view
  // -----------------------------------------------------------------------
  if (showDiff && diffVersions) {
    return (
      <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
        <DiffViewer
          oldVersion={diffVersions[0]}
          newVersion={diffVersions[1]}
          onClose={() => setShowDiff(false)}
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Normal list view
  // -----------------------------------------------------------------------
  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium text-zinc-200">Version History</span>
        <span className="text-xs text-zinc-500">{versions.length} versions</span>

        {/* Diff mode toggle */}
        {versions.length >= 2 && (
          <button
            onClick={toggleDiffMode}
            className={`ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              diffMode
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
            }`}
          >
            {diffMode ? "Exit diff" : "Compare"}
          </button>
        )}
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-xs text-zinc-600 text-center">No versions saved yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {versions.map((v) => {
              const isSelected = selectedId === v.id;
              const isDiffChecked = diffIds.has(v.id);
              const isViewing = viewingVersionNumber === v.versionNumber;

              return (
                <div key={v.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (diffMode) {
                        toggleDiffId(v.id);
                      } else {
                        setSelectedId(isSelected ? null : v.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (diffMode) {
                          toggleDiffId(v.id);
                        } else {
                          setSelectedId(isSelected ? null : v.id);
                        }
                      }
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      isViewing && !diffMode
                        ? "bg-blue-500/10 border-l-2 border-l-blue-400"
                        : diffMode && isDiffChecked
                          ? "bg-indigo-500/10"
                          : isSelected && !diffMode
                            ? "bg-white/[0.04]"
                            : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Diff checkbox */}
                      {diffMode && (
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            isDiffChecked
                              ? "border-indigo-500 bg-indigo-500/30"
                              : "border-zinc-600 bg-transparent"
                          }`}
                        >
                          {isDiffChecked && (
                            <svg className="h-3 w-3 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}

                      {/* Inline view button — before version label */}
                      {onView && !diffMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onView(v.content, v.versionNumber);
                          }}
                          className={`shrink-0 rounded-md p-1 transition-colors ${
                            isViewing
                              ? "text-blue-300 bg-blue-400/20"
                              : "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                          title={`View v${v.versionNumber}`}
                        >
                          <EyeIcon className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-200">v{v.versionNumber}</span>
                            {isViewing && !diffMode && (
                              <span className="text-[10px] font-medium text-blue-300 bg-blue-400/15 rounded-full px-1.5 py-0.5">
                                viewing
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            {new Date(v.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {v.changeNote && (
                          <p className="mt-1 text-xs text-zinc-400 truncate">{v.changeNote}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Restore button (non-diff mode, selected) */}
                  {isSelected && !diffMode && canRestore && (
                    <div className="flex items-center gap-2 px-4 pb-3 -mt-1">
                      <button
                        onClick={() => {
                          onRestore(v.content);
                          setSelectedId(null);
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-amber-600/15 border border-amber-600/30 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-600/25"
                      >
                        <RestoreIcon className="h-3.5 w-3.5" />
                        Restore
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compare button (diff mode, 2 selected) */}
      {diffMode && diffVersions && (
        <div className="border-t border-white/[0.06] px-4 py-3 bg-white/[0.02] backdrop-blur">
          <button
            onClick={() => setShowDiff(true)}
            className="w-full rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-3 py-2 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/30"
          >
            Compare v{diffVersions[0].versionNumber} &rarr; v{diffVersions[1].versionNumber}
          </button>
        </div>
      )}

      {/* Diff mode hint */}
      {diffMode && diffIds.size < 2 && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="text-xs text-zinc-500 text-center">
            Select {2 - diffIds.size} version{diffIds.size === 0 ? "s" : ""} to compare
          </p>
        </div>
      )}
    </div>
  );
}
