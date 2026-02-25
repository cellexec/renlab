export interface ParsedSpecContent {
  segments: Array<{ type: "text"; content: string } | { type: "spec"; content: string }>;
}

/**
 * Parses assistant messages for ````spec fenced blocks (4+ backticks).
 * Falls back to 3-backtick ```spec blocks for backwards compatibility.
 * Using 4+ backticks allows the spec content to contain regular ``` code blocks.
 */
export function parseSpecBlocks(text: string): ParsedSpecContent {
  const segments: ParsedSpecContent["segments"] = [];
  // Match 4+ backtick fences first, then fall back to 3-backtick fences
  const regex = /(`{4,})(?:spec|markdown)\s*\n([\s\S]*?)\1|```(?:spec|markdown)\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this spec block
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }
    // The spec block content (group 2 for 4+ backticks, group 3 for 3 backticks)
    const specContent = (match[2] ?? match[3]).trim();
    segments.push({ type: "spec", content: specContent });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last spec block
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) segments.push({ type: "text", content: remaining });
  }

  // If no spec blocks found, return entire text as single segment
  if (segments.length === 0 && text.trim()) {
    segments.push({ type: "text", content: text });
  }

  return { segments };
}

export function hasSpecBlocks(text: string): boolean {
  return /(`{4,})(?:spec|markdown)\s*\n[\s\S]*?\1/.test(text) ||
    /```(?:spec|markdown)\s*\n[\s\S]*?```/.test(text);
}
