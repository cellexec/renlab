export type KnowledgeCategory = "architecture" | "component" | "decision" | "pattern" | "api";

export interface KnowledgeUpdate {
  id: string;
  projectId: string;
  pipelineRunId: string | null;
  type: "bootstrap" | "pipeline" | "manual";
  docsCreated: number;
  docsUpdated: number;
  commitSha: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface KnowledgeFrontmatter {
  title: string;
  description: string;
  category: KnowledgeCategory;
  filePaths?: string[];
  tags?: string[];
  confidence?: number;
  lastUpdated?: string;
  relatedSpecs?: string[];
  pipelineRunId?: string;
}
