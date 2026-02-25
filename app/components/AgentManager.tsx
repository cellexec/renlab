"use client";

import { useState } from "react";
import type { SubAgent } from "../agents";
import { AgentEditor } from "./AgentEditor";

interface AgentManagerProps {
  agents: SubAgent[];
  onAdd: (agent: Omit<SubAgent, "id">) => void;
  onUpdate: (id: string, partial: Partial<Omit<SubAgent, "id">>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function AgentManager({
  agents,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
}: AgentManagerProps) {
  const [editing, setEditing] = useState<SubAgent | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSave = (
    data: Omit<SubAgent, "id"> & { id?: string }
  ) => {
    if (data.id) {
      const { id, ...rest } = data;
      onUpdate(id, rest);
    } else {
      onAdd(data);
    }
    setEditing(null);
    setCreating(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            Manage Agents
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              + Create Agent
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3"
              >
                <span
                  className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${agent.color}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">
                      {agent.name}
                    </span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {agent.model}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {agent.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(agent)}
                    className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
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
                    onClick={() => onDelete(agent.id)}
                    className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
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

          {agents.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              No agents yet. Create one to get started.
            </p>
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
