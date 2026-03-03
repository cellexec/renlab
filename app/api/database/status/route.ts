import { getCommandStatus, getSupabaseStatus, getDockerComposeStatus } from "../../../lib/dbManager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const projectPath = url.searchParams.get("projectPath");
  const repoPath = url.searchParams.get("repoPath") || null;

  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  const { status: commandStatus } = getCommandStatus(projectId);

  let servicesUp = false;
  if (repoPath) {
    const result = await getDockerComposeStatus(repoPath);
    servicesUp = result.servicesUp;
  } else if (projectPath) {
    const result = await getSupabaseStatus(projectPath, repoPath);
    servicesUp = result.supabaseUp;
  }

  return Response.json({ commandStatus, servicesUp, supabaseUp: servicesUp });
}
