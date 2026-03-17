import { getSupabase } from "../../../../lib/supabase";
import { retryDesignMerge } from "../../../../lib/designPipelineManager";
import type { DesignStepTimings, DesignPipelineLogEntry } from "../../../../design-pipelines";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const { data: run } = await getSupabase()
    .from("design_runs")
    .select("*, specifications(title)")
    .eq("id", runId)
    .single();

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "failed") {
    return Response.json({ error: "Pipeline is not in failed status" }, { status: 400 });
  }

  if (run.current_step !== "merging_final") {
    return Response.json({ error: "Pipeline did not fail during the merge step" }, { status: 400 });
  }

  const branchName = run.parent_branch as string;
  const worktreePath = run.parent_worktree_path as string;
  const specTitle = (run.specifications as { title: string }).title;

  // Resolve git root from worktree path
  const gitRoot = worktreePath.replace(/\/\.claude\/worktrees\/design-[^/]+$/, "");

  // Validate the branch still exists
  const branchExists = await new Promise<boolean>((resolve) => {
    const proc = spawn("git", ["rev-parse", "--verify", branchName], { cwd: gitRoot, stdio: ["ignore", "pipe", "pipe"] });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });

  if (!branchExists) {
    return Response.json({ error: "Branch no longer exists, cannot retry" }, { status: 400 });
  }

  retryDesignMerge(runId, gitRoot, branchName, specTitle, {
    step_timings: (run.step_timings as DesignStepTimings) ?? {},
    logs: (run.logs as DesignPipelineLogEntry[]) ?? [],
  });

  return Response.json({ ok: true });
}
