import { getChatStreamState, getBufferedChatEvents, addChatClient } from "../../../../lib/chatManager";
import type { ChatSSEEvent } from "../../../../lib/chatManager";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const state = getChatStreamState(clientId);
  const buffered = getBufferedChatEvents(clientId);

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(controller) {
      // Flush buffered events
      if (buffered.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "buffer", events: buffered })}\n\n`)
        );
      }

      // If already finished, close immediately
      if (!state || state.status === "done" || state.status === "error") {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      // Subscribe to live events
      const cleanup = addChatClient(clientId, (event: ChatSSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
          if (event.type === "done" || event.type === "error") {
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
