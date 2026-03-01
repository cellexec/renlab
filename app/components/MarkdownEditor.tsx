"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** When true, forces preview-only mode — hides write/split tabs and toolbar */
  viewOnly?: boolean;
}

type Tab = "write" | "preview" | "split";

// ---------------------------------------------------------------------------
// Helpers: find the current line boundaries around the cursor
// ---------------------------------------------------------------------------

function getCurrentLineRange(
  value: string,
  selStart: number,
  selEnd: number
): { lineStart: number; lineEnd: number } {
  let lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  let lineEnd = value.indexOf("\n", selEnd);
  if (lineEnd === -1) lineEnd = value.length;
  return { lineStart, lineEnd };
}

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
    // Something is selected
    const selected = value.slice(start, end);

    // Check if selection is already wrapped
    if (selected.startsWith(delim) && selected.endsWith(delim) && selected.length >= dLen * 2) {
      // Unwrap inside selection
      const unwrapped = selected.slice(dLen, -dLen);
      const text = value.slice(0, start) + unwrapped + value.slice(end);
      onChange(text);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + unwrapped.length);
      });
      return;
    }

    // Check if delimiters surround the selection
    if (
      start >= dLen &&
      end + dLen <= value.length &&
      value.slice(start - dLen, start) === delim &&
      value.slice(end, end + dLen) === delim
    ) {
      // Remove surrounding delimiters
      const text = value.slice(0, start - dLen) + value.slice(start, end) + value.slice(end + dLen);
      onChange(text);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start - dLen, end - dLen);
      });
      return;
    }

    // Wrap
    const text = value.slice(0, start) + delim + selected + delim + value.slice(end);
    onChange(text);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + dLen, end + dLen);
    });
    return;
  }

  // No selection -- check if cursor is inside a wrapped segment
  // Scan backwards for the delimiter, then forwards for the closing delimiter
  const before = value.slice(0, start);
  const after = value.slice(start);
  const lastOpen = before.lastIndexOf(delim);
  const nextClose = after.indexOf(delim);

  if (lastOpen !== -1 && nextClose !== -1) {
    // Make sure there is no newline between open delimiter and cursor, and cursor and close
    const betweenOpen = value.slice(lastOpen + dLen, start);
    const betweenClose = value.slice(start, start + nextClose);
    if (!betweenOpen.includes("\n") && !betweenClose.includes("\n")) {
      // We are inside a wrapped segment -- unwrap it
      const inner = value.slice(lastOpen + dLen, start + nextClose);
      const text = value.slice(0, lastOpen) + inner + value.slice(start + nextClose + dLen);
      onChange(text);
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start - dLen;
        textarea.setSelectionRange(newPos, newPos);
      });
      return;
    }
  }

  // Insert placeholder wrapped
  const placeholder = "text";
  const text = value.slice(0, start) + delim + placeholder + delim + value.slice(start);
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
    if (isHeading) {
      return toggleHeading(line, prefix);
    }
    return toggleLinePrefix(line, prefix);
  });

  const result = transformed.join("\n");
  const text = value.slice(0, lineStart) + result + value.slice(lineEnd);
  onChange(text);

  const newEnd = lineStart + result.length;
  requestAnimationFrame(() => {
    textarea.focus();
    // If single line, place cursor at end of line
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
    const existingPrefix = match[0]; // e.g. "## "
    if (existingPrefix === prefix) {
      // Same heading level -- toggle off
      return line.slice(existingPrefix.length);
    }
    // Different heading level -- replace
    return prefix + line.slice(existingPrefix.length);
  }
  // No heading -- add
  return prefix + line;
}

function toggleLinePrefix(line: string, prefix: string): string {
  // Check if line already has this exact prefix
  if (line.startsWith(prefix)) {
    return line.slice(prefix.length);
  }

  // Check if line has a different list prefix and replace it
  for (const lp of LIST_PREFIXES) {
    if (line.startsWith(lp) && lp !== prefix) {
      return prefix + line.slice(lp.length);
    }
  }

  // Check for blockquote
  if (line.startsWith("> ") && prefix !== "> ") {
    return prefix + line.slice(2);
  }
  if (!line.startsWith("> ") && prefix === "> ") {
    // Also strip list prefix if switching to blockquote
    for (const lp of LIST_PREFIXES) {
      if (line.startsWith(lp)) {
        return prefix + line.slice(lp.length);
      }
    }
  }

  return prefix + line;
}

// ---------------------------------------------------------------------------
// Non-toggling actions (link, image, code block, table, hr)
// ---------------------------------------------------------------------------

function applyFormat(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  action: (selected: string, before: string, after: string) => { text: string; selStart: number; selEnd: number }
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
  // For wrap type
  delim?: string;
  // For line type
  prefix?: string;
  // For action type
  action?: (
    selected: string,
    before: string,
    after: string
  ) => { text: string; selStart: number; selEnd: number };
}

const TOOLBAR: (ToolbarButton | "sep")[] = [
  {
    label: "bold",
    title: "Bold",
    icon: <span className="font-bold">B</span>,
    type: "wrap",
    delim: "**",
  },
  {
    label: "italic",
    title: "Italic",
    icon: <span className="italic">I</span>,
    type: "wrap",
    delim: "*",
  },
  {
    label: "strikethrough",
    title: "Strikethrough",
    icon: <span className="line-through">S</span>,
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
  "sep",
  {
    label: "h1",
    title: "Heading 1",
    icon: <span className="text-[10px] font-bold">H1</span>,
    type: "line",
    prefix: "# ",
  },
  {
    label: "h2",
    title: "Heading 2",
    icon: <span className="text-[10px] font-bold">H2</span>,
    type: "line",
    prefix: "## ",
  },
  {
    label: "h3",
    title: "Heading 3",
    icon: <span className="text-[10px] font-bold">H3</span>,
    type: "line",
    prefix: "### ",
  },
  "sep",
  {
    label: "ul",
    title: "Bullet list",
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
          d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
    ),
    type: "line",
    prefix: "- ",
  },
  {
    label: "ol",
    title: "Numbered list",
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
          d="M8.242 5.992h12m-12 6.003h12m-12 5.999h12M4.117 7.495v-3.75H2.99m1.125 3.75H2.99m1.125 0H5.24m-1.92 2.577a1.125 1.125 0 111.591 1.59l-1.83 1.83h2.16"
        />
      </svg>
    ),
    type: "line",
    prefix: "1. ",
  },
  {
    label: "checklist",
    title: "Checklist",
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
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    type: "line",
    prefix: "- [ ] ",
  },
  "sep",
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
          d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
        />
      </svg>
    ),
    type: "action",
    action: codeBlockAction,
  },
  "sep",
  {
    label: "link",
    title: "Link",
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
          d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.757 8.81"
        />
      </svg>
    ),
    type: "action",
    action: linkAction,
  },
  {
    label: "image",
    title: "Image",
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
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
        />
      </svg>
    ),
    type: "action",
    action: imageAction,
  },
  {
    label: "table",
    title: "Table",
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
          d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125"
        />
      </svg>
    ),
    type: "action",
    action: tableAction,
  },
  {
    label: "hr",
    title: "Horizontal rule",
    icon: (
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5" />
      </svg>
    ),
    type: "action",
    action: hrAction,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  viewOnly = false,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<Tab>("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveTab = viewOnly ? "preview" : tab;

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

  const showEditor = !viewOnly && (effectiveTab === "write" || effectiveTab === "split");

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
      {/* Toolbar row — hidden in viewOnly mode */}
      {!viewOnly && (
      <div className="flex items-center border-b border-zinc-700 px-1 py-1">
        {/* Format buttons -- left side */}
        {showEditor && (
          <div className="flex items-center gap-0.5 flex-wrap">
            {TOOLBAR.map((item, i) =>
              item === "sep" ? (
                <div
                  key={`sep-${i}`}
                  className="w-px h-4 bg-zinc-700 mx-0.5"
                />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  title={item.title}
                  onClick={() => handleToolbar(item)}
                  className="flex items-center justify-center rounded h-7 w-7 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                >
                  {item.icon}
                </button>
              )
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View mode tabs -- right side */}
        <div className="flex items-center gap-0.5 ml-2">
          {(["write", "preview", "split"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                effectiveTab === t
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "write" ? "Write" : t === "preview" ? "Preview" : "Split"}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Editor / Preview */}
      <div
        className={`flex flex-1 min-h-0 ${
          effectiveTab === "split" ? "divide-x divide-zinc-700" : ""
        }`}
      >
        {showEditor && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${
              effectiveTab === "split" ? "w-1/2" : "w-full"
            } resize-none bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none font-mono leading-relaxed placeholder:text-zinc-600`}
          />
        )}
        {(effectiveTab === "preview" || effectiveTab === "split") && (
          <div
            className={`${
              effectiveTab === "split" ? "w-1/2" : "w-full"
            } overflow-y-auto px-6 py-4`}
          >
            {value ? (
              <div
                className={[
                  "prose prose-invert prose-base max-w-none",
                  // Headings
                  "prose-headings:font-semibold prose-headings:tracking-tight",
                  "prose-h1:text-2xl prose-h1:pb-2 prose-h1:border-b prose-h1:border-zinc-700 prose-h1:mb-4",
                  "prose-h2:text-xl prose-h2:pb-1.5 prose-h2:border-b prose-h2:border-zinc-700/60 prose-h2:mb-3",
                  "prose-h3:text-lg",
                  // Code blocks
                  "prose-pre:bg-zinc-900/80 prose-pre:rounded-lg prose-pre:border prose-pre:border-zinc-700/50",
                  // Inline code
                  "prose-code:bg-zinc-700/50 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-zinc-300 prose-code:before:content-none prose-code:after:content-none prose-code:font-normal prose-code:text-sm",
                  // Blockquotes
                  "prose-blockquote:border-l-cyan-500 prose-blockquote:border-l-2 prose-blockquote:bg-cyan-950/10 prose-blockquote:rounded-r prose-blockquote:py-0.5 prose-blockquote:text-zinc-300 prose-blockquote:not-italic",
                  // Links
                  "prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline",
                  // Tables
                  "prose-table:border prose-table:border-zinc-700 prose-table:rounded",
                  "prose-th:border prose-th:border-zinc-700 prose-th:bg-zinc-800 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-zinc-200",
                  "prose-td:border prose-td:border-zinc-700 prose-td:px-3 prose-td:py-2",
                  // HR
                  "prose-hr:border-zinc-700",
                  // Strong / em
                  "prose-strong:text-zinc-100",
                  "prose-em:text-zinc-300",
                  // Images
                  "prose-img:rounded-lg prose-img:border prose-img:border-zinc-700",
                ].join(" ")}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {value}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-zinc-600 italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
