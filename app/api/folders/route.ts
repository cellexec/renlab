import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { homedir } from "os";
import path from "path";

const MONOREPO_DIRS = ["apps", "packages", "services", "libs"];

export async function GET(req: NextRequest) {
  let raw = req.nextUrl.searchParams.get("path") || homedir();
  if (raw === "~" || raw.startsWith("~/")) raw = path.join(homedir(), raw.slice(1));
  const current = path.resolve(raw);
  const parent = path.dirname(current);

  try {
    const entries = await readdir(current, { withFileTypes: true });
    const subDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Check each subdirectory for files and monorepo markers (parallel)
    const dirs = await Promise.all(
      subDirs.map(async (e) => {
        const dirPath = path.join(current, e.name);
        let hasFiles = false;
        let isMonorepo = false;
        try {
          const children = await readdir(dirPath, { withFileTypes: true });
          hasFiles = children.some((c) => c.isFile());
          const childNames = new Set(children.filter((c) => c.isDirectory()).map((c) => c.name));
          isMonorepo = MONOREPO_DIRS.some((d) => childNames.has(d));
        } catch {
          // unreadable — treat as empty
        }
        return { name: e.name, path: dirPath, hasFiles, isMonorepo };
      })
    );

    const hasFiles = entries.some((e) => e.isFile());

    return NextResponse.json({ current, parent, dirs, hasFiles });
  } catch {
    return NextResponse.json(
      { error: "Cannot read directory" },
      { status: 400 }
    );
  }
}
