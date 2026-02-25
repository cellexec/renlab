import { getSupabase } from "../../../lib/supabase";
import { getPipelineStatus, cancelPipeline } from "../../../lib/pipelineManager";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  // Get in-memory status (most up-to-date)
  const memStatus = getPipelineStatus(runId);

  // Also get DB row for full data
  const { data: run } = await getSupabase()
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  return Response.json({
    ...run,
    // Override with in-memory status if pipeline is still active
    status: memStatus.status !== "pending" ? memStatus.status : run.status,
    current_step: memStatus.currentStep ?? run.current_step,
    review_score: memStatus.reviewScore ?? run.review_score,
    step_timings: Object.keys(memStatus.stepTimings).length > 0 ? memStatus.stepTimings : (run.step_timings ?? {}),
    iterations: memStatus.iteration > 1 ? memStatus.iteration : (run.iterations ?? 1),
    max_retries: memStatus.maxRetries > 0 ? memStatus.maxRetries : (run.max_retries ?? 0),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const aborted = cancelPipeline(runId);

  if (!aborted) {
    // In-memory state is gone (server restart / HMR) — update DB directly
    await getSupabase()
      .from("pipeline_runs")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .in("status", ["pending", "worktree", "coding", "reviewing", "merging"]);
  }

  return Response.json({ ok: true });
}
