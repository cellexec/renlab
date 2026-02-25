import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import { rm } from "fs/promises";

export type ServerStatus = "idle" | "starting" | "running" | "stopping" | "error";

export interface LogEntry {
  timestamp: number;
  stream: "stdout" | "stderr";
  text: string;
}

interface ServerState {
  process: ChildProcess;
  status: ServerStatus;
  port: number | null;
  exitCode: number | null;
  logs: LogEntry[];
  clients: Set<(event: SSEEvent) => void>;
  projectPath: string;
}

export type SSEEvent =
  | { type: "buffer"; entries: LogEntry[] }
  | { type: "log"; entry: LogEntry }
  | { type: "status"; status: ServerStatus; port: number | null; exitCode: number | null };

const MAX_LOG_LINES = 1000;

// Strip all ANSI escape sequences (colors, cursor, terminal control)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[\?]?[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g;
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "").trim();
}

// Use globalThis so state survives across Next.js route handler bundles and HMR
const GLOBAL_KEY = Symbol.for("__devServers__");
function getServers(): Map<string, ServerState> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, ServerState>();
  return g[GLOBAL_KEY] as Map<string, ServerState>;
}
const servers = getServers();

function broadcast(projectId: string, event: SSEEvent) {
  const state = servers.get(projectId);
  if (!state) return;
  for (const cb of state.clients) {
    try { cb(event); } catch {}
  }
}

function pushLog(projectId: string, stream: "stdout" | "stderr", raw: string) {
  const state = servers.get(projectId);
  if (!state) return;
  const text = stripAnsi(raw);
  const entry: LogEntry = { timestamp: Date.now(), stream, text };
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs = state.logs.slice(-MAX_LOG_LINES);
  }
  broadcast(projectId, { type: "log", entry });
}

function setStatus(projectId: string, status: ServerStatus, extra?: { port?: number; exitCode?: number }) {
  const state = servers.get(projectId);
  if (!state) return;
  state.status = status;
  if (extra?.port !== undefined) state.port = extra.port;
  if (extra?.exitCode !== undefined) state.exitCode = extra.exitCode;
  broadcast(projectId, { type: "status", status: state.status, port: state.port, exitCode: state.exitCode });
}

// Matches common dev server port output: "localhost:3000", "port 3000", ":3000", etc.
const PORT_RE = /(?:localhost:|127\.0\.0\.1:|0\.0\.0\.0:|port\s+|:\s*)(\d{4,5})/i;

function findFreePort(start = 3100): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(start, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : start;
      srv.close(() => resolve(port));
    });
    srv.on("error", () => {
      // Port taken, try next
      if (start < 65535) resolve(findFreePort(start + 1));
      else reject(new Error("No free port found"));
    });
  });
}

export async function startServer(projectId: string, projectPath: string): Promise<{ status: ServerStatus; port: number | null }> {
  const existing = servers.get(projectId);
  if (existing && (existing.status === "running" || existing.status === "starting")) {
    return { status: existing.status, port: existing.port };
  }

  // Clean up any previous state
  if (existing) {
    servers.delete(projectId);
  }

  // Find a free port so we don't collide with the renlab app or other projects
  const assignedPort = await findFreePort();

  const proc = spawn("npm", ["run", "dev"], {
    cwd: projectPath,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", PORT: String(assignedPort) },
  });

  const state: ServerState = {
    process: proc,
    status: "starting",
    port: null,
    exitCode: null,
    logs: [],
    clients: existing?.clients ?? new Set(),
    projectPath,
  };
  servers.set(projectId, state);

  broadcast(projectId, { type: "status", status: "starting", port: null, exitCode: null });

  const handleData = (stream: "stdout" | "stderr") => (data: Buffer) => {
    const text = data.toString();
    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      pushLog(projectId, stream, line);

      // Detect port
      if (!state.port) {
        const match = line.match(PORT_RE);
        if (match) {
          const port = parseInt(match[1], 10);
          state.port = port;
          setStatus(projectId, "running", { port });
        }
      }
    }
  };

  proc.stdout?.on("data", handleData("stdout"));
  proc.stderr?.on("data", handleData("stderr"));

  proc.on("error", (err) => {
    pushLog(projectId, "stderr", `Process error: ${err.message}`);
    setStatus(projectId, "error", { exitCode: -1 });
  });

  proc.on("close", (code) => {
    const current = servers.get(projectId);
    if (current && current.process === proc) {
      const exitCode = code ?? -1;
      // If we were stopping, it's expected
      if (current.status === "stopping") {
        setStatus(projectId, "idle", { exitCode });
      } else {
        setStatus(projectId, exitCode === 0 ? "idle" : "error", { exitCode });
      }
    }
  });

  return { status: "starting", port: null };
}

export function stopServer(projectId: string): { status: ServerStatus; port: number | null } {
  const state = servers.get(projectId);
  if (!state || state.status === "idle" || state.status === "error") {
    return { status: state?.status ?? "idle", port: null };
  }

  setStatus(projectId, "stopping");

  const proc = state.process;
  // Kill the process group (negative PID) to catch child processes from shell
  try {
    if (proc.pid) process.kill(-proc.pid, "SIGTERM");
    else proc.kill("SIGTERM");
  } catch {
    proc.kill("SIGTERM");
  }

  // Fallback SIGKILL after 5s
  const killTimer = setTimeout(() => {
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGKILL");
      else proc.kill("SIGKILL");
    } catch {}
  }, 5000);

  proc.on("close", () => clearTimeout(killTimer));

  return { status: "stopping", port: state.port };
}

export async function restartServer(projectId: string, projectPath: string): Promise<{ status: ServerStatus; port: number | null }> {
  const state = servers.get(projectId);
  if (state && (state.status === "running" || state.status === "starting")) {
    // Stop first, then start on close
    setStatus(projectId, "stopping");
    const proc = state.process;
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGTERM");
      else proc.kill("SIGTERM");
    } catch {
      proc.kill("SIGTERM");
    }

    const killTimer = setTimeout(() => {
      try {
        if (proc.pid) process.kill(-proc.pid, "SIGKILL");
        else proc.kill("SIGKILL");
      } catch {}
    }, 5000);

    proc.on("close", () => {
      clearTimeout(killTimer);
      startServer(projectId, projectPath);
    });

    return { status: "stopping", port: null };
  }

  return startServer(projectId, projectPath);
}

export function getStatus(projectId: string): { status: ServerStatus; port: number | null; exitCode: number | null } {
  const state = servers.get(projectId);
  if (!state) return { status: "idle", port: null, exitCode: null };
  return { status: state.status, port: state.port, exitCode: state.exitCode };
}

export function getBufferedLogs(projectId: string): LogEntry[] {
  const state = servers.get(projectId);
  if (!state) return [];
  return [...state.logs];
}

export async function clearNextCache(projectId: string, projectPath: string): Promise<{ success: boolean; error?: string }> {
  const state = servers.get(projectId);
  if (state && (state.status === "running" || state.status === "starting")) {
    return { success: false, error: "Stop the dev server before clearing the cache" };
  }

  try {
    await rm(`${projectPath}/.next`, { recursive: true, force: true });
    pushLog(projectId, "stdout", "Cleared .next cache");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export function addClient(projectId: string, callback: (event: SSEEvent) => void): () => void {
  let state = servers.get(projectId);
  if (!state) {
    // Create a placeholder state so clients can register before server starts
    state = {
      process: null as unknown as ChildProcess,
      status: "idle",
      port: null,
      exitCode: null,
      logs: [],
      clients: new Set(),
      projectPath: "",
    };
    servers.set(projectId, state);
  }
  state.clients.add(callback);
  return () => {
    state!.clients.delete(callback);
  };
}
