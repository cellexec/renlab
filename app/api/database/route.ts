import { runCommand, runSupabaseCommand, getAppCwd } from "../../lib/dbManager";

export async function POST(req: Request) {
  const { action, projectId, projectPath, repoPath } = await req.json();

  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!projectPath) {
    return Response.json({ error: "projectPath is required" }, { status: 400 });
  }

  // Monorepo mode — docker compose + bun run
  if (repoPath) {
    const appCwd = getAppCwd(projectPath, repoPath);

    switch (action) {
      case "services-start":
        return Response.json(runCommand(projectId, { cmd: "docker", args: ["compose", "up", "-d"], cwd: repoPath, label: "docker compose up" }));
      case "services-stop":
        return Response.json(runCommand(projectId, { cmd: "docker", args: ["compose", "down"], cwd: repoPath, label: "docker compose down" }));
      case "db-migrate":
        return Response.json(runCommand(projectId, { cmd: "bun", args: ["run", "--cwd", appCwd, "db:migrate"], cwd: repoPath, label: `db:migrate (${appCwd})` }));
      case "db-seed":
        return Response.json(runCommand(projectId, { cmd: "bun", args: ["run", "--cwd", appCwd, "db:seed"], cwd: repoPath, label: `db:seed (${appCwd})` }));
      case "db-reset":
        return Response.json(runCommand(projectId, { cmd: "bun", args: ["run", "--cwd", appCwd, "db:reset"], cwd: repoPath, label: `db:reset (${appCwd})` }));
      case "auth-migrate":
        return Response.json(runCommand(projectId, { cmd: "bun", args: ["run", "--cwd", "packages/auth", "db:migrate"], cwd: repoPath, label: "db:migrate (packages/auth)" }));
      case "auth-seed":
        return Response.json(runCommand(projectId, { cmd: "bun", args: ["run", "--cwd", "packages/auth", "db:seed"], cwd: repoPath, label: "db:seed (packages/auth)" }));
      case "auth-reset":
        return Response.json(runCommand(projectId, { cmd: "bun", args: ["run", "--cwd", "packages/auth", "db:reset"], cwd: repoPath, label: "db:reset (packages/auth)" }));
      default:
        return Response.json({ error: `Unknown monorepo action: ${action}` }, { status: 400 });
    }
  }

  // Supabase mode — npx supabase
  switch (action) {
    case "start":
      return Response.json(runSupabaseCommand(projectId, projectPath, "supabase start", ["start"]));
    case "stop":
      return Response.json(runSupabaseCommand(projectId, projectPath, "supabase stop", ["stop"]));
    case "migration-up":
      return Response.json(runSupabaseCommand(projectId, projectPath, "migration up", ["migration", "up"]));
    case "db-reset":
      return Response.json(runSupabaseCommand(projectId, projectPath, "db reset", ["db", "reset"]));
    case "db-seed":
      return Response.json(runSupabaseCommand(projectId, projectPath, "db seed", ["db", "seed"]));
    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
