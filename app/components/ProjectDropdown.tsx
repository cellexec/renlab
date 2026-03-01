"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Project } from "../projects";

interface ProjectDropdownProps {
  projects: Project[];
  activeProject: Project | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  collapsed?: boolean;
}

export function ProjectDropdown({ projects, activeProject, onSelect, onDelete, collapsed }: ProjectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirmDeleteId(null); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (collapsed) {
    return (
      <div className="flex justify-center px-1.5 pb-0">
        <div
          className="rounded-md p-2 text-zinc-500"
          title={activeProject ? activeProject.title : "No project"}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 pb-0">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-zinc-800 min-w-0"
        >
          <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="truncate text-zinc-300">
            {activeProject ? activeProject.title : "No project"}
          </span>
          <svg className="ml-auto h-3 w-3 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <Link
          href="/projects"
          className="shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Manage projects"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </Link>
      </div>

      {open && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">No projects yet</div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-1 px-3 py-2 transition-colors hover:bg-zinc-800 ${
                  p.id === activeProject?.id ? "bg-zinc-800/60" : ""
                }`}
              >
                {confirmDeleteId === p.id ? (
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400 truncate">Remove &ldquo;{p.title}&rdquo;?</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(p.id); setConfirmDeleteId(null); }}
                        className="rounded px-2 py-0.5 text-xs font-medium bg-red-600 text-white hover:bg-red-500"
                      >
                        Remove
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { onSelect(p.id); setOpen(false); }}
                      className="flex flex-1 flex-col text-left min-w-0"
                    >
                      <span className="text-sm text-zinc-200 truncate">{p.title}</span>
                      <span className="text-[11px] text-zinc-500 truncate font-mono">{p.path}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
                      className="shrink-0 rounded p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-zinc-700 hover:text-red-400 transition-all"
                      title="Remove project"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
