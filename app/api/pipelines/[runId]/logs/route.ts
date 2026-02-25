import {
  getBufferedLogs,
  getBufferedLogsFromDb,
  getPipelineStatus,
  getPipelineStatusFromDb,
  addClient,
} from "../../../../lib/pipelineManager";
import type { PipelineSSEEvent } from "../../../../pipelines";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled", "rejected"]);

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  // Try in-memory first, fall back to DB
  let buffered = getBufferedLogs(runId);
  let { status, currentStep, reviewScore, stepTimings, iteration, maxRetries } = getPipelineStatus(runId);

  if (buffered.length === 0 && status === "pending") {
    // In-memory state is empty — try loading from DB (e.g. after server restart)
    [buffered, { status, currentStep, reviewScore, stepTimings, iteration, maxRetries }] = await Promise.all([
      getBufferedLogsFromDb(runId),
      getPipelineStatusFromDb(runId),
    ]);
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(controller) {
      // Flush buffered logs
      if (buffered.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "buffer", entries: buffered })}\n\n`)
        );
      }

      // Always send current status so the client knows the active step immediately
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "status", status, currentStep, reviewScore, stepTimings, iteration, maxRetries })}\n\n`)
      );

      // If already finished, close immediately
      if (TERMINAL_STATUSES.has(status)) {
        controller.close();
        return;
      }

      // Subscribe to live events
      const cleanup = addClient(runId, (event: PipelineSSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
          // Close connection when pipeline reaches terminal state
          if (event.type === "status" && TERMINAL_STATUSES.has(event.status)) {
            cleanup();
            controller.close();
          }
        } catch {
          // Controller closed
        }
      });

      // Clean up on abort
      _req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {};
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
