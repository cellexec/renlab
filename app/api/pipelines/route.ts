import { getSupabase } from "../../lib/supabase";
import { startPipeline } from "../../lib/pipelineManager";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { projectId, specificationId, specVersionId, specContent, specTitle, threshold, maxRetries } = await req.json();

  if (!projectId || !specificationId || !specVersionId || !specContent?.trim()) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check for active runs on this spec
  const { data: active } = await getSupabase()
    .from("pipeline_runs")
    .select("id")
    .eq("specification_id", specificationId)
    .in("status", ["pending", "worktree", "coding", "reviewing", "merging"])
    .limit(1);

  if (active && active.length > 0) {
    return Response.json({ error: "A pipeline is already running for this specification" }, { status: 409 });
  }

  // Get project path
  const { data: project } = await getSupabase()
    .from("projects")
    .select("path")
    .eq("id", projectId)
    .single();

  if (!project?.path) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const reviewThreshold = threshold ?? 80;
  const reviewMaxRetries = maxRetries ?? 0;

  // Insert run
  const { data: run, error } = await getSupabase()
    .from("pipeline_runs")
    .insert({
      project_id: projectId,
      specification_id: specificationId,
      spec_version_id: specVersionId,
      status: "pending",
      review_threshold: reviewThreshold,
      max_retries: reviewMaxRetries,
    })
    .select("id")
    .single();

  if (error || !run) {
    return Response.json({ error: error?.message ?? "Failed to create run" }, { status: 500 });
  }

  // Fire and forget
  startPipeline(run.id, projectId, project.path, specificationId, specContent, specTitle, reviewThreshold, reviewMaxRetries);

  return Response.json({ id: run.id });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("pipeline_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}
