import { NextRequest, NextResponse } from "next/server";
import { readdir, stat, access } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

const CONVENTIONAL_DIRS = ["apps", "packages", "services", "libs"];

export async function POST(req: NextRequest) {
  let body: { repoPath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoPath = body.repoPath;
  if (!repoPath || typeof repoPath !== "string") {
    return NextResponse.json({ error: "repoPath is required" }, { status: 400 });
  }

  const resolved = path.resolve(repoPath);

  // Verify directory exists
  try {
    const s = await stat(resolved);
    if (!s.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Directory not found" }, { status: 400 });
  }

  // Verify it's a git repo with at least one commit
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: resolved });
    await execFileAsync("git", ["log", "--oneline", "-1"], { cwd: resolved });
  } catch {
    return NextResponse.json(
      { error: "Not a git repository or has no commits" },
      { status: 400 }
    );
  }

  const repoName = path.basename(resolved);

  // Scan conventional directories for sub-apps
  const apps: { name: string; path: string; hasPackageJson: boolean }[] = [];

  for (const dir of CONVENTIONAL_DIRS) {
    const dirPath = path.join(resolved, dir);
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const subDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));

      for (const sub of subDirs) {
        const appPath = path.join(dirPath, sub.name);
        let hasPackageJson = false;
        try {
          await access(path.join(appPath, "package.json"));
          hasPackageJson = true;
        } catch {
          // no package.json
        }
        apps.push({ name: sub.name, path: appPath, hasPackageJson });
      }
    } catch {
      // directory doesn't exist — skip
    }
  }

  return NextResponse.json({ repoName, repoPath: resolved, apps });
}
