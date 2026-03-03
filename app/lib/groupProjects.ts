import type { Project } from "../projects";

export interface ProjectGroup {
  /** null for standalone projects */
  repoPath: string | null;
  /** Display label: basename of repoPath, or "Projects" for standalone */
  label: string;
  projects: Project[];
}

/** Group projects by repoPath. Standalone projects (repoPath === null) are grouped last. */
export function groupProjects(projects: Project[]): ProjectGroup[] {
  const repoMap = new Map<string, Project[]>();
  const standalone: Project[] = [];

  for (const p of projects) {
    if (p.repoPath) {
      const list = repoMap.get(p.repoPath);
      if (list) list.push(p);
      else repoMap.set(p.repoPath, [p]);
    } else {
      standalone.push(p);
    }
  }

  const groups: ProjectGroup[] = [];

  for (const [repoPath, projs] of repoMap) {
    const lastSlash = repoPath.lastIndexOf("/");
    const label = lastSlash >= 0 ? repoPath.slice(lastSlash + 1) : repoPath;
    groups.push({ repoPath, label, projects: projs });
  }

  // Sort repo groups alphabetically by label
  groups.sort((a, b) => a.label.localeCompare(b.label));

  if (standalone.length > 0) {
    groups.push({ repoPath: null, label: "Projects", projects: standalone });
  }

  return groups;
}
