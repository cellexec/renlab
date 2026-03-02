import { NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase";
import { hasKnowledgeBase, readKnowledgeDocs } from "../../lib/knowledgeManager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id, path, has_knowledge")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const exists = await hasKnowledgeBase(project.path);
  const docs = exists ? await readKnowledgeDocs(project.path) : [];

  const { data: updates } = await supabase
    .from("knowledge_updates")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  const lastUpdate = updates?.[0] ?? null;

  return NextResponse.json({
    exists,
    docCount: docs.length,
    lastUpdate,
    updates: updates ?? [],
  });
}
