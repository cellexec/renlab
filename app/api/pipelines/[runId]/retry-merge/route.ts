import { getSupabase } from "../../../../lib/supabase";
import { retryMerge } from "../../../../lib/pipelineManager";
import type { PipelineLogEntry, StepTimings } from "../../../../pipelines";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  // Load run with joined spec title
  const { data: run } = await getSupabase()
    .from("pipeline_runs")
    .select("*, specifications(title)")
    .eq("id", runId)
    .single();

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "failed" && run.status !== "rejected") {
    return Response.json({ error: "Pipeline is not in failed or rejected status" }, { status: 400 });
  }

  if (run.status === "failed" && run.current_step !== "merging") {
    return Response.json({ error: "Pipeline did not fail during the merge step" }, { status: 400 });
  }

  const branchName = run.worktree_branch as string;
  const worktreePath = run.worktree_path as string;
  const specTitle = (run.specifications as { title: string }).title;

  // Resolve git root from worktree path
  // worktreePath is like: ${gitRoot}/.claude/worktrees/pipeline-${shortId}
  const gitRoot = worktreePath.replace(/\/\.claude\/worktrees\/pipeline-[^/]+$/, "");

  // Validate the branch still exists
  const branchExists = await new Promise<boolean>((resolve) => {
    const proc = spawn("git", ["rev-parse", "--verify", branchName], { cwd: gitRoot, stdio: ["ignore", "pipe", "pipe"] });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });

  if (!branchExists) {
    return Response.json({ error: "Worktree branch no longer exists, cannot retry" }, { status: 400 });
  }

  // Fire and forget — retryMerge sets up in-memory state and runs merge async
  retryMerge(runId, gitRoot, branchName, worktreePath, specTitle, {
    review_score: run.review_score,
    step_timings: (run.step_timings as StepTimings) ?? {},
    logs: (run.logs as PipelineLogEntry[]) ?? [],
    iterations: run.iterations ?? 1,
    max_retries: run.max_retries ?? 0,
  });

  return Response.json({ ok: true });
}
