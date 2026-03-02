import { readdir, readFile, stat, mkdir, writeFile } from "fs/promises";
import path from "path";
import type { KnowledgeFrontmatter } from "../knowledge";

// ---------------------------------------------------------------------------
// Frontmatter parser (no external dep — splits on `---` delimiters)
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const yamlBlock = match[1];
  const content = match[2];
  const data: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if (typeof value === "string" && /^["'].*["']$/.test(value)) {
      value = (value as string).slice(1, -1);
    }
    // Parse arrays: [a, b, c]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    // Parse numbers
    if (typeof value === "string" && /^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    // Parse booleans
    if (value === "true") value = true;
    if (value === "false") value = false;

    data[key] = value;
  }

  return { data, content };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function hasKnowledgeBase(projectPath: string): Promise<boolean> {
  try {
    const s = await stat(path.join(projectPath, "knowledge"));
    return s.isDirectory();
  } catch {
    return false;
  }
}

export interface KnowledgeDoc {
  slug: string;
  frontmatter: KnowledgeFrontmatter;
  content: string;
}

export async function readKnowledgeDocs(projectPath: string): Promise<KnowledgeDoc[]> {
  const knowledgeDir = path.join(projectPath, "knowledge");
  const docs: KnowledgeDoc[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".mdx")) {
        const raw = await readFile(fullPath, "utf-8");
        const { data, content } = parseFrontmatter(raw);
        const slug = path.relative(knowledgeDir, fullPath).replace(/\.mdx$/, "");
        docs.push({
          slug,
          frontmatter: data as unknown as KnowledgeFrontmatter,
          content,
        });
      }
    }
  }

  await walk(knowledgeDir);
  return docs;
}

export async function getRelevantKnowledge(
  projectPath: string,
  specContent: string,
  maxDocs = 5,
): Promise<string> {
  const docs = await readKnowledgeDocs(projectPath);
  if (docs.length === 0) return "";

  // Simple keyword/path matching — extract words from spec
  const specWords = new Set(
    specContent
      .toLowerCase()
      .replace(/[^a-z0-9/._-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

  // Score each doc by keyword overlap
  const scored = docs.map((doc) => {
    let score = 0;
    const docText = `${doc.frontmatter.title} ${doc.frontmatter.description ?? ""} ${(doc.frontmatter.tags ?? []).join(" ")} ${(doc.frontmatter.filePaths ?? []).join(" ")} ${doc.content}`.toLowerCase();

    for (const word of specWords) {
      if (docText.includes(word)) score++;
    }

    // Boost architecture overview (always relevant)
    if (doc.slug === "architecture/overview") score += 20;
    // Boost by confidence
    if (doc.frontmatter.confidence) score += doc.frontmatter.confidence / 100;

    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, maxDocs).filter((s) => s.score > 0);
  if (selected.length === 0) return "";

  const sections = selected.map(
    ({ doc }) =>
      `## ${doc.frontmatter.title} (category: ${doc.frontmatter.category})\n${doc.content.trim()}`,
  );

  return `<knowledge-context>\n${sections.join("\n\n")}\n</knowledge-context>`;
}

export async function getArchitectureOverview(projectPath: string): Promise<string> {
  const overviewPath = path.join(projectPath, "knowledge", "architecture", "overview.mdx");
  try {
    const raw = await readFile(overviewPath, "utf-8");
    const { content } = parseFrontmatter(raw);
    return content.trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Scaffold — creates empty knowledge directory structure with template files
// ---------------------------------------------------------------------------

const OVERVIEW_TEMPLATE = `---
title: "System Architecture Overview"
description: "High-level overview of system architecture"
category: architecture
filePaths: []
tags: [architecture, overview]
confidence: 50
lastUpdated: "${new Date().toISOString()}"
relatedSpecs: []
---

# System Architecture Overview

*This document will be populated by the knowledge bootstrap agent.*
`;

const DIR_MAP_TEMPLATE = `---
title: "Directory Map"
description: "Directory structure and file purposes"
category: architecture
filePaths: []
tags: [architecture, directory, structure]
confidence: 50
lastUpdated: "${new Date().toISOString()}"
relatedSpecs: []
---

# Directory Map

*This document will be populated by the knowledge bootstrap agent.*
`;

const PATTERNS_TEMPLATE = `---
title: "Code Patterns & Conventions"
description: "Recurring code patterns and conventions"
category: pattern
filePaths: []
tags: [patterns, conventions]
confidence: 50
lastUpdated: "${new Date().toISOString()}"
relatedSpecs: []
---

# Code Patterns & Conventions

*This document will be populated by the knowledge bootstrap agent.*
`;

const TECH_DECISIONS_TEMPLATE = `---
title: "Technology Decisions"
description: "Technology choices and rationale"
category: decision
filePaths: []
tags: [decisions, technology]
confidence: 50
lastUpdated: "${new Date().toISOString()}"
relatedSpecs: []
---

# Technology Decisions

*This document will be populated by the knowledge bootstrap agent.*
`;

export async function scaffoldKnowledge(projectPath: string): Promise<void> {
  const base = path.join(projectPath, "knowledge");

  // Create directories
  await mkdir(path.join(base, "architecture"), { recursive: true });
  await mkdir(path.join(base, "components"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });

  // Root meta.json
  await writeFile(
    path.join(base, "meta.json"),
    JSON.stringify(
      { pages: ["---Architecture---", "architecture", "---Components---", "components", "---Decisions---", "decisions"] },
      null,
      2,
    ) + "\n",
  );

  // Architecture meta.json
  await writeFile(
    path.join(base, "architecture", "meta.json"),
    JSON.stringify(
      { title: "Architecture", pages: ["overview", "directory-map", "patterns", "tech-decisions"] },
      null,
      2,
    ) + "\n",
  );

  // Components meta.json
  await writeFile(
    path.join(base, "components", "meta.json"),
    JSON.stringify({ title: "Components" }, null, 2) + "\n",
  );

  // Decisions meta.json
  await writeFile(
    path.join(base, "decisions", "meta.json"),
    JSON.stringify({ title: "Decisions" }, null, 2) + "\n",
  );

  // Template MDX files
  await writeFile(path.join(base, "architecture", "overview.mdx"), OVERVIEW_TEMPLATE);
  await writeFile(path.join(base, "architecture", "directory-map.mdx"), DIR_MAP_TEMPLATE);
  await writeFile(path.join(base, "architecture", "patterns.mdx"), PATTERNS_TEMPLATE);
  await writeFile(path.join(base, "architecture", "tech-decisions.mdx"), TECH_DECISIONS_TEMPLATE);
}
