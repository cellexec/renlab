"use client";

import { useState, useEffect } from "react";
import { useAgentStore } from "../hooks/useAgentStore";
import { AgentEditor } from "../components/AgentEditor";
import type { SubAgent } from "../agents";

export default function AgentsPage() {
  const { agents, loaded, addAgent, updateAgent, deleteAgent } =
    useAgentStore();
  const [editing, setEditing] = useState<SubAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleSave = (data: Omit<SubAgent, "id"> & { id?: string }) => {
    if (data.id) {
      const { id, ...rest } = data;
      updateAgent(id, rest);
    } else {
      addAgent(data);
    }
    setEditing(null);
    setCreating(false);
  };

  if (!loaded) return null;

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="text-zinc-300">Agents</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Agents</h1>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Create and manage agents for your chat sessions
                </p>
              </div>
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors duration-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Agent
              </button>
            </div>
          </div>

          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                <svg
                  className="h-12 w-12 text-zinc-600 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5"
                  />
                </svg>
                <p className="mt-4 text-sm text-zinc-400">
                  No agents yet. Create one to get started.
                </p>
                <button
                  onClick={() => setCreating(true)}
                  className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Agent
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {agents.map((agent, idx) => (
                <div
                  key={agent.id}
                  className="group flex items-center gap-3 backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 transition-all duration-200 hover:bg-white/[0.05] animate-fade-in-up"
                  style={{ animationDelay: `${120 + idx * 50}ms` }}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${agent.color}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-zinc-200">
                        {agent.name}
                      </span>
                      <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono">
                        {agent.model}
                      </span>
                    </div>
                    {agent.description && (
                      <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {agent.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => setEditing(agent)}
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
                      title="Edit agent"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteAgent(agent.id)}
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-400"
                      title="Delete agent"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <AgentEditor
          agent={editing ?? undefined}
          onSave={handleSave}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
