import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { homedir } from "os";
import path from "path";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("path") || homedir();
  const current = path.resolve(raw);
  const parent = path.dirname(current);

  try {
    const entries = await readdir(current, { withFileTypes: true });
    const subDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Check each subdirectory for files (non-blocking, parallel)
    const dirs = await Promise.all(
      subDirs.map(async (e) => {
        const dirPath = path.join(current, e.name);
        let hasFiles = false;
        try {
          const children = await readdir(dirPath, { withFileTypes: true });
          hasFiles = children.some((c) => c.isFile());
        } catch {
          // unreadable — treat as empty
        }
        return { name: e.name, path: dirPath, hasFiles };
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
