import { NextRequest, NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const { parentPath, name } = (await req.json()) as {
    parentPath: string;
    name: string;
  };

  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const target = path.join(path.resolve(parentPath), name);

  try {
    await mkdir(target, { recursive: true });
    return NextResponse.json({ path: target });
  } catch {
    return NextResponse.json(
      { error: "Failed to create directory" },
      { status: 500 }
    );
  }
}
