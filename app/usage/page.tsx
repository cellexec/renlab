"use client";

import { useState, useEffect } from "react";
import type { UsageStats } from "claude-agent-sdk";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function friendlyModelName(id: string): string {
  if (id.includes("opus-4-6")) return "Opus 4.6";
  if (id.includes("opus-4-5")) return "Opus 4.5";
  if (id.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (id.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (id.includes("haiku-4-5")) return "Haiku 4.5";
  if (id.includes("sonnet")) return "Sonnet";
  if (id.includes("opus")) return "Opus";
  if (id.includes("haiku")) return "Haiku";
  return id;
}

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
        <div className="h-full overflow-auto">
          <div className="max-w-full px-6 py-6">
            <div className="mb-6 animate-fade-in-up stagger-1">
              <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
                <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
                <span>/</span>
                <span className="text-zinc-300">Usage</span>
              </div>
              <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Usage</h1>
              <p className="mt-1 text-[13px] text-zinc-500">Claude Code usage statistics</p>
            </div>
            <div className="flex items-center justify-center py-20">
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                <p className="text-sm text-zinc-400">
                  No usage data found. Run Claude Code to generate stats.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const last30 = stats.dailyActivity.slice(-30);
  const maxMessages = Math.max(...last30.map((d) => d.messageCount), 1);

  const hourEntries = Object.entries(stats.hourCounts)
    .map(([h, count]) => ({ hour: Number(h), count }))
    .sort((a, b) => a.hour - b.hour);
  const maxHourCount = Math.max(...hourEntries.map((e) => e.count), 1);

  const modelEntries = Object.entries(stats.modelUsage);

  const totalOutput = modelEntries.reduce(
    (sum, [, m]) => sum + m.outputTokens,
    0
  );
  const totalInput = modelEntries.reduce(
    (sum, [, m]) => sum + m.inputTokens,
    0
  );
  const totalCacheRead = modelEntries.reduce(
    (sum, [, m]) => sum + m.cacheReadInputTokens,
    0
  );

  return (
    <div className={`h-full bg-zinc-950 text-zinc-100 transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full overflow-auto">
        <div className="max-w-full px-6 py-6">
          {/* Breadcrumb + header */}
          <div className="mb-6 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Home</span>
              <span>/</span>
              <span className="text-zinc-300">Usage</span>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Usage</h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              Claude Code usage statistics &middot; since{" "}
              {formatDate(stats.firstSessionDate)}
            </p>
          </div>

          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Total Sessions", value: formatNumber(stats.totalSessions) },
                { label: "Total Messages", value: formatNumber(stats.totalMessages) },
                { label: "Output Tokens", value: formatNumber(totalOutput) },
                { label: "Longest Session", value: formatDuration(stats.longestSession.duration), sub: `${stats.longestSession.messageCount} messages` },
              ].map((card, i) => (
                <div
                  key={card.label}
                  className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 transition-all duration-300 hover:bg-white/[0.05] animate-fade-in-up"
                  style={{ animationDelay: `${100 + i * 80}ms` }}
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-2">{card.label}</p>
                  <p className="text-2xl font-bold text-zinc-100 tabular-nums tracking-tight">{card.value}</p>
                  {card.sub && <p className="text-[12px] text-zinc-500 mt-0.5">{card.sub}</p>}
                </div>
              ))}
            </div>

            {/* Model token breakdown */}
            <section className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Token Usage by Model</h2>
              <div className="backdrop-blur-xl bg-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04] backdrop-blur-xl bg-white/[0.03] text-left text-[11px] text-zinc-500 uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">Model</th>
                      <th className="px-4 py-3 font-medium text-right">Input</th>
                      <th className="px-4 py-3 font-medium text-right">Output</th>
                      <th className="px-4 py-3 font-medium text-right">Cache Read</th>
                      <th className="px-4 py-3 font-medium text-right">Cache Write</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelEntries.map(([id, m]) => (
                      <tr key={id} className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.04]">
                        <td className="px-4 py-3 font-medium text-[13px]">{friendlyModelName(id)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400 text-[13px] font-mono">
                          {formatNumber(m.inputTokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400 text-[13px] font-mono">
                          {formatNumber(m.outputTokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400 text-[13px] font-mono">
                          {formatNumber(m.cacheReadInputTokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400 text-[13px] font-mono">
                          {formatNumber(m.cacheCreationInputTokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="backdrop-blur-xl bg-white/[0.03] text-[11px] text-zinc-500">
                      <td className="px-4 py-3 font-medium">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono">
                        {formatNumber(totalInput)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono">
                        {formatNumber(totalOutput)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono">
                        {formatNumber(totalCacheRead)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono">
                        {formatNumber(
                          modelEntries.reduce(
                            (s, [, m]) => s + m.cacheCreationInputTokens,
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* Daily activity bars */}
            <section className="animate-fade-in-up" style={{ animationDelay: "380ms" }}>
              <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Daily Activity{" "}
                <span className="text-zinc-600 normal-case tracking-normal">
                  (last {last30.length} days)
                </span>
              </h2>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-end gap-[3px] h-40">
                  {last30.map((day) => {
                    const pct = (day.messageCount / maxMessages) * 100;
                    return (
                      <div
                        key={day.date}
                        className="group relative flex-1 min-w-0"
                      >
                        <div
                          className="w-full rounded-t bg-violet-500/60 transition-all duration-200 group-hover:bg-violet-400/80"
                          style={{ height: `${pct}%` }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                          <div className="whitespace-nowrap rounded-lg backdrop-blur-xl bg-zinc-900/90 border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-200 shadow-lg">
                            <div className="font-medium">{day.date}</div>
                            <div className="text-zinc-400">{day.messageCount.toLocaleString()} msgs</div>
                            <div className="text-zinc-400">{day.sessionCount} sessions</div>
                            <div className="text-zinc-400">{day.toolCallCount.toLocaleString()} tools</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-zinc-600 font-mono">
                  <span>{last30[0]?.date}</span>
                  <span>{last30[last30.length - 1]?.date}</span>
                </div>
              </div>
            </section>

            {/* Hourly distribution */}
            <section className="animate-fade-in-up" style={{ animationDelay: "460ms" }}>
              <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Hourly Distribution</h2>
              <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-end gap-[3px] h-32">
                  {hourEntries.map((entry) => {
                    const pct = (entry.count / maxHourCount) * 100;
                    return (
                      <div
                        key={entry.hour}
                        className="group relative flex-1 min-w-0"
                      >
                        <div
                          className="w-full rounded-t bg-indigo-500/50 transition-all duration-200 group-hover:bg-indigo-400/70"
                          style={{ height: `${pct}%` }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                          <div className="whitespace-nowrap rounded-lg backdrop-blur-xl bg-zinc-900/90 border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-200 shadow-lg">
                            <div className="font-medium font-mono">
                              {entry.hour.toString().padStart(2, "0")}:00
                            </div>
                            <div className="text-zinc-400">{entry.count} sessions</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-zinc-600 font-mono">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:00</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
