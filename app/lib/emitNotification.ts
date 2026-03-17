import { getSupabase } from "./supabase";
import type { NotificationType, NotificationMetadata } from "../notifications";

const typeMap: Record<"success" | "failed" | "cancelled" | "rejected" | "awaiting_review", NotificationType> = {
  success: "pipeline_succeeded",
  failed: "pipeline_failed",
  cancelled: "pipeline_stopped",
  rejected: "pipeline_failed",
  awaiting_review: "human_interaction_needed",
};

const titleMap: Record<"success" | "failed" | "cancelled" | "rejected" | "awaiting_review", string> = {
  success: "Pipeline succeeded",
  failed: "Pipeline failed",
  cancelled: "Pipeline cancelled",
  rejected: "Pipeline rejected",
  awaiting_review: "Review needed",
};

export async function emitPipelineNotification(
  status: "success" | "failed" | "cancelled" | "rejected" | "awaiting_review",
  opts: {
    runId: string;
    projectId: string;
    projectName?: string;
    specTitle: string;
    pipelineType: "feature" | "design";
    link?: string;
    body?: string;
  },
) {
  const notifType = typeMap[status];
  const title = `${titleMap[status]}: ${opts.specTitle}`;

  const link = opts.link ?? (
    opts.pipelineType === "feature"
      ? `/pipelines/${opts.runId}`
      : `/design-pipelines/${opts.runId}`
  );

  const metadata: NotificationMetadata = {
    runId: opts.runId,
    pipelineType: opts.pipelineType,
    specificationTitle: opts.specTitle,
    projectId: opts.projectId,
    projectName: opts.projectName,
  };

  await getSupabase().from("notifications").insert({
    project_id: opts.projectId,
    type: notifType,
    title,
    body: opts.body ?? null,
    link,
    metadata,
  }).then(({ error }) => {
    if (error) console.error("[notifications] Insert failed:", error.message);
  });
}
