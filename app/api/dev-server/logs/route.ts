import { getBufferedLogs, addClient, type SSEEvent } from "../../../lib/devServerManager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(controller) {
      // Flush buffered logs
      const buffered = getBufferedLogs(projectId);
      if (buffered.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "buffer", entries: buffered })}\n\n`)
        );
      }

      // Subscribe to live events
      const cleanup = addClient(projectId, (event: SSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Controller closed
        }
      });

      // Clean up on abort
      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
