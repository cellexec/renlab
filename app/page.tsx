"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "./lib/supabase";

export default function DashboardPage() {
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    sb.from("agents").select("id", { count: "exact", head: true }).then(({ count }) => {
      setAgentCount(count ?? 0);
    });
    sb.from("sessions").select("client_id", { count: "exact", head: true }).then(({ count }) => {
      setSessionCount(count ?? 0);
    });
    sb.from("projects").select("id", { count: "exact", head: true }).then(({ count }) => {
      setProjectCount(count ?? 0);
    });
  }, []);

  const stats = [
    { label: "Agents", value: agentCount, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
      </svg>
    ), color: "text-violet-400" },
    { label: "Sessions", value: sessionCount, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ), color: "text-indigo-400" },
    { label: "Projects", value: projectCount, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ), color: "text-amber-400" },
    { label: "Status", value: null, isStatus: true, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ), color: "text-emerald-400" },
  ];

  const actions = [
    {
      href: "/chat",
      title: "Start chatting",
      description: "Open the streaming chat interface",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      accent: "group-hover:text-violet-400",
    },
    {
      href: "/agents",
      title: "Manage agents",
      description: "Configure and create custom agents",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.59-.659L5 14.5m14 0V17a2 2 0 01-2 2H7a2 2 0 01-2-2v-2.5" />
        </svg>
      ),
      accent: "group-hover:text-indigo-400",
    },
    {
      href: "/sessions",
      title: "View sessions",
      description: "Browse past chat sessions",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      ),
      accent: "group-hover:text-amber-400",
    },
    {
      href: "/projects",
      title: "Manage projects",
      description: "View, add, or remove projects",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      ),
      accent: "group-hover:text-emerald-400",
    },
  ];

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="text-zinc-300">Home</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">RenLab</h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              Refine specs into production code through AI-powered pipelines
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className="stat-card group relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 overflow-hidden transition-all duration-300 hover:bg-white/[0.05] animate-fade-in-up"
                style={{ animationDelay: `${100 + i * 80}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-lg bg-white/[0.04] ${stat.color}`}>
                    {stat.icon}
                  </div>
                </div>
                {'isStatus' in stat && stat.isStatus ? (
                  <>
                    <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                      <span className="inline-flex w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </p>
                    <div className="text-[12px] text-zinc-500 mt-0.5">{stat.label}</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-zinc-100 tabular-nums tracking-tight">
                      {stat.value ?? "\u2014"}
                    </div>
                    <div className="text-[12px] text-zinc-500 mt-0.5">{stat.label}</div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Quick actions
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {actions.map((action, i) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.1] animate-fade-in-up"
                  style={{ animationDelay: `${380 + i * 60}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-zinc-500 transition-colors duration-300 ${action.accent}`}>
                      {action.icon}
                    </span>
                    <span className="text-[13px] font-medium text-zinc-200">
                      {action.title}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-zinc-500">
                    {action.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
