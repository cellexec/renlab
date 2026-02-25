"use client";

import { useState } from "react";
import type { SpecificationVersion } from "../specifications";

interface VersionHistoryProps {
  versions: SpecificationVersion[];
  onRestore: (content: string) => void;
  className?: string;
}

export function VersionHistory({ versions, onRestore, className }: VersionHistoryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = versions.find((v) => v.id === selectedId);

  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center gap-2 border-b border-zinc-700 px-4 py-3">
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium text-zinc-200">Version History</span>
        <span className="text-xs text-zinc-500">{versions.length} versions</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-xs text-zinc-600 text-center">No versions saved yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(selectedId === v.id ? null : v.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selectedId === v.id
                    ? "bg-zinc-800"
                    : "hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-200">
                    v{v.versionNumber}
                  </span>
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
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="border-t border-zinc-700 px-4 py-3">
          <button
            onClick={() => {
              onRestore(selected.content);
              setSelectedId(null);
            }}
            className="w-full rounded-lg bg-amber-600/20 border border-amber-600/40 px-3 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-600/30"
          >
            Restore v{selected.versionNumber}
          </button>
        </div>
      )}
    </div>
  );
}
