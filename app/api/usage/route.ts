import { getUsage } from "claude-agent-sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getUsage();
  if (!stats) {
    return NextResponse.json(null, { status: 200 });
  }
  return NextResponse.json(stats);
}
