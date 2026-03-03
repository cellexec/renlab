import { getSupabase } from "../../../lib/supabase";
import { getDesignPipelineStatus, cancelDesignPipeline } from "../../../lib/designPipelineManager";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const memStatus = getDesignPipelineStatus(runId);

  // Get DB row with variants
  const { data: run } = await getSupabase()
    .from("design_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: variants } = await getSupabase()
    .from("design_variants")
    .select("*")
    .eq("design_run_id", runId)
    .order("variant_number");

  return Response.json({
    ...run,
    status: memStatus.status !== "pending" ? memStatus.status : run.status,
    current_step: memStatus.currentStep ?? run.current_step,
    step_timings: Object.keys(memStatus.stepTimings).length > 0 ? memStatus.stepTimings : (run.step_timings ?? {}),
    dev_server_port: memStatus.devServerPort ?? run.dev_server_port,
    variants: variants ?? [],
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  const aborted = cancelDesignPipeline(runId);

  if (!aborted) {
    await getSupabase()
      .from("design_runs")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .in("status", ["pending", "parent_worktree", "generating", "merging_variants", "installing", "dev_server", "awaiting_review", "finalizing", "merging_final"]);
  }

  return Response.json({ ok: true });
}
