import { getSupabase } from "../../lib/supabase";
import { startDesignPipeline } from "../../lib/designPipelineManager";
import { parseDesignSpec } from "../../lib/parseDesignSpec";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { projectId, specificationId, specVersionId, specContent, specTitle, variantCount: requestedCount, targetPath: requestedTargetPath } = await req.json();

  if (!projectId || !specificationId || !specVersionId || !specContent?.trim()) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const activeStatuses = ["pending", "parent_worktree", "generating", "merging_variants", "installing", "dev_server", "awaiting_review", "finalizing", "merging_final"];

  // Check for active design runs on this spec
  const { data: activeSpec } = await getSupabase()
    .from("design_runs")
    .select("id")
    .eq("specification_id", specificationId)
    .in("status", activeStatuses)
    .limit(1);

  if (activeSpec && activeSpec.length > 0) {
    return Response.json({ error: "A design pipeline is already running for this specification" }, { status: 409 });
  }

  // Check for active design runs on this project (would conflict on git branches/worktrees)
  const { data: activeProject } = await getSupabase()
    .from("design_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", activeStatuses)
    .limit(1);

  if (activeProject && activeProject.length > 0) {
    return Response.json({ error: "A design pipeline is already running for this project" }, { status: 409 });
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

  // Parse spec content for design-specific fields
  const parsed = parseDesignSpec(specContent);
  const variantCount = requestedCount ?? parsed.variantCount;
  const targetPath = requestedTargetPath ?? parsed.targetPath;

  // Insert design run
  const { data: run, error } = await getSupabase()
    .from("design_runs")
    .insert({
      project_id: projectId,
      specification_id: specificationId,
      spec_version_id: specVersionId,
      status: "pending",
      variant_count: variantCount,
      target_path: targetPath,
    })
    .select("id")
    .single();

  if (error || !run) {
    return Response.json({ error: error?.message ?? "Failed to create design run" }, { status: 500 });
  }

  // Insert variant rows
  const variantConfigs = [];
  for (let i = 1; i <= variantCount; i++) {
    const brief = parsed.variantBriefs[i - 1] ?? "";
    const { data: variant } = await getSupabase()
      .from("design_variants")
      .insert({
        design_run_id: run.id,
        variant_number: i,
        brief: brief || null,
      })
      .select("id")
      .single();

    variantConfigs.push({
      variantNumber: i,
      brief,
      dbVariantId: variant?.id ?? "",
    });
  }

  // Fire and forget
  startDesignPipeline(
    run.id,
    projectId,
    project.path,
    specificationId,
    specContent,
    specTitle,
    variantCount,
    targetPath,
    variantConfigs,
  );

  return Response.json({ id: run.id });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("design_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}
