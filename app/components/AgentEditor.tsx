"use client";

import { useState } from "react";
import { AGENT_COLORS, type SubAgent } from "../agents";
import { ModelSelect, type Model } from "./ModelSelect";

interface AgentEditorProps {
  agent?: SubAgent;
  onSave: (agent: Omit<SubAgent, "id"> & { id?: string }) => void;
  onClose: () => void;
}

export function AgentEditor({ agent, onSave, onClose }: AgentEditorProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [model, setModel] = useState<Model>(agent?.model ?? "sonnet");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [color, setColor] = useState(agent?.color ?? AGENT_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...(agent ? { id: agent.id } : {}),
      name: name.trim(),
      description: description.trim(),
      model,
      systemPrompt,
      color,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <form
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {agent ? "Edit Agent" : "Create Agent"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              placeholder="e.g. Security Auditor"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              placeholder="Short description of what this agent does"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Model</label>
            <ModelSelect value={model} onChange={setModel} />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none"
              placeholder="Optional system prompt to guide the agent's behavior..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Color</label>
            <div className="flex gap-2">
              {AGENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${c} transition-all ${
                    color === c
                      ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900"
                      : "opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {agent ? "Save Changes" : "Create Agent"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
