export interface ParsedDesignSpec {
  targetPath: string;
  variantCount: number;
  variantBriefs: string[];
  designGoals: string[];
}

/**
 * Parse a ui-refactor spec to extract structured fields.
 * Looks for markdown sections: ## Target Path, ## Variant Count, ## Variant Briefs, ## Design Goals
 */
export function parseDesignSpec(content: string): ParsedDesignSpec {
  const result: ParsedDesignSpec = {
    targetPath: "",
    variantCount: 2,
    variantBriefs: [],
    designGoals: [],
  };

  const sections = content.split(/^##\s+/m);

  for (const section of sections) {
    const lines = section.trim().split("\n");
    const heading = lines[0]?.toLowerCase().trim() ?? "";
    const body = lines.slice(1).join("\n").trim();

    if (heading.startsWith("target path")) {
      // Extract the first non-empty line or inline code block
      const match = body.match(/`([^`]+)`/) || body.match(/^\s*(.+)/m);
      if (match) result.targetPath = match[1].trim();
    } else if (heading.startsWith("variant count")) {
      const num = parseInt(body.match(/\d+/)?.[0] ?? "2", 10);
      if (num >= 1 && num <= 10) result.variantCount = num;
    } else if (heading.startsWith("variant briefs") || heading.startsWith("variant brief")) {
      // Parse bullet list items
      const bullets = body.match(/^[-*]\s+(.+)/gm);
      if (bullets) {
        result.variantBriefs = bullets.map((b) => b.replace(/^[-*]\s+/, "").trim());
      }
    } else if (heading.startsWith("design goals") || heading.startsWith("design goal")) {
      const bullets = body.match(/^[-*]\s+(.+)/gm);
      if (bullets) {
        result.designGoals = bullets.map((b) => b.replace(/^[-*]\s+/, "").trim());
      }
    }
  }

  return result;
}
