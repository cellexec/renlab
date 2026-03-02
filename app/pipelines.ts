export type PipelineStatus =
  | "pending"
  | "worktree"
  | "retrieving"
  | "coding"
  | "reviewing"
  | "merging"
  | "updating"
  | "success"
  | "failed"
  | "cancelled"
  | "rejected";

export type PipelineStep = "worktree" | "retrieving" | "coding" | "reviewing" | "merging" | "updating";

export interface PipelineRun {
  id: string;
  projectId: string;
  specificationId: string;
  specVersionId: string;
  status: PipelineStatus;
  currentStep: PipelineStep | null;
  worktreeBranch: string | null;
  worktreePath: string | null;
  reviewScore: number | null;
  reviewThreshold: number;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** Total iterations executed so far (1-indexed) */
  iterations: number;
  /** Max retries configured at pipeline start */
  maxRetries: number;
  /** Whether knowledge base was available during this run */
  hasKnowledge: boolean;
}

export interface PipelineLogEntry {
  timestamp: number;
  step: PipelineStep;
  stream: "stdout" | "stderr";
  text: string;
  /** Tool lifecycle tracking: "tool-N-start" or "tool-N-end" */
  toolCallId?: string;
  /** Retry iteration (1-indexed, default 1) */
  iteration?: number;
}

export type StepTimings = Record<string, { startedAt: number; endedAt: number | null }>;

export type PipelineSSEEvent =
  | { type: "buffer"; entries: PipelineLogEntry[] }
  | { type: "log"; entry: PipelineLogEntry }
  | { type: "status"; status: PipelineStatus; currentStep: PipelineStep | null; reviewScore: number | null; stepTimings: StepTimings; iteration: number; maxRetries: number };
