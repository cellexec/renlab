"use client";

import { useRouter } from "next/navigation";

interface ReviewScoreCardProps {
  score: number;
  threshold: number;
  summary?: string;
  issues?: string[];
  runId?: string;
  specificationId?: string;
  /** Score history from previous iterations (oldest first, not including current score) */
  previousScores?: number[];
}

export function ReviewScoreCard({ score, threshold, summary, issues, runId, specificationId, previousScores }: ReviewScoreCardProps) {
  const router = useRouter();
  const passed = score >= threshold;

  const showCreateSpec = !!(issues && issues.length > 0 && runId && specificationId);

  const handleCreateSpec = () => {
    const message = [
      "The following issues were reported during an automated pipeline review:",
      "",
      `Pipeline Run: ${runId}`,
      `Specification: ${specificationId}`,
      "Issues found:",
      ...issues!.map((issue) => `- ${issue}`),
      "",
      "Please create a specification to address these issues.",
    ].join("\n");

    sessionStorage.setItem("spec-from-issues", message);
    router.push("/specifications/new?fromIssues=1");
  };

  return (
    <div className={`rounded-lg border p-5 ${
      passed ? "border-emerald-800 bg-emerald-950/30" : "border-red-800 bg-red-950/30"
    }`}>
      <div className="flex items-start gap-4">
        {/* Score */}
        <div className="flex flex-col items-center">
          <span className={`text-4xl font-bold tabular-nums ${
            passed ? "text-emerald-400" : "text-red-400"
          }`}>
            {score}
          </span>
          <span className="text-xs text-zinc-500 mt-0.5">/ 100</span>
          {/* Previous scores history */}
          {previousScores && previousScores.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              {previousScores.map((s, i) => (
                <span
                  key={i}
                  className={`text-[10px] tabular-nums ${s >= threshold ? "text-emerald-600" : "text-red-600"}`}
                  title={`Iteration ${i + 1}: ${s}`}
                >
                  {s}
                </span>
              ))}
              <span className="text-[10px] text-zinc-600">&rarr;</span>
              <span className={`text-[10px] font-semibold tabular-nums ${passed ? "text-emerald-400" : "text-red-400"}`}>
                {score}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Pass/fail badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              passed
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            }`}>
              {passed ? "PASSED" : "FAILED"}
            </span>
            <span className="text-xs text-zinc-500">
              threshold: {threshold}
            </span>
            {previousScores && previousScores.length > 0 && (
              <span className="text-xs text-zinc-600">
                iteration {previousScores.length + 1} of {previousScores.length + 1}
              </span>
            )}
          </div>

          {/* Summary */}
          {summary && (
            <p className="text-sm text-zinc-300 mb-3">{summary}</p>
          )}

          {/* Issues */}
          {issues && issues.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Issues</h4>
              <ul className="space-y-1">
                {issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-zinc-600 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
              {showCreateSpec && (
                <button
                  onClick={handleCreateSpec}
                  className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:border-zinc-600"
                >
                  Create Spec from Issues
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
