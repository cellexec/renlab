export type DesignPipelineStatus =
  | "pending"
  | "parent_worktree"
  | "generating"
  | "merging_variants"
  | "installing"
  | "dev_server"
  | "awaiting_review"
  | "finalizing"
  | "merging_final"
  | "success"
  | "failed"
  | "cancelled";

export type DesignPipelineStep =
  | "parent_worktree"
  | "generating"
  | "merging_variants"
  | "installing"
  | "dev_server"
  | "awaiting_review"
  | "finalizing"
  | "merging_final";

export interface DesignRun {
  id: string;
  projectId: string;
  specificationId: string;
  specVersionId: string;
  status: DesignPipelineStatus;
  currentStep: DesignPipelineStep | null;
  parentBranch: string | null;
  parentWorktreePath: string | null;
  devServerPort: number | null;
  variantCount: number;
  targetPath: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export type DesignVariantStatus = "pending" | "generating" | "merging" | "merged" | "failed";

export interface DesignVariant {
  id: string;
  designRunId: string;
  variantNumber: number;
  status: DesignVariantStatus;
  branchName: string | null;
  worktreePath: string | null;
  brief: string | null;
  agentId: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DesignPipelineLogEntry {
  timestamp: number;
  step: DesignPipelineStep;
  stream: "stdout" | "stderr";
  text: string;
  toolCallId?: string;
  variantNumber?: number;
}

export type DesignStepTimings = Record<string, { startedAt: number; endedAt: number | null }>;

export type DesignPipelineSSEEvent =
  | { type: "buffer"; entries: DesignPipelineLogEntry[] }
  | { type: "log"; entry: DesignPipelineLogEntry }
  | { type: "status"; status: DesignPipelineStatus; currentStep: DesignPipelineStep | null; stepTimings: DesignStepTimings; devServerPort: number | null; variants: { variantNumber: number; status: DesignVariantStatus }[] }
  | { type: "variant_status"; variantNumber: number; status: DesignVariantStatus };
