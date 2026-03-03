import { spawn } from "child_process";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[\?]?[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "").trim();
}

export function execInDir(cwd: string, command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    proc.on("error", () => resolve({ code: -1, stdout, stderr }));
  });
}

export function formatToolDetail(name: string, input: Record<string, unknown>): string {
  if (input.file_path) return ` ${input.file_path}`;
  if (name === "Bash" && input.command) return ` $ ${String(input.command).slice(0, 120)}`;
  if (input.description) return ` ${String(input.description).slice(0, 120)}`;
  if (input.subject) return ` ${String(input.subject).slice(0, 120)}`;
  if (input.pattern) return ` ${input.pattern}`;
  if (input.query) return ` ${String(input.query).slice(0, 120)}`;
  if (input.prompt) return ` ${String(input.prompt).slice(0, 120)}`;
  return "";
}

/**
 * Generic agent stream consumer. Calls `pushLog` for each log line and returns
 * the final result message and accumulated text.
 */
export async function consumeAgentStream(
  agentStream: AsyncIterable<import("node-claude-sdk").StreamMessage>,
  pushLog: (stream: "stdout" | "stderr", text: string, toolCallId?: string) => void,
  signal?: AbortSignal,
): Promise<{ resultMessage: import("node-claude-sdk").ResultMessage | null; resultText: string }> {
  let textBuffer = "";
  let currentToolName: string | null = null;
  let toolInputJson = "";
  let toolCallCounter = 0;
  let thinkingCounter = 0;
  let resultMessage: import("node-claude-sdk").ResultMessage | null = null;
  let resultText = "";

  function flushText() {
    if (!textBuffer) return;
    for (const line of textBuffer.split("\n")) {
      if (line.trim()) pushLog("stdout", line);
    }
    textBuffer = "";
  }

  for await (const msg of agentStream) {
    if (signal?.aborted) throw new Error("Cancelled");
    if (msg.type === "result") {
      resultMessage = msg;
    } else if (msg.type === "stream_event") {
      const { event } = msg;

      if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use" && event.content_block.name) {
          flushText();
          currentToolName = event.content_block.name;
          toolInputJson = "";
          toolCallCounter++;
          pushLog("stdout", `[${currentToolName}]`, `tool-${toolCallCounter}-start`);
        } else {
          currentToolName = null;
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          resultText += event.delta.text;
          textBuffer += event.delta.text;
          const lastNl = textBuffer.lastIndexOf("\n");
          if (lastNl !== -1) {
            const complete = textBuffer.slice(0, lastNl);
            textBuffer = textBuffer.slice(lastNl + 1);
            for (const line of complete.split("\n")) {
              if (line.trim()) pushLog("stdout", line);
            }
          }
        } else if (event.delta?.type === "input_json_delta") {
          const partial = (event.delta as Record<string, string>).partial_json ?? event.delta.text ?? "";
          toolInputJson += partial;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolName) {
          let detail = "";
          try {
            const input = JSON.parse(toolInputJson) as Record<string, unknown>;
            detail = formatToolDetail(currentToolName, input);
          } catch {}
          pushLog("stdout", `[${currentToolName}]${detail}`, `tool-${toolCallCounter}-end`);
          currentToolName = null;
          toolInputJson = "";
          thinkingCounter++;
          pushLog("stdout", "Thinking...", `thinking-${thinkingCounter}`);
        } else {
          flushText();
        }
      }
    } else if (msg.type === "assistant" && msg.message.stop_reason) {
      flushText();
    }
  }
  flushText();

  return { resultMessage, resultText };
}

/**
 * Resolve git root from a project path — walks up to find a repo with actual commits.
 */
export async function resolveGitRoot(projectPath: string): Promise<string> {
  let dir = projectPath;
  while (true) {
    const toplevel = await execInDir(dir, "git", ["rev-parse", "--show-toplevel"]);
    if (toplevel.code !== 0) break;
    const root = toplevel.stdout.trim();
    const hasCommits = await execInDir(root, "git", ["rev-parse", "HEAD"]);
    if (hasCommits.code === 0) return root;
    const parent = root.replace(/\/[^/]+$/, "");
    if (parent === root || !parent) break;
    dir = parent;
  }
  throw new Error(`No git repository with commits found from ${projectPath}`);
}

/**
 * Find a free TCP port.
 */
export async function findFreePort(): Promise<number> {
  const { createServer } = await import("net");
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("Could not get port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}
