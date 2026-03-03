import { spawn, type ChildProcess } from "child_process";
import { cleanEnv } from "./env";

export type CommandStatus = "idle" | "running" | "done" | "error";

export interface LogEntry {
  timestamp: number;
  stream: "stdout" | "stderr";
  text: string;
}

interface DbState {
  process: ChildProcess | null;
  status: CommandStatus;
  logs: LogEntry[];
  clients: Set<(event: SSEEvent) => void>;
  projectPath: string;
}

export type SSEEvent =
  | { type: "buffer"; entries: LogEntry[] }
  | { type: "log"; entry: LogEntry }
  | { type: "status"; status: CommandStatus };

const MAX_LOG_LINES = 1000;

// Strip all ANSI escape sequences (colors, cursor, terminal control)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[\?]?[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g;
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "").trim();
}

// Use globalThis so state survives across Next.js route handler bundles and HMR
const GLOBAL_KEY = Symbol.for("__dbManagers__");
function getStates(): Map<string, DbState> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, DbState>();
  return g[GLOBAL_KEY] as Map<string, DbState>;
}
const states = getStates();

function broadcast(projectId: string, event: SSEEvent) {
  const state = states.get(projectId);
  if (!state) return;
  for (const cb of state.clients) {
    try { cb(event); } catch {}
  }
}

function pushLog(projectId: string, stream: "stdout" | "stderr", raw: string) {
  const state = states.get(projectId);
  if (!state) return;
  const text = stripAnsi(raw);
  if (!text) return;
  const entry: LogEntry = { timestamp: Date.now(), stream, text };
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs = state.logs.slice(-MAX_LOG_LINES);
  }
  broadcast(projectId, { type: "log", entry });
}

function setStatus(projectId: string, status: CommandStatus) {
  const state = states.get(projectId);
  if (!state) return;
  state.status = status;
  broadcast(projectId, { type: "status", status });
}

/** For monorepo projects, supabase/ lives at repoPath; otherwise at projectPath */
export function getSupabaseCwd(projectPath: string, repoPath?: string | null): string {
  return repoPath ?? projectPath;
}

/** Compute relative app path from repoPath to projectPath (e.g. "apps/hundeschule") */
export function getAppCwd(projectPath: string, repoPath: string): string {
  const relative = projectPath.startsWith(repoPath)
    ? projectPath.slice(repoPath.length).replace(/^\//, "")
    : projectPath;
  return relative;
}

/** Run a generic command, streaming output via SSE */
export function runCommand(
  projectId: string,
  opts: { cmd: string; args: string[]; cwd: string; label: string },
): { status: CommandStatus } {
  const existing = states.get(projectId);
  if (existing?.status === "running") {
    return { status: "running" };
  }

  const state: DbState = {
    process: null,
    status: "running",
    logs: existing?.logs ?? [],
    clients: existing?.clients ?? new Set(),
    projectPath: opts.cwd,
  };
  states.set(projectId, state);

  // Push a separator log so users can see where the new command starts
  pushLog(projectId, "stdout", `── ${opts.label} ──`);
  setStatus(projectId, "running");

  const proc = spawn(opts.cmd, opts.args, {
    cwd: opts.cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: cleanEnv({ FORCE_COLOR: "0" }),
  });
  state.process = proc;

  const handleData = (stream: "stdout" | "stderr") => (data: Buffer) => {
    const text = data.toString();
    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      pushLog(projectId, stream, line);
    }
  };

  proc.stdout?.on("data", handleData("stdout"));
  proc.stderr?.on("data", handleData("stderr"));

  proc.on("error", (err) => {
    pushLog(projectId, "stderr", `Process error: ${err.message}`);
    setStatus(projectId, "error");
  });

  proc.on("close", (code) => {
    const current = states.get(projectId);
    if (current && current.process === proc) {
      current.process = null;
      setStatus(projectId, code === 0 ? "done" : "error");
    }
  });

  return { status: "running" };
}

/** Convenience wrapper to run a supabase CLI command */
export function runSupabaseCommand(
  projectId: string,
  projectPath: string,
  label: string,
  args: string[],
  repoPath?: string | null,
): { status: CommandStatus } {
  const cwd = getSupabaseCwd(projectPath, repoPath);
  return runCommand(projectId, { cmd: "npx", args: ["supabase", ...args], cwd, label });
}

/** Run `supabase status` and parse whether containers are up */
export async function getSupabaseStatus(
  projectPath: string,
  repoPath?: string | null,
): Promise<{ supabaseUp: boolean; raw: string }> {
  const cwd = getSupabaseCwd(projectPath, repoPath);

  return new Promise((resolve) => {
    let output = "";
    const proc = spawn("npx", ["supabase", "status"], {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: cleanEnv({ FORCE_COLOR: "0" }),
    });

    proc.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

    proc.on("close", (code) => {
      // supabase status exits 0 when containers are running
      resolve({ supabaseUp: code === 0, raw: stripAnsi(output) });
    });

    proc.on("error", () => {
      resolve({ supabaseUp: false, raw: "Failed to run supabase status" });
    });
  });
}

/** Run `docker compose ps` and check whether postgres is running */
export async function getDockerComposeStatus(
  repoPath: string,
): Promise<{ servicesUp: boolean; raw: string }> {
  return new Promise((resolve) => {
    let output = "";
    const proc = spawn("docker", ["compose", "ps", "--format", "json"], {
      cwd: repoPath,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: cleanEnv({ FORCE_COLOR: "0" }),
    });

    proc.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

    proc.on("close", () => {
      // docker compose ps --format json outputs one JSON object per line
      const hasPostgres = output.includes('"postgres"') || output.includes('"db"');
      const isRunning = hasPostgres && output.includes('"running"');
      resolve({ servicesUp: isRunning, raw: stripAnsi(output) });
    });

    proc.on("error", () => {
      resolve({ servicesUp: false, raw: "Failed to run docker compose ps" });
    });
  });
}

export function getCommandStatus(projectId: string): { status: CommandStatus } {
  const state = states.get(projectId);
  if (!state) return { status: "idle" };
  return { status: state.status };
}

export function getBufferedLogs(projectId: string): LogEntry[] {
  const state = states.get(projectId);
  if (!state) return [];
  return [...state.logs];
}

export function addClient(projectId: string, callback: (event: SSEEvent) => void): () => void {
  let state = states.get(projectId);
  if (!state) {
    state = {
      process: null,
      status: "idle",
      logs: [],
      clients: new Set(),
      projectPath: "",
    };
    states.set(projectId, state);
  }
  state.clients.add(callback);
  return () => {
    state!.clients.delete(callback);
  };
}
