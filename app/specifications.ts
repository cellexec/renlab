export type SpecificationStatus = "draft" | "pipeline" | "failed" | "cancelled" | "done";

export interface Specification {
  id: string;
  projectId: string | null;
  title: string;
  status: SpecificationStatus;
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
