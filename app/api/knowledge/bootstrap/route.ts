import { NextResponse } from "next/server";
import { stream } from "node-claude-sdk";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { getSupabase } from "../../../lib/supabase";
import { scaffoldKnowledge, hasKnowledgeBase } from "../../../lib/knowledgeManager";

const exec = promisify(execCb);

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BOOTSTRAP_PROMPT = `You are a knowledge base initialization agent. Scan this codebase and generate
comprehensive documentation as MDX files in the ./knowledge/ directory.

The knowledge/ directory already exists with template files. Your job is to READ the codebase
thoroughly and REPLACE the template content with real, accurate documentation.

Create/update these files:
1. knowledge/architecture/overview.mdx — System overview, major subsystems, how they connect
2. knowledge/architecture/directory-map.mdx — Every directory, what it contains, naming conventions
3. knowledge/architecture/patterns.mdx — Recurring code patterns, conventions, state management
4. knowledge/architecture/tech-decisions.mdx — Technology choices and rationale
5. knowledge/components/*.mdx — One doc per significant module/component (create new files as needed)

MDX frontmatter format (YAML between --- delimiters):
---
title: "Document Title"
description: "Brief description"
category: architecture | component | decision | pattern | api
filePaths: [relevant/file/paths]
tags: [tag1, tag2]
confidence: 70
lastUpdated: "ISO date string"
relatedSpecs: []
---

When creating component docs, also update knowledge/components/meta.json with:
{ "title": "Components", "pages": ["component-name-1", "component-name-2"] }

Rules:
- Be concise: 30-80 lines per doc
- Focus on WHAT and WHY, not HOW (line-by-line explanations)
- Set confidence: 70 for all bootstrap docs
- Use the actual code you read to write accurate docs
- Do NOT include the knowledge/ directory itself in the documentation`;

export async function POST(req: Request) {
  const { projectId } = await req.json();
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

  const projectPath = project.path;

  // Ensure scaffold exists
  if (!(await hasKnowledgeBase(projectPath))) {
    await scaffoldKnowledge(projectPath);
  }

  // Stream SSE progress to the client
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "status", message: "Starting bootstrap agent..." });

        const agentStream = stream(BOOTSTRAP_PROMPT, {
          model: "sonnet",
          cwd: projectPath,
          allowedTools: ["Read", "Glob", "Grep", "Write", "Edit"],
          permissionMode: "bypassPermissions",
          timeoutMs: 0,
        });

        let toolCount = 0;
        for await (const msg of agentStream) {
          if (msg.type === "stream_event") {
            const { event } = msg;
            if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
              toolCount++;
              send({ type: "tool", name: event.content_block.name, count: toolCount });
            } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              send({ type: "text", text: event.delta.text });
            }
          }
        }

        send({ type: "status", message: "Committing knowledge docs..." });

        // Git add and commit
        await exec("git add knowledge/", { cwd: projectPath });
        const { stdout: diffCheck } = await exec("git diff --cached --quiet -- knowledge/ || echo changed", { cwd: projectPath });

        let commitSha: string | null = null;
        if (diffCheck.trim() === "changed") {
          await exec('git commit -m "Knowledge: bootstrap docs"', { cwd: projectPath });
          const { stdout: sha } = await exec("git rev-parse HEAD", { cwd: projectPath });
          commitSha = sha.trim();
        }

        // Update project
        await supabase
          .from("projects")
          .update({ has_knowledge: true })
          .eq("id", projectId);

        // Insert knowledge_updates row
        await supabase.from("knowledge_updates").insert({
          project_id: projectId,
          type: "bootstrap",
          docs_created: toolCount,
          docs_updated: 0,
          commit_sha: commitSha,
        });

        send({ type: "done", commitSha });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });

        // Record failed attempt
        await supabase.from("knowledge_updates").insert({
          project_id: projectId,
          type: "bootstrap",
          docs_created: 0,
          docs_updated: 0,
          error_message: message,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
