import {
  getBufferedDesignLogs,
  getBufferedDesignLogsFromDb,
  getDesignPipelineStatus,
  getDesignPipelineStatusFromDb,
  addDesignClient,
} from "../../../../lib/designPipelineManager";
import type { DesignPipelineSSEEvent } from "../../../../design-pipelines";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = new Set(["success", "failed", "cancelled"]);

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  let buffered = getBufferedDesignLogs(runId);
  let { status, currentStep, stepTimings, devServerPort, variants } = getDesignPipelineStatus(runId);

  if (buffered.length === 0 && status === "pending") {
    [buffered, { status, currentStep, stepTimings, devServerPort, variants }] = await Promise.all([
      getBufferedDesignLogsFromDb(runId),
      getDesignPipelineStatusFromDb(runId),
    ]);
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(controller) {
      if (buffered.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "buffer", entries: buffered })}\n\n`)
        );
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "status", status, currentStep, stepTimings, devServerPort, variants })}\n\n`)
      );

      if (TERMINAL_STATUSES.has(status)) {
        controller.close();
        return;
      }

      const cleanup = addDesignClient(runId, (event: DesignPipelineSSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
          if (event.type === "status" && TERMINAL_STATUSES.has(event.status)) {
            cleanup();
            controller.close();
          }
        } catch {}
      });

      _req.signal.addEventListener("abort", () => {
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
