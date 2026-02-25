"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface DirEntry {
  name: string;
  path: string;
  hasFiles: boolean;
}

interface FolderBrowserProps {
  value: string;
  onChange: (path: string, hasFiles: boolean) => void;
}

function FolderIcon({ hasFiles }: { hasFiles: boolean }) {
  if (hasFiles) {
    return (
      <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 12h4m-2-2v4" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

export function FolderBrowser({ value, onChange }: FolderBrowserProps) {
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(value || "");
  const [currentHasFiles, setCurrentHasFiles] = useState(false);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDirs = useCallback(async (dirPath?: string) => {
    setLoading(true);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const res = await fetch(`/api/folders${params}`);
      const data = await res.json();
      if (data.current) {
        setCurrentPath(data.current);
        setCurrentHasFiles(!!data.hasFiles);
        setParentPath(data.parent !== data.current ? data.parent : null);
        setDirs(data.dirs ?? []);
        return !!data.hasFiles;
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirs(value || undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (dir: DirEntry) => {
    // If there's a pending single-click timer, this is a double click
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      // Double click → navigate into
      fetchDirs(dir.path);
      return;
    }
    // Single click → select (delayed to distinguish from double click)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onChange(dir.path, dir.hasFiles);
    }, 200);
  };

  const handleUpClick = () => {
    if (parentPath) fetchDirs(parentPath);
  };

  const handleSelectCurrent = () => {
    onChange(currentPath, currentHasFiles);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/folders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath: currentPath, name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (data.path) {
        setNewFolderName("");
        setShowNewFolder(false);
        await fetchDirs(data.path);
        onChange(data.path, false);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
      {/* Current path bar */}
      <div className="flex items-center gap-2 border-b border-zinc-700 px-3 py-2">
        {parentPath && (
          <button
            type="button"
            onClick={handleUpClick}
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            title="Go up"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <span className="flex-1 truncate text-xs text-zinc-400 font-mono">{currentPath}</span>
        <button
          type="button"
          onClick={handleSelectCurrent}
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            value === currentPath
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          }`}
        >
          {value === currentPath ? "Selected" : "Select"}
        </button>
      </div>

      {/* Directory listing */}
      <div className="max-h-60 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-zinc-500">Loading...</div>
        ) : dirs.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-zinc-500">No subdirectories</div>
        ) : (
          <>
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">
              Click to select &middot; Double-click to open
            </div>
            {dirs.map((dir) => (
              <button
                key={dir.path}
                type="button"
                onClick={() => handleClick(dir)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-700 ${
                  dir.path === value ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-300"
                }`}
              >
                <FolderIcon hasFiles={dir.hasFiles} />
                <span className="truncate">{dir.name}</span>
                {dir.path === value && (
                  <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </>
        )}
      </div>

      {/* New folder */}
      <div className="border-t border-zinc-700 px-3 py-2">
        {showNewFolder ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-500"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creating}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New folder
          </button>
        )}
      </div>
    </div>
  );
}
