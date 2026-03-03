export type SpecificationStatus = "draft" | "pipeline" | "failed" | "cancelled" | "done";
export type SpecificationType = "feature" | "ui-refactor";

export interface Specification {
  id: string;
  projectId: string | null;
  title: string;
  status: SpecificationStatus;
  type: SpecificationType;
  createdAt: string;
  updatedAt: string;
}

export interface SpecificationVersion {
  id: string;
  specificationId: string;
  content: string;
  versionNumber: number;
  changeNote: string | null;
  createdAt: string;
}
