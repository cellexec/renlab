import { spawn, type ChildProcess } from "child_process";
import { stream } from "node-claude-sdk";
import { getSupabase } from "./supabase";
import {
  stripAnsi,
  execInDir,
  resolveGitRoot,
  findFreePort,
  consumeAgentStream as consumeAgentStreamGeneric,
} from "./pipelineUtils";
import type {
  DesignPipelineStatus,
  DesignPipelineStep,
  DesignPipelineLogEntry,
  DesignPipelineSSEEvent,
  DesignStepTimings,
  DesignVariantStatus,
} from "../design-pipelines";

/* ------------------------------------------------------------------ */
/*  In-memory state                                                    */
/* ------------------------------------------------------------------ */

interface VariantState {
  variantNumber: number;
  status: DesignVariantStatus;
  branchName: string | null;
  worktreePath: string | null;
}

interface DesignPipelineState {
  status: DesignPipelineStatus;
  currentStep: DesignPipelineStep | null;
  stepTimings: DesignStepTimings;
  logs: DesignPipelineLogEntry[];
  clients: Set<(event: DesignPipelineSSEEvent) => void>;
  abortController: AbortController;
  devServerPort: number | null;
  devServerProcess: ChildProcess | null;
  variants: Map<number, VariantState>;
  resumeResolve: ((value: { userMessage: string }) => void) | null;
}

const MAX_LOG_LINES = 2000;

const GLOBAL_KEY = Symbol.for("__designPipelineRuns__");
function getRuns(): Map<string, DesignPipelineState> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, DesignPipelineState>();
  return g[GLOBAL_KEY] as Map<string, DesignPipelineState>;
}
const runs = getRuns();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function broadcast(runId: string, event: DesignPipelineSSEEvent) {
  const state = runs.get(runId);
  if (!state) return;
  for (const cb of state.clients) {
    try { cb(event); } catch {}
  }
}

function pushLog(runId: string, step: DesignPipelineStep, streamType: "stdout" | "stderr", raw: string, toolCallId?: string, variantNumber?: number) {
  const state = runs.get(runId);
  if (!state) return;
  const text = stripAnsi(raw);
  if (!text) return;
  const entry: DesignPipelineLogEntry = { timestamp: Date.now(), step, stream: streamType, text };
  if (toolCallId) entry.toolCallId = toolCallId;
  if (variantNumber != null) entry.variantNumber = variantNumber;
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs = state.logs.slice(-MAX_LOG_LINES);
  }
  broadcast(runId, { type: "log", entry });
}

function setRunStatus(runId: string, status: DesignPipelineStatus, step: DesignPipelineStep | null) {
  const state = runs.get(runId);
  if (!state) return;

  const now = Date.now();
  const prevKey = state.currentStep;
  const nextKey = step;

  if (prevKey && prevKey !== nextKey && state.stepTimings[prevKey]?.endedAt == null) {
    state.stepTimings[prevKey].endedAt = now;
  }
  if (nextKey && !state.stepTimings[nextKey]) {
    state.stepTimings[nextKey] = { startedAt: now, endedAt: null };
  }
  if (!step && prevKey && state.stepTimings[prevKey]?.endedAt == null) {
    state.stepTimings[prevKey].endedAt = now;
  }

  state.status = status;
  state.currentStep = step;

  const variants = Array.from(state.variants.values()).map((v) => ({
    variantNumber: v.variantNumber,
    status: v.status,
  }));
  broadcast(runId, { type: "status", status, currentStep: step, stepTimings: state.stepTimings, devServerPort: state.devServerPort, variants });
}

function setVariantStatus(runId: string, variantNumber: number, status: DesignVariantStatus) {
  const state = runs.get(runId);
  if (!state) return;
  const v = state.variants.get(variantNumber);
  if (v) v.status = status;
  broadcast(runId, { type: "variant_status", variantNumber, status });
}

async function updateDb(runId: string, fields: Record<string, unknown>) {
  const state = runs.get(runId);
  const update = state ? { ...fields, step_timings: state.stepTimings } : fields;
  await getSupabase().from("design_runs").update(update).eq("id", runId);
}

async function updateVariantDb(variantId: string, fields: Record<string, unknown>) {
  await getSupabase().from("design_variants").update(fields).eq("id", variantId);
}

async function persistLogs(runId: string) {
  const state = runs.get(runId);
  if (!state) return;
  await getSupabase().from("design_runs").update({ logs: state.logs, step_timings: state.stepTimings }).eq("id", runId);
}

async function setSpecStatus(specificationId: string, status: "draft" | "pipeline" | "failed" | "cancelled" | "done") {
  await getSupabase()
    .from("specifications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", specificationId);
}

function createResolvablePromise<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/* ------------------------------------------------------------------ */
/*  Package manager detection                                          */
/* ------------------------------------------------------------------ */

import { existsSync, readdirSync, readFileSync, writeFileSync, symlinkSync, copyFileSync } from "fs";
import { join, resolve, relative } from "path";

/** Detect whether to use bun or npm based on lockfiles in the worktree root */
function detectPackageManager(worktreeRoot: string): "bun" | "npm" {
  if (existsSync(join(worktreeRoot, "bun.lockb")) || existsSync(join(worktreeRoot, "bun.lock"))) return "bun";
  return "npm";
}

/** Detect if the worktree is a monorepo (has workspaces in package.json) */
function isMonorepo(worktreeRoot: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(worktreeRoot, "package.json"), "utf-8"));
    return Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0;
  } catch {
    return false;
  }
}

/**
 * Prepare a monorepo worktree for dev server:
 * 1. Build shared packages so their dist/ exports exist
 * 2. Patch next.config with turbopack.root so module resolution uses worktree, not parent repo
 * 3. Symlink CSS deps (tailwindcss, @tailwindcss) to worktree root node_modules
 * 4. Copy .env files from the original project into the worktree
 */
async function prepareMonorepoWorktree(
  worktreeRoot: string,
  worktreeCwd: string,
  originalProjectPath: string,
  pm: "bun" | "npm",
  log: (text: string, isErr?: boolean) => void,
) {
  // 1. Build shared packages
  log("Building shared packages...");
  const buildResult = await execInDir(worktreeRoot, pm === "bun" ? "bun" : "npx", [
    ...(pm === "bun" ? ["run", "build", "--filter=./packages/*"] : ["turbo", "run", "build", "--filter=./packages/*"]),
  ]);
  if (buildResult.code !== 0) {
    // Try individual package builds as fallback (turbo filter syntax varies)
    log("Bulk build had issues, building packages individually...");
    const pkgsDir = join(worktreeRoot, "packages");
    if (existsSync(pkgsDir)) {
      for (const pkg of readdirSync(pkgsDir, { withFileTypes: true })) {
        if (!pkg.isDirectory()) continue;
        const pkgPath = join(pkgsDir, pkg.name);
        if (!existsSync(join(pkgPath, "package.json"))) continue;
        const result = await execInDir(pkgPath, pm, ["run", "build"]);
        if (result.code !== 0) {
          log(`Warning: ${pkg.name} build failed (non-fatal)`, true);
        }
      }
    }
  }
  log("Shared packages built.");

  // 2. Patch next.config to set turbopack.root
  // Worktrees nested inside the original monorepo confuse Turbopack —
  // it walks up and finds the parent monorepo's lockfile as the root.
  // Setting turbopack.root to the worktree root fixes module resolution.
  const nextConfigPath = join(worktreeCwd, "next.config.ts");
  const nextConfigJsPath = join(worktreeCwd, "next.config.js");
  const nextConfigMjsPath = join(worktreeCwd, "next.config.mjs");
  const configPath = existsSync(nextConfigPath) ? nextConfigPath
    : existsSync(nextConfigJsPath) ? nextConfigJsPath
    : existsSync(nextConfigMjsPath) ? nextConfigMjsPath
    : null;

  if (configPath) {
    try {
      let configContent = readFileSync(configPath, "utf-8");
      // Only patch if turbopack.root isn't already set
      if (!configContent.includes("turbopack") || !configContent.includes("root")) {
        const relativeRoot = relative(worktreeCwd, worktreeRoot).replace(/\\/g, "/");
        // Add path import if not present
        if (!configContent.includes('from "path"') && !configContent.includes("require(\"path\")")) {
          if (configContent.includes("import ")) {
            configContent = `import { resolve } from "path";\n${configContent}`;
          }
        }
        // Insert turbopack.root into the config object
        const insertPoint = configContent.match(/const\s+\w+\s*:\s*\w+\s*=\s*\{/);
        if (insertPoint && insertPoint.index != null) {
          const insertIdx = insertPoint.index + insertPoint[0].length;
          configContent = configContent.slice(0, insertIdx) +
            `\n  turbopack: {\n    root: resolve(__dirname, "${relativeRoot}"),\n  },` +
            configContent.slice(insertIdx);
        }
        writeFileSync(configPath, configContent);
        log(`Patched ${configPath.split("/").pop()} with turbopack.root`);
      }
    } catch (err) {
      log(`Warning: could not patch next.config: ${err}`, true);
    }
  }

  // 3. Symlink CSS-related deps to worktree root node_modules
  // Turbopack resolves CSS @import from the turbopack.root context,
  // but bun only hoists tailwindcss to the app-level node_modules.
  const rootNodeModules = join(worktreeRoot, "node_modules");
  const appNodeModules = join(worktreeCwd, "node_modules");
  const cssPackages = ["tailwindcss", "@tailwindcss"];
  for (const pkg of cssPackages) {
    const target = join(rootNodeModules, pkg);
    const source = join(appNodeModules, pkg);
    if (!existsSync(target) && existsSync(source)) {
      try {
        symlinkSync(source, target);
        log(`Symlinked ${pkg} to worktree root node_modules`);
      } catch {
        // May already exist or permission issues
      }
    }
  }

  // 4. Copy .env files from original project
  try {
    const originalAppDir = originalProjectPath;
    for (const envFile of [".env", ".env.local", ".env.development", ".env.development.local"]) {
      const src = join(originalAppDir, envFile);
      const dst = join(worktreeCwd, envFile);
      if (existsSync(src) && !existsSync(dst)) {
        copyFileSync(src, dst);
        log(`Copied ${envFile} from original project`);
      }
    }
  } catch (err) {
    log(`Warning: could not copy .env files: ${err}`, true);
  }
}

/* ------------------------------------------------------------------ */
/*  Dev server management                                              */
/* ------------------------------------------------------------------ */

const PORT_RE = /Local:\s+https?:\/\/[^:]+:(\d+)/;

function spawnDevServer(cwd: string, port: number, pm: "bun" | "npm"): { proc: ChildProcess; ready: Promise<number> } {
  // Use next dev directly with --port to override any hardcoded port in the dev script
  const proc = spawn("npx", ["next", "dev", "--port", String(port)], {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) },
  });

  const ready = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(port), 30_000); // fallback after 30s
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(PORT_RE);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("error", (err) => { clearTimeout(timeout); reject(err); });
    proc.on("close", (code) => { clearTimeout(timeout); reject(new Error(`Dev server exited with ${code}`)); });
  });

  return { proc, ready };
}

function killDevServer(state: DesignPipelineState) {
  if (state.devServerProcess) {
    try {
      state.devServerProcess.kill("SIGTERM");
      setTimeout(() => {
        try { state.devServerProcess?.kill("SIGKILL"); } catch {}
      }, 5000);
    } catch {}
    state.devServerProcess = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Core orchestrator                                                  */
/* ------------------------------------------------------------------ */

interface VariantConfig {
  variantNumber: number;
  brief: string;
  dbVariantId: string;
}

export async function startDesignPipeline(
  runId: string,
  projectId: string,
  projectPath: string,
  specificationId: string,
  specContent: string,
  specTitle: string,
  variantCount: number,
  targetPath: string,
  variantConfigs: VariantConfig[],
) {
  const ac = new AbortController();
  const state: DesignPipelineState = {
    status: "pending",
    currentStep: null,
    stepTimings: {},
    logs: [],
    clients: runs.get(runId)?.clients ?? new Set(),
    abortController: ac,
    devServerPort: null,
    devServerProcess: null,
    variants: new Map(
      variantConfigs.map((vc) => [vc.variantNumber, { variantNumber: vc.variantNumber, status: "pending" as DesignVariantStatus, branchName: null, worktreePath: null }])
    ),
    resumeResolve: null,
  };
  runs.set(runId, state);

  await setSpecStatus(specificationId, "pipeline");

  const shortId = runId.slice(0, 8);
  const parentBranch = `design/parent-${shortId}`;
  let gitRoot = "";

  try {
    // --- Step 1: Parent worktree ---
    setRunStatus(runId, "parent_worktree", "parent_worktree");
    await updateDb(runId, { status: "parent_worktree", current_step: "parent_worktree", parent_branch: parentBranch });

    gitRoot = await resolveGitRoot(projectPath);
    const projectRelative = projectPath.startsWith(gitRoot)
      ? projectPath.slice(gitRoot.length).replace(/^\//, "")
      : "";

    const worktreeDir = `.claude/worktrees/design-${shortId}`;
    const worktreeRoot = `${gitRoot}/${worktreeDir}`;
    const worktreeCwd = projectRelative ? `${worktreeRoot}/${projectRelative}` : worktreeRoot;

    pushLog(runId, "parent_worktree", "stdout", `Creating parent worktree: ${worktreeDir}`);

    await execInDir(gitRoot, "mkdir", ["-p", ".claude/worktrees"]);
    const wtResult = await execInDir(gitRoot, "git", ["worktree", "add", worktreeDir, "-b", parentBranch]);
    if (wtResult.code !== 0) throw new Error(`Failed to create worktree: ${wtResult.stderr}`);

    await updateDb(runId, { parent_worktree_path: worktreeRoot });
    pushLog(runId, "parent_worktree", "stdout", `Parent worktree created on branch ${parentBranch}`);

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Step 2: Generate variants in parallel ---
    setRunStatus(runId, "generating", "generating");
    await updateDb(runId, { status: "generating", current_step: "generating" });

    pushLog(runId, "generating", "stdout", `Spawning ${variantCount} variant agents in parallel...`);

    const variantResults = await Promise.allSettled(
      variantConfigs.map(async (vc) => {
        const vNum = vc.variantNumber;
        const childBranch = `design/v${vNum}-${shortId}`;
        const childWorktreeDir = `.claude/worktrees/design-${shortId}-v${vNum}`;
        const childWorktreeRoot = `${gitRoot}/${childWorktreeDir}`;
        const childCwd = projectRelative ? `${childWorktreeRoot}/${projectRelative}` : childWorktreeRoot;

        const vs = state.variants.get(vNum);
        if (vs) {
          vs.branchName = childBranch;
          vs.worktreePath = childWorktreeRoot;
        }

        try {
          setVariantStatus(runId, vNum, "generating");
          await updateVariantDb(vc.dbVariantId, { status: "generating", branch_name: childBranch, worktree_path: childWorktreeRoot });

          // Create child worktree branched from parent
          const childWt = await execInDir(gitRoot, "git", ["worktree", "add", childWorktreeDir, "-b", childBranch, parentBranch]);
          if (childWt.code !== 0) throw new Error(`Child worktree failed: ${childWt.stderr}`);

          pushLog(runId, "generating", "stdout", `[v${vNum}] Worktree created, starting agent...`, undefined, vNum);

          const variantPrompt = `You are creating a design variant for a UI refactor. Your task is to create design variant #${vNum} at the route path \`/design-preview/v${vNum}/\`.

<specification>
${specContent}
</specification>

<variant-brief>
${vc.brief || `Create variant ${vNum} of the redesign.`}
</variant-brief>

<target-reference>
The original component/page is at: ${targetPath}
Study it to understand the current implementation, then create your variant at the preview path.
</target-reference>

## Instructions

1. Read the existing code at \`${targetPath}\` to understand what you're redesigning
2. Create your variant under \`app/design-preview/v${vNum}/page.tsx\` (and any supporting components)
3. The variant should be a complete, self-contained page that can be viewed at \`/design-preview/v${vNum}\`
4. Make it visually distinct from other variants — explore a different design direction
5. Import shared utilities/types from the main app as needed, but create new UI components
6. Ensure the page is fully functional and styled

CRITICAL: Only create/modify files within your current working directory. Do NOT modify files outside the worktree.`;

          const agentStream = stream(variantPrompt, {
            model: "opus",
            cwd: childCwd,
            permissionMode: "bypassPermissions",
            timeoutMs: 0,
            signal: ac.signal,
          });

          await consumeAgentStreamGeneric(
            agentStream,
            (streamType, text, toolCallId) => pushLog(runId, "generating", streamType, text, toolCallId, vNum),
            ac.signal,
          );

          pushLog(runId, "generating", "stdout", `[v${vNum}] Agent completed, committing...`, undefined, vNum);

          // Commit changes
          await execInDir(childWorktreeRoot, "git", ["add", "-A"]);
          const diffCheck = await execInDir(childWorktreeRoot, "git", ["diff", "--cached", "--quiet"]);
          if (diffCheck.code !== 0) {
            await execInDir(childWorktreeRoot, "git", [
              "commit", "-m", `"Design variant ${vNum}: ${specTitle.replace(/"/g, '\\"')}"`,
            ]);
          }

          setVariantStatus(runId, vNum, "merging");
          await updateVariantDb(vc.dbVariantId, { status: "merging", finished_at: new Date().toISOString() });

          pushLog(runId, "generating", "stdout", `[v${vNum}] Done.`, undefined, vNum);
          return { vNum, childBranch, childWorktreeDir, dbVariantId: vc.dbVariantId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (ac.signal.aborted) throw err;
          pushLog(runId, "generating", "stderr", `[v${vNum}] Failed: ${msg}`, undefined, vNum);
          setVariantStatus(runId, vNum, "failed");
          await updateVariantDb(vc.dbVariantId, { status: "failed", error_message: msg, finished_at: new Date().toISOString() });
          throw err;
        }
      })
    );

    if (ac.signal.aborted) throw new Error("Cancelled");

    // Collect successful variants
    const successfulVariants = variantResults
      .filter((r): r is PromiseFulfilledResult<{ vNum: number; childBranch: string; childWorktreeDir: string; dbVariantId: string }> => r.status === "fulfilled")
      .map((r) => r.value);

    if (successfulVariants.length === 0) {
      throw new Error("All variants failed to generate");
    }

    pushLog(runId, "generating", "stdout", `${successfulVariants.length}/${variantCount} variants generated successfully.`);

    // --- Step 3: Merge variants into parent ---
    setRunStatus(runId, "merging_variants", "merging_variants");
    await updateDb(runId, { status: "merging_variants", current_step: "merging_variants" });

    for (const sv of successfulVariants) {
      pushLog(runId, "merging_variants", "stdout", `Merging v${sv.vNum} into parent...`);

      const mergeResult = await execInDir(worktreeRoot, "git", [
        "merge", "--no-ff", sv.childBranch, "-m", `"Merge design variant ${sv.vNum}"`,
      ]);
      if (mergeResult.code !== 0) {
        pushLog(runId, "merging_variants", "stderr", `Merge conflict for v${sv.vNum}, attempting auto-resolve...`);
        // Since variants create files in different directories (v1/, v2/), conflicts are unlikely
        // but if they happen, accept both sides
        await execInDir(worktreeRoot, "git", ["checkout", "--theirs", "."]);
        await execInDir(worktreeRoot, "git", ["add", "-A"]);
        await execInDir(worktreeRoot, "git", ["commit", "--no-edit"]);
      }

      setVariantStatus(runId, sv.vNum, "merged");
      await updateVariantDb(sv.dbVariantId, { status: "merged" });

      // Clean up child worktree + branch
      await execInDir(gitRoot, "git", ["worktree", "remove", sv.childWorktreeDir, "--force"]).catch(() => {});
      await execInDir(gitRoot, "git", ["branch", "-D", sv.childBranch]).catch(() => {});
    }

    pushLog(runId, "merging_variants", "stdout", "All variants merged into parent worktree.");

    if (ac.signal.aborted) throw new Error("Cancelled");

    // Detect package manager from worktree root
    const pm = detectPackageManager(worktreeRoot);
    pushLog(runId, "installing", "stdout", `Detected package manager: ${pm}`);

    // --- Step 4: install dependencies ---
    setRunStatus(runId, "installing", "installing");
    await updateDb(runId, { status: "installing", current_step: "installing" });

    // Run install from worktree root (monorepo root) so workspace deps resolve
    pushLog(runId, "installing", "stdout", `Running ${pm} install in worktree root...`);
    const installResult = await execInDir(worktreeRoot, pm, ["install"]);
    if (installResult.code !== 0) {
      pushLog(runId, "installing", "stderr", `${pm} install stderr: ${installResult.stderr.slice(0, 500)}`);
      // Non-fatal — dev server might still work
    }
    pushLog(runId, "installing", "stdout", `${pm} install complete.`);

    // Monorepo preparation: build shared packages, patch next.config, symlink CSS, copy .env
    if (isMonorepo(worktreeRoot)) {
      pushLog(runId, "installing", "stdout", "Monorepo detected — preparing worktree...");
      await prepareMonorepoWorktree(
        worktreeRoot,
        worktreeCwd,
        projectPath,
        pm,
        (text, isErr) => pushLog(runId, "installing", isErr ? "stderr" : "stdout", text),
      );
    }

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Step 5: Dev server ---
    setRunStatus(runId, "dev_server", "dev_server");
    await updateDb(runId, { status: "dev_server", current_step: "dev_server" });

    const port = await findFreePort();
    pushLog(runId, "dev_server", "stdout", `Starting dev server on port ${port}...`);

    let devServerStarted = false;
    try {
      const { proc, ready } = spawnDevServer(worktreeCwd, port, pm);
      state.devServerProcess = proc;

      const detectedPort = await ready;
      state.devServerPort = detectedPort;
      devServerStarted = true;
      await updateDb(runId, { dev_server_port: detectedPort });

      pushLog(runId, "dev_server", "stdout", `Dev server running at http://localhost:${detectedPort}`);
    } catch (devErr) {
      const devMsg = devErr instanceof Error ? devErr.message : String(devErr);
      pushLog(runId, "dev_server", "stderr", `Dev server failed to start: ${devMsg}`);
      pushLog(runId, "dev_server", "stdout", "Proceeding to review without dev server — you can start it manually in the worktree.");
      state.devServerProcess = null;
      state.devServerPort = null;
    }

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Step 6: Awaiting review ---
    setRunStatus(runId, "awaiting_review", "awaiting_review");
    await updateDb(runId, { status: "awaiting_review", current_step: "awaiting_review" });

    pushLog(runId, "awaiting_review", "stdout", "Pipeline paused — awaiting user review.");
    if (devServerStarted && state.devServerPort) {
      pushLog(runId, "awaiting_review", "stdout", `Review variants at:`);
      for (const sv of successfulVariants) {
        pushLog(runId, "awaiting_review", "stdout", `  v${sv.vNum}: http://localhost:${state.devServerPort}/design-preview/v${sv.vNum}`);
      }
    } else {
      pushLog(runId, "awaiting_review", "stdout", `Dev server not available. Worktree is at: ${worktreeRoot}`);
      pushLog(runId, "awaiting_review", "stdout", `Start manually: cd ${worktreeCwd} && ${pm} run dev`);
    }

    await persistLogs(runId).catch(() => {});

    // Block until user resumes
    const { promise, resolve } = createResolvablePromise<{ userMessage: string }>();
    state.resumeResolve = resolve;
    const { userMessage } = await promise;

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Step 7: Finalize ---
    setRunStatus(runId, "finalizing", "finalizing");
    await updateDb(runId, { status: "finalizing", current_step: "finalizing" });

    pushLog(runId, "finalizing", "stdout", `Finalization message: "${userMessage}"`);
    pushLog(runId, "finalizing", "stdout", "Starting finalization agent...");

    const variantList = successfulVariants.map((sv) => `v${sv.vNum}`).join(", ");
    const finalizePrompt = `You are finalizing a UI refactor. The user has reviewed design variants and made their decision.

<specification>
${specContent}
</specification>

<user-decision>
${userMessage}
</user-decision>

<available-variants>
${variantList}
Variants are located at: app/design-preview/v1/, app/design-preview/v2/, etc.
</available-variants>

<target-path>
${targetPath}
</target-path>

## Instructions

1. Based on the user's decision, apply the chosen variant(s) to the real target path: \`${targetPath}\`
2. If the user wants to mix variants, combine the best parts from each
3. Copy/adapt the chosen design from \`app/design-preview/vN/\` to \`${targetPath}\`
4. Remove the entire \`app/design-preview/\` directory after applying
5. Ensure all imports are updated and the app compiles
6. Commit all changes

CRITICAL: Work only within the current working directory.`;

    const finalizeStream = stream(finalizePrompt, {
      model: "opus",
      cwd: worktreeCwd,
      permissionMode: "bypassPermissions",
      timeoutMs: 0,
      signal: ac.signal,
    });

    await consumeAgentStreamGeneric(
      finalizeStream,
      (streamType, text, toolCallId) => pushLog(runId, "finalizing", streamType, text, toolCallId),
      ac.signal,
    );

    // Commit any remaining changes
    await execInDir(worktreeRoot, "git", ["add", "-A"]);
    const finalizeDiff = await execInDir(worktreeRoot, "git", ["diff", "--cached", "--quiet"]);
    if (finalizeDiff.code !== 0) {
      await execInDir(worktreeRoot, "git", [
        "commit", "-m", `"Finalize design: ${specTitle.replace(/"/g, '\\"')}"`,
      ]);
    }

    pushLog(runId, "finalizing", "stdout", "Finalization complete.");

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Step 8: Merge to main ---
    setRunStatus(runId, "merging_final", "merging_final");
    await updateDb(runId, { status: "merging_final", current_step: "merging_final" });

    // Kill dev server before merging
    killDevServer(state);
    pushLog(runId, "merging_final", "stdout", "Dev server stopped.");

    pushLog(runId, "merging_final", "stdout", "Merging parent branch into main...");
    const mergeResult = await execInDir(gitRoot, "git", [
      "merge", "--no-ff", parentBranch, "-m", `"Design Pipeline: ${specTitle.replace(/"/g, '\\"')}"`,
    ]);
    if (mergeResult.code !== 0) {
      throw new Error(`Final merge failed: ${mergeResult.stderr}`);
    }

    pushLog(runId, "merging_final", "stdout", "Merge successful!");

    // Success
    setRunStatus(runId, "success", null);
    await updateDb(runId, { status: "success", finished_at: new Date().toISOString() });
    await setSpecStatus(specificationId, "done");

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isCancelled = message === "Cancelled" || ac.signal.aborted;
    const finalStatus: DesignPipelineStatus = isCancelled ? "cancelled" : "failed";

    killDevServer(state);
    pushLog(runId, state.currentStep ?? "parent_worktree", "stderr", `Pipeline ${finalStatus}: ${message}`);
    setRunStatus(runId, finalStatus, null);
    await updateDb(runId, {
      status: finalStatus,
      error_message: isCancelled ? "Cancelled by user" : message,
      finished_at: new Date().toISOString(),
    });
    await setSpecStatus(specificationId, isCancelled ? "cancelled" : "failed");
  } finally {
    if (state.status === "success") {
      const worktreeDir = `.claude/worktrees/design-${shortId}`;
      pushLog(runId, state.currentStep ?? "parent_worktree", "stdout", "Cleaning up parent worktree...");
      await execInDir(gitRoot, "git", ["worktree", "remove", worktreeDir, "--force"]).catch(() => {});
      await execInDir(gitRoot, "git", ["branch", "-D", parentBranch]).catch(() => {});
    } else {
      pushLog(runId, state.currentStep ?? "parent_worktree", "stdout", `Parent worktree preserved for inspection.`);
    }
    await persistLogs(runId).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/*  Resume / Cancel / Status / SSE                                     */
/* ------------------------------------------------------------------ */

export function resumeDesignPipeline(runId: string, userMessage: string): boolean {
  const state = runs.get(runId);
  if (!state || !state.resumeResolve) return false;
  state.resumeResolve({ userMessage });
  state.resumeResolve = null;
  return true;
}

export function cancelDesignPipeline(runId: string): boolean {
  const state = runs.get(runId);
  if (!state) return false;
  killDevServer(state);
  state.abortController.abort();
  // Also resolve the pause promise so it doesn't hang
  if (state.resumeResolve) {
    state.resumeResolve({ userMessage: "" });
    state.resumeResolve = null;
  }
  return true;
}

export function getDesignPipelineStatus(runId: string) {
  const state = runs.get(runId);
  if (!state) return { status: "pending" as DesignPipelineStatus, currentStep: null as DesignPipelineStep | null, stepTimings: {} as DesignStepTimings, devServerPort: null as number | null, variants: [] as { variantNumber: number; status: DesignVariantStatus }[] };
  return {
    status: state.status,
    currentStep: state.currentStep,
    stepTimings: state.stepTimings,
    devServerPort: state.devServerPort,
    variants: Array.from(state.variants.values()).map((v) => ({ variantNumber: v.variantNumber, status: v.status })),
  };
}

export async function getDesignPipelineStatusFromDb(runId: string) {
  const { data } = await getSupabase()
    .from("design_runs")
    .select("status, current_step, step_timings, dev_server_port")
    .eq("id", runId)
    .single();

  const { data: variants } = await getSupabase()
    .from("design_variants")
    .select("variant_number, status")
    .eq("design_run_id", runId)
    .order("variant_number");

  if (!data) return { status: "pending" as DesignPipelineStatus, currentStep: null as DesignPipelineStep | null, stepTimings: {} as DesignStepTimings, devServerPort: null as number | null, variants: [] as { variantNumber: number; status: DesignVariantStatus }[] };

  return {
    status: data.status as DesignPipelineStatus,
    currentStep: data.current_step as DesignPipelineStep | null,
    stepTimings: (data.step_timings as DesignStepTimings) ?? {},
    devServerPort: data.dev_server_port as number | null,
    variants: (variants ?? []).map((v) => ({ variantNumber: v.variant_number as number, status: v.status as DesignVariantStatus })),
  };
}

export function getBufferedDesignLogs(runId: string): DesignPipelineLogEntry[] {
  const state = runs.get(runId);
  if (!state) return [];
  return [...state.logs];
}

export async function getBufferedDesignLogsFromDb(runId: string): Promise<DesignPipelineLogEntry[]> {
  const { data } = await getSupabase().from("design_runs").select("logs").eq("id", runId).single();
  if (!data?.logs) return [];
  return data.logs as DesignPipelineLogEntry[];
}

export function addDesignClient(runId: string, callback: (event: DesignPipelineSSEEvent) => void): () => void {
  let state = runs.get(runId);
  if (!state) {
    state = {
      status: "pending",
      currentStep: null,
      stepTimings: {},
      logs: [],
      clients: new Set(),
      abortController: new AbortController(),
      devServerPort: null,
      devServerProcess: null,
      variants: new Map(),
      resumeResolve: null,
    };
    runs.set(runId, state);
  }
  state.clients.add(callback);
  return () => {
    state!.clients.delete(callback);
  };
}
