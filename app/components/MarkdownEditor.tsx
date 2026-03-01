"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  viewOnly?: boolean;
}

type Mode = "write" | "preview" | "split";

// ---------------------------------------------------------------------------
// Heading extraction for document outline
// ---------------------------------------------------------------------------

interface HeadingEntry {
  level: number;
  text: string;
  line: number;
  id: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function extractHeadings(markdown: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const slugCounts = new Map<string, number>();
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const text = match[2].replace(/[*_`~\[\]]/g, "");
      let slug = slugify(text);
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      headings.push({
        level: match[1].length,
        text,
        line: i,
        id: slug,
      });
    }
  }
  return headings;
}

// ---------------------------------------------------------------------------
// Helpers: find the current line boundaries around the cursor
// ---------------------------------------------------------------------------

function getSelectedLinesRange(
  value: string,
  selStart: number,
  selEnd: number
): { lineStart: number; lineEnd: number } {
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selEnd);
  if (lineEnd === -1) lineEnd = value.length;
  return { lineStart, lineEnd };
}

// ---------------------------------------------------------------------------
// Wrap toggle (Bold / Italic / Strikethrough / Inline code)
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,6})\s/;
const LIST_PREFIXES = ["- [ ] ", "- [x] ", "- ", "1. "];

function wrapToggle(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  delim: string
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const dLen = delim.length;

  if (start !== end) {
    const selected = value.slice(start, end);

    if (
      selected.startsWith(delim) &&
      selected.endsWith(delim) &&
      selected.length >= dLen * 2
    ) {
      const unwrapped = selected.slice(dLen, -dLen);
      const text = value.slice(0, start) + unwrapped + value.slice(end);
      onChange(text);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + unwrapped.length);
      });
      return;
    }

    if (
      start >= dLen &&
      end + dLen <= value.length &&
      value.slice(start - dLen, start) === delim &&
      value.slice(end, end + dLen) === delim
    ) {
      const text =
        value.slice(0, start - dLen) +
        value.slice(start, end) +
        value.slice(end + dLen);
      onChange(text);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start - dLen, end - dLen);
      });
      return;
    }

    const text =
      value.slice(0, start) + delim + selected + delim + value.slice(end);
    onChange(text);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + dLen, end + dLen);
    });
    return;
  }

  const before = value.slice(0, start);
  const after = value.slice(start);
  const lastOpen = before.lastIndexOf(delim);
  const nextClose = after.indexOf(delim);

  if (lastOpen !== -1 && nextClose !== -1) {
    const betweenOpen = value.slice(lastOpen + dLen, start);
    const betweenClose = value.slice(start, start + nextClose);
    if (!betweenOpen.includes("\n") && !betweenClose.includes("\n")) {
      const inner = value.slice(lastOpen + dLen, start + nextClose);
      const text =
        value.slice(0, lastOpen) + inner + value.slice(start + nextClose + dLen);
      onChange(text);
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start - dLen;
        textarea.setSelectionRange(newPos, newPos);
      });
      return;
    }
  }

  const placeholder = "text";
  const text =
    value.slice(0, start) + delim + placeholder + delim + value.slice(start);
  onChange(text);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + dLen, start + dLen + placeholder.length);
  });
}

// ---------------------------------------------------------------------------
// Line-level toggle (Headings, Lists, Blockquote)
// ---------------------------------------------------------------------------

function lineToggle(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const { lineStart, lineEnd } = getSelectedLinesRange(value, start, end);
  const selectedBlock = value.slice(lineStart, lineEnd);
  const lines = selectedBlock.split("\n");
  const isHeading = /^#{1,3}\s/.test(prefix);

  const transformed = lines.map((line) => {
    if (isHeading) return toggleHeading(line, prefix);
    return toggleLinePrefix(line, prefix);
  });

  const result = transformed.join("\n");
  const text = value.slice(0, lineStart) + result + value.slice(lineEnd);
  onChange(text);

  const newEnd = lineStart + result.length;
  requestAnimationFrame(() => {
    textarea.focus();
    if (lines.length === 1) {
      textarea.setSelectionRange(newEnd, newEnd);
    } else {
      textarea.setSelectionRange(lineStart, newEnd);
    }
  });
}

function toggleHeading(line: string, prefix: string): string {
  const match = line.match(HEADING_RE);
  if (match) {
    const existingPrefix = match[0];
    if (existingPrefix === prefix) return line.slice(existingPrefix.length);
    return prefix + line.slice(existingPrefix.length);
  }
  return prefix + line;
}

function toggleLinePrefix(line: string, prefix: string): string {
  if (line.startsWith(prefix)) return line.slice(prefix.length);
  for (const lp of LIST_PREFIXES) {
    if (line.startsWith(lp) && lp !== prefix) return prefix + line.slice(lp.length);
  }
  if (line.startsWith("> ") && prefix !== "> ") return prefix + line.slice(2);
  if (!line.startsWith("> ") && prefix === "> ") {
    for (const lp of LIST_PREFIXES) {
      if (line.startsWith(lp)) return prefix + line.slice(lp.length);
    }
  }
  return prefix + line;
}

// ---------------------------------------------------------------------------
// Non-toggling actions
// ---------------------------------------------------------------------------

function applyFormat(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  action: (
    selected: string,
    before: string,
    after: string
  ) => { text: string; selStart: number; selEnd: number }
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const result = action(selected, before, after);
  onChange(result.text);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(result.selStart, result.selEnd);
  });
}

function linkAction(selected: string, before: string, after: string) {
  const label = selected || "link text";
  const insertion = `[${label}](url)`;
  const text = before + insertion + after;
  const urlStart = before.length + label.length + 3;
  return { text, selStart: urlStart, selEnd: urlStart + 3 };
}

function imageAction(selected: string, before: string, after: string) {
  const alt = selected || "alt text";
  const insertion = `![${alt}](url)`;
  const text = before + insertion + after;
  const urlStart = before.length + alt.length + 4;
  return { text, selStart: urlStart, selEnd: urlStart + 3 };
}

function codeBlockAction(selected: string, before: string, after: string) {
  const content = selected || "code";
  const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
  const needsNewlineAfter = after.length > 0 && !after.startsWith("\n");
  const pre = (needsNewlineBefore ? "\n" : "") + "```\n";
  const post = "\n```" + (needsNewlineAfter ? "\n" : "");
  const text = before + pre + content + post + after;
  const selStart = before.length + pre.length;
  return { text, selStart, selEnd: selStart + content.length };
}

function tableAction(_selected: string, before: string, after: string) {
  const needsNewline = before.length > 0 && !before.endsWith("\n");
  const table =
    (needsNewline ? "\n" : "") +
    "| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n";
  const text = before + table + after;
  const selStart = before.length + (needsNewline ? 1 : 0) + 2;
  return { text, selStart, selEnd: selStart + 6 };
}

function hrAction(_selected: string, before: string, after: string) {
  const needsNewline = before.length > 0 && !before.endsWith("\n");
  const insertion = (needsNewline ? "\n" : "") + "---\n";
  const text = before + insertion + after;
  const pos = before.length + insertion.length;
  return { text, selStart: pos, selEnd: pos };
}

// ---------------------------------------------------------------------------
// Toolbar definition
// ---------------------------------------------------------------------------

interface ToolbarButton {
  label: string;
  title: string;
  icon: React.ReactNode;
  type: "wrap" | "line" | "action";
  delim?: string;
  prefix?: string;
  action?: (
    selected: string,
    before: string,
    after: string
  ) => { text: string; selStart: number; selEnd: number };
  shortcut?: string;
}

// Group definitions for the toolbar ribbon
const TOOLBAR_GROUPS: { label: string; items: (ToolbarButton | "sep")[] }[] = [
  {
    label: "Inline",
    items: [
      {
        label: "bold",
        title: "Bold",
        icon: <span className="font-bold text-[11px]">B</span>,
        type: "wrap",
        delim: "**",
        shortcut: "Ctrl+B",
      },
      {
        label: "italic",
        title: "Italic",
        icon: <span className="italic text-[11px] font-serif">I</span>,
        type: "wrap",
        delim: "*",
        shortcut: "Ctrl+I",
      },
      {
        label: "strikethrough",
        title: "Strikethrough",
        icon: <span className="line-through text-[11px]">S</span>,
        type: "wrap",
        delim: "~~",
      },
      {
        label: "code",
        title: "Inline code",
        icon: (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
        ),
        type: "wrap",
        delim: "`",
      },
    ],
  },
  {
    label: "Headings",
    items: [
      {
        label: "h1",
        title: "Heading 1",
        icon: <span className="text-[10px] font-bold tracking-tight">H1</span>,
        type: "line",
        prefix: "# ",
      },
      {
        label: "h2",
        title: "Heading 2",
        icon: <span className="text-[10px] font-bold tracking-tight">H2</span>,
        type: "line",
        prefix: "## ",
      },
      {
        label: "h3",
        title: "Heading 3",
        icon: <span className="text-[10px] font-bold tracking-tight">H3</span>,
        type: "line",
        prefix: "### ",
      },
    ],
  },
  {
    label: "Lists",
    items: [
      {
        label: "ul",
        title: "Bullet list",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        ),
        type: "line",
        prefix: "- ",
      },
      {
        label: "ol",
        title: "Numbered list",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.242 5.992h12m-12 6.003h12m-12 5.999h12M4.117 7.495v-3.75H2.99m1.125 3.75H2.99m1.125 0H5.24m-1.92 2.577a1.125 1.125 0 111.591 1.59l-1.83 1.83h2.16" />
          </svg>
        ),
        type: "line",
        prefix: "1. ",
      },
      {
        label: "checklist",
        title: "Checklist",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        type: "line",
        prefix: "- [ ] ",
      },
    ],
  },
  {
    label: "Blocks",
    items: [
      {
        label: "blockquote",
        title: "Blockquote",
        icon: (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
          </svg>
        ),
        type: "line",
        prefix: "> ",
      },
      {
        label: "codeblock",
        title: "Code block",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
          </svg>
        ),
        type: "action",
        action: codeBlockAction,
      },
    ],
  },
  {
    label: "Insert",
    items: [
      {
        label: "link",
        title: "Link",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.81" />
          </svg>
        ),
        type: "action",
        action: linkAction,
      },
      {
        label: "image",
        title: "Image",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        ),
        type: "action",
        action: imageAction,
      },
      {
        label: "table",
        title: "Table",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
          </svg>
        ),
        type: "action",
        action: tableAction,
      },
      {
        label: "hr",
        title: "Horizontal rule",
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5" />
          </svg>
        ),
        type: "action",
        action: hrAction,
      },
    ],
  },
];

// Flatten for keyboard shortcut lookup
const ALL_BUTTONS: ToolbarButton[] = TOOLBAR_GROUPS.flatMap((g) =>
  g.items.filter((i): i is ToolbarButton => i !== "sep")
);

// ---------------------------------------------------------------------------
// Word count helper
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Prose styling classes (shared between preview + viewOnly)
// ---------------------------------------------------------------------------

const PROSE_CLASSES = [
  "prose prose-invert prose-base max-w-none",
  // Headings
  "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-violet-50",
  "prose-h1:text-2xl prose-h1:pb-2 prose-h1:border-b prose-h1:border-violet-500/20 prose-h1:mb-4",
  "prose-h2:text-xl prose-h2:pb-1.5 prose-h2:border-b prose-h2:border-violet-500/10 prose-h2:mb-3",
  "prose-h3:text-lg",
  // Code blocks
  "prose-pre:bg-zinc-950/60 prose-pre:rounded-lg prose-pre:border prose-pre:border-violet-500/10",
  "[&_pre_code]:font-[JetBrainsMono_Nerd_Font,JetBrains_Mono,Fira_Code,monospace] [&_pre_code]:text-sm",
  // Inline code
  "prose-code:bg-violet-500/10 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-violet-300 prose-code:before:content-none prose-code:after:content-none prose-code:font-normal prose-code:text-sm prose-code:font-[JetBrainsMono_Nerd_Font,JetBrains_Mono,Fira_Code,monospace]",
  // Blockquotes
  "prose-blockquote:border-l-violet-500 prose-blockquote:border-l-2 prose-blockquote:bg-violet-950/10 prose-blockquote:rounded-r prose-blockquote:py-0.5 prose-blockquote:text-zinc-300 prose-blockquote:not-italic",
  // Links
  "prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline hover:prose-a:text-violet-300",
  // Tables
  "prose-table:border prose-table:border-zinc-700/50 prose-table:rounded",
  "prose-th:border prose-th:border-zinc-700/50 prose-th:bg-zinc-800/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-zinc-200",
  "prose-td:border prose-td:border-zinc-700/50 prose-td:px-3 prose-td:py-2",
  // HR
  "prose-hr:border-violet-500/20",
  // Strong / em
  "prose-strong:text-zinc-100",
  "prose-em:text-zinc-300",
  // Images
  "prose-img:rounded-lg prose-img:border prose-img:border-zinc-700/50",
  // Paragraphs
  "prose-p:leading-relaxed",
  // Lists
  "prose-li:marker:text-violet-500/60",
].join(" ");

// ---------------------------------------------------------------------------
// Mode switch icons
// ---------------------------------------------------------------------------

function WriteIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v12a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18V6z" />
    </svg>
  );
}

const MODE_CONFIG: { key: Mode; label: string; icon: React.ReactNode }[] = [
  { key: "write", label: "Write", icon: <WriteIcon /> },
  { key: "preview", label: "Preview", icon: <PreviewIcon /> },
  { key: "split", label: "Split", icon: <SplitIcon /> },
];

// ---------------------------------------------------------------------------
// Document Outline sidebar
// ---------------------------------------------------------------------------

function DocumentOutline({
  headings,
  onJumpToLine,
  onJumpToId,
  activeHeadingId,
}: {
  headings: HeadingEntry[];
  onJumpToLine?: (line: number) => void;
  onJumpToId?: (id: string) => void;
  activeHeadingId?: string | null;
}) {
  if (headings.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-xs text-zinc-600 italic text-center leading-relaxed">
          Add headings to your document to see an outline here.
        </p>
      </div>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 py-3 px-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60 mb-2 px-2">
        Outline
      </div>
      {headings.map((h, i) => {
        const isActive = activeHeadingId === h.id;
        return (
          <button
            key={`${h.line}-${i}`}
            type="button"
            onClick={() => {
              if (onJumpToId) onJumpToId(h.id);
              else if (onJumpToLine) onJumpToLine(h.line);
            }}
            className={`group flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-violet-500/10 ${
              isActive ? "bg-violet-500/10" : ""
            }`}
            style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
          >
            <span
              className={`h-1 w-1 shrink-0 rounded-full transition-colors ${
                isActive ? "bg-violet-400" : "bg-violet-500/40 group-hover:bg-violet-400"
              }`}
            />
            <span
              className={`truncate text-xs transition-colors ${
                isActive
                  ? "font-semibold text-violet-300"
                  : h.level === 1
                    ? "font-semibold text-zinc-300 group-hover:text-violet-300"
                    : h.level === 2
                      ? "font-medium text-zinc-400 group-hover:text-violet-300"
                      : "text-zinc-500 group-hover:text-violet-300"
              }`}
            >
              {h.text}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  viewOnly = false,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  const effectiveMode = viewOnly ? "preview" : mode;
  const showEditor = effectiveMode === "write" || effectiveMode === "split";
  const showPreviewToc = effectiveMode === "preview";

  // Extract headings for outline
  const headings = useMemo(() => extractHeadings(value), [value]);
  const words = useMemo(() => wordCount(value), [value]);

  // ReactMarkdown component overrides to add IDs to headings
  const markdownComponents = useMemo(() => {
    const createHeading = (level: number) => {
      const Component = ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => {
        const text = typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.map((c) => (typeof c === "string" ? c : "")).join("")
            : "";
        const heading = headings.find((h) => h.text === text.replace(/[*_`~\[\]]/g, "") && h.level === level);
        const id = heading?.id;
        switch (level) {
          case 1: return <h1 id={id} {...props}>{children}</h1>;
          case 2: return <h2 id={id} {...props}>{children}</h2>;
          case 3: return <h3 id={id} {...props}>{children}</h3>;
          case 4: return <h4 id={id} {...props}>{children}</h4>;
          case 5: return <h5 id={id} {...props}>{children}</h5>;
          default: return <h6 id={id} {...props}>{children}</h6>;
        }
      };
      Component.displayName = `Heading${level}`;
      return Component;
    };
    return {
      h1: createHeading(1),
      h2: createHeading(2),
      h3: createHeading(3),
      h4: createHeading(4),
      h5: createHeading(5),
      h6: createHeading(6),
    };
  }, [headings]);

  // Track active heading via IntersectionObserver in preview mode
  useEffect(() => {
    if (!showPreviewToc) return;
    const container = previewScrollRef.current;
    if (!container) return;

    const headingEls = headings
      .map((h) => container.querySelector(`#${CSS.escape(h.id)}`))
      .filter(Boolean) as Element[];

    if (headingEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Pick the one closest to the top
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveHeadingId(visible[0].target.id);
        }
      },
      {
        root: container,
        rootMargin: "0px 0px -70% 0px",
        threshold: 0,
      }
    );

    headingEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, showPreviewToc]);

  // Jump to heading element in preview
  const jumpToHeading = useCallback((id: string) => {
    const container = previewScrollRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveHeadingId(id);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [value, effectiveMode]);

  // Jump to line in textarea
  const jumpToLine = useCallback(
    (line: number) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const lines = value.split("\n");
      let pos = 0;
      for (let i = 0; i < line && i < lines.length; i++) {
        pos += lines[i].length + 1;
      }
      ta.focus();
      ta.setSelectionRange(pos, pos + (lines[line]?.length ?? 0));
      // Scroll the line into view
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
      const scrollTarget = line * lineHeight - ta.clientHeight / 2;
      ta.scrollTop = Math.max(0, scrollTarget);
    },
    [value]
  );

  // Toolbar handler
  const handleToolbar = useCallback(
    (btn: ToolbarButton) => {
      if (!textareaRef.current) return;
      const ta = textareaRef.current;
      switch (btn.type) {
        case "wrap":
          wrapToggle(ta, value, onChange, btn.delim!);
          break;
        case "line":
          lineToggle(ta, value, onChange, btn.prefix!);
          break;
        case "action":
          applyFormat(ta, value, onChange, btn.action!);
          break;
      }
    },
    [value, onChange]
  );

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key === "b") {
        e.preventDefault();
        const btn = ALL_BUTTONS.find((b) => b.label === "bold");
        if (btn) handleToolbar(btn);
      } else if (e.key === "i") {
        e.preventDefault();
        const btn = ALL_BUTTONS.find((b) => b.label === "italic");
        if (btn) handleToolbar(btn);
      } else if (e.key === "k") {
        e.preventDefault();
        const btn = ALL_BUTTONS.find((b) => b.label === "link");
        if (btn) handleToolbar(btn);
      }
    },
    [handleToolbar]
  );

  // -----------------------------------------------------------------------
  // viewOnly: pure reading experience
  // -----------------------------------------------------------------------
  if (viewOnly) {
    return (
      <div className="flex flex-1 flex-col rounded-xl bg-zinc-900/50 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-8 sm:px-12 sm:py-12">
            {value ? (
              <article className={PROSE_CLASSES}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {value}
                </ReactMarkdown>
              </article>
            ) : (
              <p className="text-sm text-zinc-600 italic">No content.</p>
            )}
          </div>
        </div>
        {/* Subtle footer with word count */}
        <div className="flex items-center justify-end border-t border-zinc-800/50 px-4 py-1.5">
          <span className="text-[10px] text-zinc-600">
            {words} {words === 1 ? "word" : "words"}
          </span>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Editor mode
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
      {/* ── Toolbar ribbon ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1.5 bg-zinc-900/40">
        {/* Formatting buttons -- only visible when editor is showing */}
        {showEditor && (
          <div className="flex items-center gap-px overflow-x-auto scrollbar-none">
            {TOOLBAR_GROUPS.map((group, gi) => (
              <div key={group.label} className="flex items-center">
                {gi > 0 && (
                  <div className="mx-1.5 h-4 w-px bg-zinc-800" />
                )}
                <div className="flex items-center gap-px">
                  {group.items.map((item, ii) => {
                    if (item === "sep") return null;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        title={
                          item.shortcut
                            ? `${item.title} (${item.shortcut})`
                            : item.title
                        }
                        onClick={() => handleToolbar(item)}
                        className="group/btn relative flex items-center justify-center rounded-md h-7 w-7 text-zinc-500 hover:text-violet-300 hover:bg-violet-500/10 active:bg-violet-500/20 transition-all duration-150"
                      >
                        {item.icon}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Word count in toolbar */}
        <span className="text-[10px] text-zinc-600 tabular-nums mr-2 hidden sm:block">
          {words}w
        </span>

        {/* Mode switcher */}
        <div className="flex items-center rounded-lg bg-zinc-800/60 p-0.5">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              title={m.label}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                effectiveMode === m.key
                  ? "bg-violet-500/15 text-violet-300 shadow-sm shadow-violet-500/5"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor pane */}
        {showEditor && (
          <div
            ref={editorWrapRef}
            className={`relative flex flex-col overflow-y-auto ${
              effectiveMode === "split" ? "w-1/2" : "w-full"
            }`}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              spellCheck={false}
              className={[
                "w-full flex-1 resize-none bg-transparent outline-none",
                "px-6 py-5 sm:px-8 sm:py-6",
                "text-[14px] text-zinc-200 leading-[1.75] tracking-wide",
                "placeholder:text-zinc-700 placeholder:italic",
                "caret-violet-400",
                "selection:bg-violet-500/25",
              ].join(" ")}
              style={{ tabSize: 2, minHeight: "200px", fontFamily: "'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Fira Code', monospace" }}
            />
          </div>
        )}

        {/* Split divider */}
        {effectiveMode === "split" && (
          <div className="w-px bg-zinc-800 shrink-0" />
        )}

        {/* Preview pane (full preview + TOC sidebar) */}
        {effectiveMode === "preview" && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div ref={previewScrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-8 py-6 sm:px-12 sm:py-8">
                {value ? (
                  <article className={PROSE_CLASSES}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {value}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <p className="text-sm text-zinc-600 italic">
                    Nothing to preview
                  </p>
                )}
              </div>
            </div>
            {headings.length > 0 && (
              <>
                <div className="w-px bg-zinc-800 shrink-0" />
                <div className="w-56 shrink-0 overflow-y-auto bg-zinc-900/30">
                  <DocumentOutline
                    headings={headings}
                    onJumpToId={jumpToHeading}
                    activeHeadingId={activeHeadingId}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Preview pane (split mode right panel) */}
        {effectiveMode === "split" && (
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-6 sm:px-12 sm:py-8">
              {value ? (
                <article className={PROSE_CLASSES}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {value}
                  </ReactMarkdown>
                </article>
              ) : (
                <p className="text-sm text-zinc-600 italic">
                  Nothing to preview
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-1">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {value.split("\n").length} {value.split("\n").length === 1 ? "line" : "lines"}
          </span>
          <span className="text-[10px] text-zinc-700">|</span>
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span className="text-[10px] text-zinc-700">|</span>
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {value.length} {value.length === 1 ? "char" : "chars"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-700">Markdown</span>
        </div>
      </div>
    </div>
  );
}
