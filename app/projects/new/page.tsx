"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectContext } from "../../components/ProjectContext";
import { FolderBrowser } from "../../components/FolderBrowser";
import type { Stack } from "../../projects";

const STACKS: { value: Stack; label: string; description: string }[] = [
  {
    value: "nextjs",
    label: "Next.js",
    description: "React framework with App Router and Tailwind CSS",
  },
  {
    value: "nextjs-supabase",
    label: "Next.js + Supabase",
    description: "Adds Supabase client and database helpers",
  },
  {
    value: "nextjs-supabase-auth",
    label: "Next.js + Supabase + Auth",
    description: "Adds authentication with middleware and login pages",
  },
];

export default function AddProjectPage() {
  const router = useRouter();
  const { projects, addProject } = useProjectContext();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");
  const [hasFiles, setHasFiles] = useState(false);
  const [stack, setStack] = useState<Stack>("nextjs");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const isImport = hasFiles && !!path;
  const duplicateProject = path ? projects.find((p) => p.path === path) : null;
  const actionLabel = isImport ? "Import Existing Project" : "Create New Project";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !path || duplicateProject) return;
    setSaving(true);

    try {
      // Init: git init + optional scaffold
      setStatus(isImport ? "Initializing git..." : "Setting up project...");
      const res = await fetch("/api/projects/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, stack, scaffold: !isImport }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to initialize project");
      }

      // Save project to DB
      setStatus("Saving project...");
      await addProject({
        title: title.trim(),
        description: description.trim(),
        path,
        stack,
      });

      router.push("/");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  };

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Projects</span>
              <span>/</span>
              <span className="text-zinc-300">New</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Add Project</h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              Select a folder to add as a project
            </p>
          </div>

          <div className="max-w-2xl animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-600 py-3 px-3 outline-none transition-all duration-200 focus:border-violet-500/30 focus:shadow-[0_0_0_1px_rgba(139,92,246,0.2)]"
                    placeholder="e.g. My Web App"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-600 py-3 px-3 outline-none transition-all duration-200 focus:border-violet-500/30 focus:shadow-[0_0_0_1px_rgba(139,92,246,0.2)]"
                    placeholder="Short description of the project"
                  />
                </div>

                {/* Stack selector */}
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-zinc-300">Stack</label>
                  {isImport && (
                    <p className="mb-2 text-[12px] text-zinc-500">
                      Scaffolding skipped for existing projects
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    {STACKS.map((s) => {
                      const selected = stack === s.value;
                      const isDisabled = isImport;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setStack(s.value)}
                          className={`rounded-xl border p-3 text-left transition-all duration-200 ${
                            isDisabled
                              ? "cursor-not-allowed border-white/[0.04] bg-white/[0.01] opacity-50"
                              : selected
                                ? "border-violet-500/30 bg-violet-500/[0.08] shadow-[0_0_0_1px_rgba(139,92,246,0.2)]"
                                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04]"
                          }`}
                        >
                          <div
                            className={`text-[13px] font-medium ${selected && !isDisabled ? "text-violet-400" : "text-zinc-200"}`}
                          >
                            {s.label}
                          </div>
                          <div className="mt-1 text-[12px] text-zinc-500">
                            {s.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Path *</label>
                  <FolderBrowser
                    value={path}
                    onChange={(p, files) => {
                      setPath(p);
                      setHasFiles(files);
                    }}
                  />
                  {path && (
                    <p className="mt-1.5 truncate font-mono text-[12px] text-zinc-500">
                      Selected: {path}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        !title.trim() || !path || !!duplicateProject || saving
                      }
                      className="flex-1 bg-violet-600 hover:bg-violet-500 rounded-lg px-3 py-2.5 text-[13px] font-medium text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {saving ? status || "Adding..." : actionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-[13px] text-zinc-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                  {duplicateProject ? (
                    <p className="text-[12px] text-red-400">
                      This folder is already added as &ldquo;{duplicateProject.title}
                      &rdquo;
                    </p>
                  ) : !title.trim() || !path ? (
                    !saving && (
                      <p className="text-[12px] text-amber-500/80">
                        {!title.trim() && !path
                          ? "Enter a title and select a folder to continue"
                          : !title.trim()
                            ? "Enter a title to continue"
                            : "Select a folder to continue"}
                      </p>
                    )
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
