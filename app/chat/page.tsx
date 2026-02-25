"use client";

import { useState, useEffect, useCallback } from "react";
import { ClaudeChat } from "../components/ClaudeChat";
import { SessionSidebar } from "../components/SessionSidebar";
import { AgentPicker } from "../components/AgentPicker";
import { useSessionStore, type Message } from "../hooks/useSessionStore";
import { useAgentStore } from "../hooks/useAgentStore";
import { useProjectContext } from "../components/ProjectContext";
import type { SubAgent } from "../agents";

export default function ChatPage() {
  const store = useSessionStore();
  const agentStore = useAgentStore();
  const { activeProject } = useProjectContext();
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const activeSession = store.activeSession;
  const activeAgent = activeSession
    ? agentStore.getAgent(activeSession.agentId)
    : null;

  const handleNewSession = useCallback(() => {
    setShowAgentPicker(true);
  }, []);

  const handleAgentSelected = useCallback(
    (agent: SubAgent) => {
      store.createSession(agent.id, agent.name, agent.model);
      setShowAgentPicker(false);
    },
    [store.createSession]
  );

  const handleMessagesChange = useCallback(
    (messages: Message[]) => {
      if (!activeSession) return;
      store.updateMessages(activeSession.clientId, messages);

      // Auto-set label from first user message
      if (
        activeSession.label.match(/^\S+ \d+$/) &&
        messages.length > 0
      ) {
        const firstUser = messages.find((m) => m.role === "user");
        if (firstUser) {
          const label =
            firstUser.content.length > 40
              ? firstUser.content.slice(0, 40) + "..."
              : firstUser.content;
          store.updateLabel(activeSession.clientId, label);
        }
      }
    },
    [activeSession, store.updateMessages, store.updateLabel]
  );

  const handleSessionIdReceived = useCallback(
    (id: string) => {
      if (activeSession) {
        store.setSessionId(activeSession.clientId, id);
      }
    },
    [activeSession, store.setSessionId]
  );

  const handleStreamingChange = useCallback((streaming: boolean) => {
    setIsStreaming(streaming);
  }, []);

  // Auto-create first session on mount if none exist
  useEffect(() => {
    if (
      store.loaded &&
      agentStore.loaded &&
      store.sessions.length === 0 &&
      agentStore.agents.length > 0
    ) {
      const first = agentStore.agents[0];
      store.createSession(first.id, first.name, first.model);
    }
  }, [store.loaded, agentStore.loaded, store.sessions.length, agentStore.agents, store.createSession]);

  if (!store.loaded || !agentStore.loaded) return null;

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <SessionSidebar
        sessions={store.sessions}
        activeClientId={store.activeClientId}
        getAgent={agentStore.getAgent}
        onSelect={store.switchSession}
        onNewSession={handleNewSession}
        onDelete={store.deleteSession}
        disabled={isStreaming}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">RenLab</h1>
            <p className="text-[13px] text-zinc-500">
              Refine specs into production code through AI-powered pipelines
            </p>
          </div>
          {activeAgent && (
            <div className="flex items-center gap-2 backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-full px-3 py-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${activeAgent.color}`}
              />
              <span className="text-[13px] font-medium text-zinc-200">
                {activeAgent.name}
              </span>
              <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono">
                {activeSession!.model}
              </span>
            </div>
          )}
        </header>

        {!activeProject && (
          <div className="mx-4 mt-3">
            <div className="flex items-center gap-2 backdrop-blur-xl bg-amber-500/[0.04] border border-amber-500/[0.1] rounded-xl px-4 py-3">
              <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-[12px] text-amber-400">
                No project selected &mdash; Claude won&apos;t have filesystem access.{" "}
                <a href="/projects/new" className="underline hover:text-amber-300 transition-colors">Add a project</a>{" "}
                or select one from the sidebar.
              </p>
            </div>
          </div>
        )}

        {activeSession && (
          <ClaudeChat
            key={activeSession.clientId}
            model={activeSession.model}
            messages={activeSession.messages}
            sessionId={activeSession.sessionId}
            clientId={activeSession.clientId}
            systemPrompt={activeAgent?.systemPrompt || undefined}
            projectPath={activeProject?.path}
            onMessagesChange={handleMessagesChange}
            onAddMessage={store.addMessage}
            onSessionIdReceived={handleSessionIdReceived}
            onStreamingChange={handleStreamingChange}
          />
        )}
      </div>

      {showAgentPicker && (
        <AgentPicker
          agents={agentStore.agents}
          onSelect={handleAgentSelected}
          onClose={() => setShowAgentPicker(false)}
        />
      )}
    </div>
  );
}
