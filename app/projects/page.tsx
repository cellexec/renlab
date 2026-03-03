"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useProjectContext } from "../components/ProjectContext";
import { groupProjects } from "../lib/groupProjects";

export default function ProjectsPage() {
  const { projects, activeProject, setActiveProjectId, deleteProject } = useProjectContext();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
              <span>/</span>
              <span className="text-zinc-300">Projects</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Projects</h1>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Manage your projects
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/projects/import-monorepo"
                  className="flex items-center gap-2 backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:text-zinc-200 rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-400 transition-all duration-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Import Monorepo
                </Link>
                <Link
                  href="/projects/new"
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-all duration-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add project
                </Link>
              </div>
            </div>
          </div>

          {/* Project list */}
          {projects.length === 0 ? (
            <div className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-500">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                </div>
                <p className="text-[13px] text-zinc-400 mb-4">No projects yet</p>
                <Link
                  href="/projects/new"
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-all duration-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add your first project
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(() => {
                const groups = groupProjects(projects);
                const showHeaders = groups.length > 1;
                let cardIndex = 0;
                return groups.map((group) => (
                  <div key={group.repoPath ?? "__standalone"}>
                    {showHeaders && (
                      <div className="flex items-center gap-2 mt-3 mb-2 first:mt-0">
                        {group.repoPath && (
                          <svg className="h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        )}
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                          {group.label}
                        </span>
                        {group.repoPath && (
                          <span className="text-[10px] text-zinc-700 font-mono truncate">{group.repoPath}</span>
                        )}
                      </div>
                    )}
                    {group.projects.map((project) => {
                      const i = cardIndex++;
                      const isActive = project.id === activeProject?.id;
                      const isConfirming = confirmDeleteId === project.id;

                      return (
                        <div
                          key={project.id}
                          className={`group backdrop-blur-xl bg-white/[0.03] border rounded-xl p-5 transition-all duration-300 hover:bg-white/[0.05] animate-fade-in-up mb-3 last:mb-0 ${
                            isActive ? "border-violet-500/30" : "border-white/[0.06] hover:border-white/[0.1]"
                          }`}
                          style={{ animationDelay: `${100 + i * 60}ms` }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2.5">
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-violet-500/10 text-violet-400" : "bg-white/[0.04] text-zinc-500"}`}>
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-[14px] font-medium text-zinc-100 truncate">{project.title}</h3>
                                  <p className="text-[12px] text-zinc-500 font-mono truncate">{project.path}</p>
                                </div>
                                {isActive && (
                                  <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-400">
                                    Active
                                  </span>
                                )}
                              </div>
                              {project.description && (
                                <p className="mt-2 ml-[42px] text-[13px] text-zinc-400 truncate">{project.description}</p>
                              )}
                              <div className="mt-2 ml-[42px] flex items-center gap-3 text-[11px] text-zinc-600">
                                <span>{project.stack}</span>
                                <span>threshold: {project.pipelineThreshold}</span>
                                <span>retries: {project.maxRetries}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isConfirming ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] text-zinc-400">Remove?</span>
                                  <button
                                    onClick={() => { deleteProject(project.id); setConfirmDeleteId(null); }}
                                    className="rounded-lg px-2.5 py-1 text-[12px] font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-lg px-2.5 py-1 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {!isActive && (
                                    <button
                                      onClick={() => setActiveProjectId(project.id)}
                                      className="rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                      Set active
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setConfirmDeleteId(project.id)}
                                    className="rounded-lg p-1.5 text-zinc-600 hover:bg-white/[0.06] hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                                    title="Remove project"
                                  >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
