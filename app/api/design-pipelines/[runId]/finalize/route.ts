import { getSupabase } from "../../../../lib/supabase";
import { resumeDesignPipeline } from "../../../../lib/designPipelineManager";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { message } = await req.json();

  if (!message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // Validate run exists and is awaiting_review
  const { data: run } = await getSupabase()
    .from("design_runs")
    .select("status")
    .eq("id", runId)
    .single();

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "awaiting_review") {
    return Response.json({ error: `Run is not awaiting review (status: ${run.status})` }, { status: 409 });
  }

  const resumed = resumeDesignPipeline(runId, message);
  if (!resumed) {
    return Response.json({ error: "Could not resume pipeline (no in-memory state)" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
