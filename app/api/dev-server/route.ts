import { startServer, stopServer, restartServer, clearNextCache } from "../../lib/devServerManager";

export async function POST(req: Request) {
  const { action, projectId, projectPath, repoPath } = await req.json();

  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  switch (action) {
    case "start": {
      if (!projectPath) {
        return Response.json({ error: "projectPath is required for start" }, { status: 400 });
      }
      const result = await startServer(projectId, projectPath, repoPath);
      return Response.json(result);
    }
    case "stop": {
      const result = stopServer(projectId);
      return Response.json(result);
    }
    case "restart": {
      if (!projectPath) {
        return Response.json({ error: "projectPath is required for restart" }, { status: 400 });
      }
      const result = await restartServer(projectId, projectPath, repoPath);
      return Response.json(result);
    }
    case "clear-cache": {
      if (!projectPath) {
        return Response.json({ error: "projectPath is required for clear-cache" }, { status: 400 });
      }
      const result = await clearNextCache(projectId, projectPath);
      if (!result.success) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      return Response.json(result);
    }
    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
