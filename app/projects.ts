export type Stack = "nextjs" | "nextjs-supabase" | "nextjs-supabase-auth";

export interface Project {
  id: string;
  title: string;
  description: string;
  path: string;
  stack: Stack;
  /** Review score threshold for pipeline auto-merge (default: 80) */
  pipelineThreshold: number;
  /** Number of times the coder agent can retry after a review rejection (default: 2) */
  maxRetries: number;
}

/** Fields required when creating a new project (pipelineThreshold and maxRetries have DB defaults) */
export type NewProject = Omit<Project, "id" | "pipelineThreshold" | "maxRetries"> & { pipelineThreshold?: number; maxRetries?: number };
