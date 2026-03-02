import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";
import { readKnowledgeDocs } from "../../../lib/knowledgeManager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const slug = searchParams.get("slug");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id, path")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const docs = await readKnowledgeDocs(project.path);

  if (slug) {
    const doc = docs.find((d) => d.slug === slug);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    return NextResponse.json(doc);
  }

  // Return all docs with frontmatter (no content for list view)
  return NextResponse.json(
    docs.map((d) => ({
      slug: d.slug,
      frontmatter: d.frontmatter,
    })),
  );
}
