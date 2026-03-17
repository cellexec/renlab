export type NotificationType =
  | "pipeline_succeeded"
  | "pipeline_failed"
  | "pipeline_stopped"
  | "human_interaction_needed";

export interface NotificationMetadata {
  runId?: string;
  pipelineType?: "feature" | "design";
  specificationTitle?: string;
  projectId?: string;
  projectName?: string;
}

export interface Notification {
  id: string;
  userId: string | null;
  projectId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  metadata: Partial<NotificationMetadata>;
}
