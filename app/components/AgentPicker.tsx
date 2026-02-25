"use client";

import Link from "next/link";
import type { SubAgent } from "../agents";

interface AgentPickerProps {
  agents: SubAgent[];
  onSelect: (agent: SubAgent) => void;
  onClose: () => void;
}

export function AgentPicker({ agents, onSelect, onClose }: AgentPickerProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">
          New Session
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Pick a subagent. Model and system prompt are locked for the session.
        </p>

        <div className="grid gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent)}
              className="group flex items-start gap-3 rounded-lg border border-zinc-800 px-4 py-3 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800"
            >
              <span
                className={`mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full ${agent.color}`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">
                    {agent.name}
                  </span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 group-hover:bg-zinc-700">
                    {agent.model}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {agent.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
          >
            Cancel
          </button>
          <Link
            href="/agents"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
          >
            Manage Agents
          </Link>
        </div>
      </div>
    </div>
  );
}
