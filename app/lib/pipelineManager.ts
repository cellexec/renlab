import { stream } from "node-claude-sdk";
import { getSupabase } from "./supabase";
import { hasKnowledgeBase, getRelevantKnowledge } from "./knowledgeManager";
import { stripAnsi, execInDir, formatToolDetail, resolveGitRoot } from "./pipelineUtils";
import { consumeAgentStream as consumeAgentStreamGeneric } from "./pipelineUtils";
import type {
  PipelineStatus,
  PipelineStep,
  PipelineLogEntry,
  PipelineSSEEvent,
  StepTimings,
} from "../pipelines";

interface PipelineState {
  status: PipelineStatus;
  currentStep: PipelineStep | null;
  reviewScore: number | null;
  stepTimings: StepTimings;
  logs: PipelineLogEntry[];
  clients: Set<(event: PipelineSSEEvent) => void>;
  abortController: AbortController;
  iteration: number;
  maxRetries: number;
}

const MAX_LOG_LINES = 2000;

// Survive HMR + route handler rebundles
const GLOBAL_KEY = Symbol.for("__pipelineRuns__");
function getRuns(): Map<string, PipelineState> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, PipelineState>();
  return g[GLOBAL_KEY] as Map<string, PipelineState>;
}
const runs = getRuns();

function broadcast(runId: string, event: PipelineSSEEvent) {
  const state = runs.get(runId);
  if (!state) return;
  for (const cb of state.clients) {
    try { cb(event); } catch {}
  }
}

function pushLog(runId: string, step: PipelineStep, streamType: "stdout" | "stderr", raw: string, toolCallId?: string) {
  const state = runs.get(runId);
  if (!state) return;
  const text = stripAnsi(raw);
  if (!text) return;
  const entry: PipelineLogEntry = { timestamp: Date.now(), step, stream: streamType, text, iteration: state.iteration };
  if (toolCallId) entry.toolCallId = toolCallId;
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_LINES) {
    state.logs = state.logs.slice(-MAX_LOG_LINES);
  }
  broadcast(runId, { type: "log", entry });
}

/** Get the step timing key — iteration-suffixed for coding/reviewing, plain for worktree/merging */
function stepTimingKey(step: PipelineStep, iteration: number): string {
  if (step === "coding" || step === "reviewing") {
    return `${step}-${iteration}`;
  }
  return step;
}

function setRunStatus(runId: string, status: PipelineStatus, step: PipelineStep | null, reviewScore?: number | null) {
  const state = runs.get(runId);
  if (!state) return;

  const now = Date.now();
  const prevKey = state.currentStep ? stepTimingKey(state.currentStep, state.iteration) : null;
  const nextKey = step ? stepTimingKey(step, state.iteration) : null;

  // End previous step if transitioning to a different step
  if (prevKey && prevKey !== nextKey && state.stepTimings[prevKey] && state.stepTimings[prevKey].endedAt == null) {
    state.stepTimings[prevKey].endedAt = now;
  }
  // Start new step if it hasn't been started yet
  if (nextKey && !state.stepTimings[nextKey]) {
    state.stepTimings[nextKey] = { startedAt: now, endedAt: null };
  }
  // End current step if pipeline is finishing (step becomes null)
  if (!step && prevKey && state.stepTimings[prevKey] && state.stepTimings[prevKey].endedAt == null) {
    state.stepTimings[prevKey].endedAt = now;
  }

  state.status = status;
  state.currentStep = step;
  if (reviewScore !== undefined) state.reviewScore = reviewScore;
  broadcast(runId, { type: "status", status, currentStep: step, reviewScore: state.reviewScore, stepTimings: state.stepTimings, iteration: state.iteration, maxRetries: state.maxRetries });
}

async function updateDb(runId: string, fields: Record<string, unknown>) {
  const state = runs.get(runId);
  const update = state ? { ...fields, step_timings: state.stepTimings } : fields;
  await getSupabase().from("pipeline_runs").update(update).eq("id", runId);
}

async function persistLogs(runId: string) {
  const state = runs.get(runId);
  if (!state) return;
  await getSupabase().from("pipeline_runs").update({ logs: state.logs, step_timings: state.stepTimings }).eq("id", runId);
}

function parseReviewJson(raw: string | undefined | null): { score: number; summary: string; issues: string[] } | null {
  if (!raw) return null;
  // Try direct parse
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.score === "number") return parsed;
  } catch {}
  // Try extracting JSON from the last {...} block containing "score"
  const matches = raw.match(/\{[^{}]*"score"\s*:\s*\d+[^{}]*\}/g);
  if (matches) {
    // Use the last match (most likely the final output)
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(matches[i]);
        if (typeof parsed.score === "number") return parsed;
      } catch {}
    }
  }
  // Try extracting from markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (typeof parsed.score === "number") return parsed;
    } catch {}
  }
  return null;
}

async function consumeAgentStream(
  agentStream: AsyncIterable<import("node-claude-sdk").StreamMessage>,
  runId: string,
  step: PipelineStep,
  signal?: AbortSignal,
): Promise<{ resultMessage: import("node-claude-sdk").ResultMessage | null; resultText: string }> {
  return consumeAgentStreamGeneric(
    agentStream,
    (streamType, text, toolCallId) => pushLog(runId, step, streamType, text, toolCallId),
    signal,
  );
}

async function runReview(
  runId: string,
  worktreeCwd: string,
  specContent: string,
  baseCommit: string,
  ac: AbortController,
  knowledgeContext = "",
): Promise<{ score: number; summary: string; issues: string[] }> {
  pushLog(runId, "reviewing", "stdout", "Starting review agent (opus)...");

  const reviewPrompt = `You are reviewing code changes made by an automated coding agent. The changes were made to implement the following specification:
${knowledgeContext ? `\n<project-knowledge>\n${knowledgeContext}\n\nVerify implementation follows documented patterns. Flag any drift.\n</project-knowledge>\n` : ""}
<specification>
${specContent}
</specification>

Your task:
1. Run \`git diff ${baseCommit} HEAD\` to see all changes against the base branch
2. Read modified files to understand the full context
3. Evaluate: Does the implementation match the spec? Is the code quality good? Are there bugs or issues?
4. Score from 0-100 where:
   - 90-100: Excellent, production ready
   - 70-89: Good with minor issues
   - 50-69: Acceptable but needs improvement
   - Below 50: Significant problems

IMPORTANT: After your analysis, you MUST output your final evaluation as a JSON object on its own line in this exact format:
{"score": <number>, "summary": "<one sentence summary>", "issues": ["<issue 1>", "<issue 2>"]}

The JSON must be valid and parseable. Output it as the very last thing in your response.`;

  const reviewStream = stream(reviewPrompt, {
    model: "opus",
    cwd: worktreeCwd,
    allowedTools: ["Read", "Glob", "Grep", "Bash(git:*)"],
    permissionMode: "bypassPermissions",
    timeoutMs: 0,
    signal: ac.signal,
  });

  let reviewResult: { score: number; summary: string; issues: string[] } | null = null;

  const { resultMessage: resultMsg, resultText: reviewText } = await consumeAgentStream(reviewStream, runId, "reviewing", ac.signal);

  pushLog(runId, "reviewing", "stdout", `Review agent finished (subtype: ${resultMsg?.subtype ?? "none"})`);

  reviewResult = parseReviewJson(resultMsg?.result || reviewText);

  // If free-form parsing failed, retry with structured output to force valid JSON
  if (!reviewResult) {
    pushLog(runId, "reviewing", "stdout", "Retrying review with structured output...");

    const retryStream = stream(
      `Based on your previous review of the code changes, output your evaluation. Here is your review text for reference:\n\n${reviewText.slice(0, 4000)}`,
      {
        model: "haiku",
        cwd: worktreeCwd,
        allowedTools: [],
        permissionMode: "bypassPermissions",
        timeoutMs: 30_000,
        signal: ac.signal,
        jsonSchema: {
          type: "object",
          properties: {
            score: { type: "number", description: "Score from 0-100" },
            summary: { type: "string", description: "One sentence summary" },
            issues: { type: "array", items: { type: "string" }, description: "List of issues found" },
          },
          required: ["score", "summary", "issues"],
          additionalProperties: false,
        },
      }
    );

    for await (const msg of retryStream) {
      if (msg.type === "result" && msg.result) {
        reviewResult = parseReviewJson(msg.result);
      }
    }
  }

  if (!reviewResult) {
    pushLog(runId, "reviewing", "stderr", `Failed to parse review after retry. Raw: ${reviewText?.slice(0, 500) ?? "(empty)"}`);
    throw new Error("Review agent did not return valid JSON");
  }

  return reviewResult;
}

async function setSpecStatus(specificationId: string, status: "draft" | "pipeline" | "failed" | "cancelled" | "done") {
  await getSupabase()
    .from("specifications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", specificationId);
}

export async function startPipeline(
  runId: string,
  projectId: string,
  projectPath: string,
  specificationId: string,
  specContent: string,
  specTitle: string,
  threshold: number,
  maxRetries: number = 0
) {
  const ac = new AbortController();
  const state: PipelineState = {
    status: "pending",
    currentStep: null,
    reviewScore: null,
    stepTimings: {},
    logs: [],
    clients: runs.get(runId)?.clients ?? new Set(),
    abortController: ac,
    iteration: 1,
    maxRetries,
  };
  runs.set(runId, state);

  // Mark spec as in-pipeline
  await setSpecStatus(specificationId, "pipeline");

  const shortId = runId.slice(0, 8);
  const branchName = `pipeline/${shortId}`;

  const gitRoot = await resolveGitRoot(projectPath);

  // Compute relative path from git root to project (e.g., "packages/renlab")
  // so we can set the agent CWD to the correct subdir within the worktree
  const projectRelative = projectPath.startsWith(gitRoot)
    ? projectPath.slice(gitRoot.length).replace(/^\//, "")
    : "";

  const worktreeDir = `.claude/worktrees/pipeline-${shortId}`;
  const worktreeRoot = `${gitRoot}/${worktreeDir}`;
  // Agent CWD must point to the project subdir within the worktree, not the worktree root
  const worktreeCwd = projectRelative ? `${worktreeRoot}/${projectRelative}` : worktreeRoot;

  try {
    // --- Step 1: Create worktree ---
    setRunStatus(runId, "worktree", "worktree");
    await updateDb(runId, { status: "worktree", current_step: "worktree", worktree_branch: branchName, worktree_path: worktreeRoot });

    pushLog(runId, "worktree", "stdout", `Creating worktree: ${worktreeDir} (git root: ${gitRoot})`);

    // Ensure .claude/worktrees directory exists at git root
    await execInDir(gitRoot, "mkdir", ["-p", ".claude/worktrees"]);

    const wtResult = await execInDir(gitRoot, "git", [
      "worktree", "add", worktreeDir, "-b", branchName,
    ]);
    if (wtResult.code !== 0) {
      throw new Error(`Failed to create worktree: ${wtResult.stderr}`);
    }
    pushLog(runId, "worktree", "stdout", `Worktree created on branch ${branchName} (cwd: ${worktreeCwd})`);

    // Record the base commit so we can detect changes even if the agent commits
    const baseCommit = (await execInDir(worktreeRoot, "git", ["rev-parse", "HEAD"])).stdout.trim();

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Step 1.5: Retrieve knowledge context ---
    let knowledgeContext = "";
    const knowledgeExists = await hasKnowledgeBase(projectPath);

    if (knowledgeExists) {
      setRunStatus(runId, "retrieving", "retrieving");
      await updateDb(runId, { status: "retrieving", current_step: "retrieving", has_knowledge: true });

      try {
        pushLog(runId, "retrieving", "stdout", "Retrieving project knowledge...");

        const retrievalPrompt = `You are a knowledge retrieval agent. Given the specification below, find the most relevant docs from ./knowledge/ and output them in a <knowledge-context> block.

<specification>
${specContent}
</specification>

Read knowledge docs using Glob/Read. Output up to 5 most relevant docs as:
<knowledge-context>
## [Title] (category: [cat])
[content]
</knowledge-context>`;

        const retrievalStream = stream(retrievalPrompt, {
          model: "sonnet",
          cwd: worktreeCwd,
          allowedTools: ["Read", "Glob", "Grep"],
          permissionMode: "bypassPermissions",
          timeoutMs: 60_000,
          signal: ac.signal,
        });

        const { resultText } = await consumeAgentStream(retrievalStream, runId, "retrieving", ac.signal);

        // Extract <knowledge-context> block from result
        const ctxMatch = resultText.match(/<knowledge-context>([\s\S]*?)<\/knowledge-context>/);
        if (ctxMatch) {
          knowledgeContext = ctxMatch[0];
          pushLog(runId, "retrieving", "stdout", `Retrieved knowledge context (${knowledgeContext.length} chars).`);
        } else {
          // Fall back to simple file-based retrieval
          knowledgeContext = await getRelevantKnowledge(projectPath, specContent);
          if (knowledgeContext) {
            pushLog(runId, "retrieving", "stdout", `Fallback retrieval: ${knowledgeContext.length} chars.`);
          } else {
            pushLog(runId, "retrieving", "stdout", "No relevant knowledge found.");
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ac.signal.aborted) throw err;
        pushLog(runId, "retrieving", "stderr", `Knowledge retrieval failed (non-fatal): ${msg}`);
        // Non-fatal — continue without knowledge context
      }
    } else {
      await updateDb(runId, { has_knowledge: false });
    }

    if (ac.signal.aborted) throw new Error("Cancelled");

    // --- Steps 2 & 3: Coding + Review retry loop ---
    const totalAttempts = maxRetries + 1;
    let lastReviewResult: { score: number; summary: string; issues: string[] } | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      // End the previous iteration's step timing before bumping the iteration counter,
      // so setRunStatus computes the correct timing key (e.g. "reviewing-1" not "reviewing-2")
      if (attempt > 1 && state.currentStep) {
        const prevKey = stepTimingKey(state.currentStep, state.iteration);
        if (state.stepTimings[prevKey] && state.stepTimings[prevKey].endedAt == null) {
          state.stepTimings[prevKey].endedAt = Date.now();
        }
      }
      state.iteration = attempt;
      await updateDb(runId, { iterations: attempt });

      // Track the commit at the start of this iteration for no-changes detection
      const iterationBaseCommit = (await execInDir(worktreeRoot, "git", ["rev-parse", "HEAD"])).stdout.trim();

      // --- Coding step ---
      setRunStatus(runId, "coding", "coding");
      await updateDb(runId, { status: "coding", current_step: "coding" });

      if (attempt === 1) {
        pushLog(runId, "coding", "stdout", "Starting coding agent (opus)...");

        const codingPrompt = `You are implementing a feature in an isolated git worktree. Your working directory is already set to the correct project location within the worktree.

CRITICAL: You MUST only read and write files within your current working directory. NEVER access files outside the worktree (e.g., do not navigate to parent directories or use absolute paths pointing to the main repository). All file paths should be relative to your cwd or absolute paths within: ${worktreeCwd}

Read the codebase first to understand the existing patterns, then implement all the changes described in the spec.
${knowledgeContext ? `\n<project-knowledge>\n${knowledgeContext}\n</project-knowledge>\n` : ""}
<specification>
${specContent}
</specification>

Implement this specification completely. Make all necessary file changes. Follow existing code patterns and conventions in the project.`;

        const codingStream = stream(codingPrompt, {
          model: "opus",
          cwd: worktreeCwd,
          permissionMode: "bypassPermissions",
          timeoutMs: 0,
          signal: ac.signal,
        });

        await consumeAgentStream(codingStream, runId, "coding", ac.signal);
      } else {
        pushLog(runId, "coding", "stdout", `Starting coding agent retry (iteration ${attempt}/${totalAttempts})...`);

        const feedbackBlock = lastReviewResult != null
          ? `<review-feedback>
Summary: ${lastReviewResult.summary}
Issues:
${lastReviewResult.issues.map(i => `- ${i}`).join('\n')}
</review-feedback>`
          : `<review-feedback>
The previous iteration did not produce reviewable changes. Please re-read the specification and try a different approach.
</review-feedback>`;

        const retryPrompt = `You are improving an existing implementation in a git worktree. A reviewer has rejected your previous changes.
${knowledgeContext ? `\n<project-knowledge>\n${knowledgeContext}\n</project-knowledge>\n` : ""}
<specification>
${specContent}
</specification>

${feedbackBlock}

Fix the issues identified by the reviewer. The codebase already contains your previous implementation — read the relevant files and make targeted improvements. Do NOT start over from scratch.`;

        const codingStream = stream(retryPrompt, {
          model: "opus",
          cwd: worktreeCwd,
          permissionMode: "bypassPermissions",
          timeoutMs: 0,
          signal: ac.signal,
        });

        await consumeAgentStream(codingStream, runId, "coding", ac.signal);
      }

      pushLog(runId, "coding", "stdout", "Coding agent completed.");

      // Stage and commit any uncommitted changes the agent left behind
      // Git operations run from worktree root (not the project subdir)
      const addResult = await execInDir(worktreeRoot, "git", ["add", "-A"]);
      if (addResult.code !== 0) {
        pushLog(runId, "coding", "stderr", `git add failed: ${addResult.stderr}`);
      }

      const diffCheck = await execInDir(worktreeRoot, "git", ["diff", "--cached", "--quiet"]);
      if (diffCheck.code !== 0) {
        // There are uncommitted changes — commit them
        const commitMsg = attempt === 1
          ? `"Implement: ${specTitle.replace(/"/g, '\\"')}"`
          : `"Retry ${attempt}: ${specTitle.replace(/"/g, '\\"')}"`;
        const commitResult = await execInDir(worktreeRoot, "git", [
          "commit", "-m", commitMsg,
        ]);
        if (commitResult.code !== 0) {
          throw new Error(`git commit failed: ${commitResult.stderr}`);
        }
        pushLog(runId, "coding", "stdout", "Changes committed.");
      }

      // Check if this iteration produced any new changes (compare against
      // the commit at the start of this iteration, not the original base)
      const currentCommit = (await execInDir(worktreeRoot, "git", ["rev-parse", "HEAD"])).stdout.trim();
      if (currentCommit === iterationBaseCommit) {
        pushLog(runId, "coding", "stderr", `Iteration ${attempt} produced no changes — skipping review.`);
        continue;
      }
      pushLog(runId, "coding", "stdout", `Branch has ${currentCommit.slice(0, 8)} vs base ${baseCommit.slice(0, 8)}.`);

      if (ac.signal.aborted) throw new Error("Cancelled");

      // --- Review step ---
      setRunStatus(runId, "reviewing", "reviewing");
      await updateDb(runId, { status: "reviewing", current_step: "reviewing" });

      let reviewResult: { score: number; summary: string; issues: string[] };
      try {
        reviewResult = await runReview(runId, worktreeCwd, specContent, baseCommit, ac, knowledgeContext);
      } catch (reviewErr) {
        // Re-throw cancellations — they must propagate to the outer catch
        if (ac.signal.aborted) throw reviewErr;
        const reviewErrMsg = reviewErr instanceof Error ? reviewErr.message : String(reviewErr);
        pushLog(runId, "reviewing", "stderr", `Review parse failure: ${reviewErrMsg}`);

        if (attempt < totalAttempts) {
          pushLog(runId, "reviewing", "stderr", `Continuing to next iteration (${attempt + 1}/${totalAttempts})...`);
          continue;
        }

        // Final iteration — retry the review once more before giving up
        pushLog(runId, "reviewing", "stdout", "Final iteration: retrying review one more time...");
        try {
          reviewResult = await runReview(runId, worktreeCwd, specContent, baseCommit, ac, knowledgeContext);
        } catch (retryErr) {
          if (ac.signal.aborted) throw retryErr;
          pushLog(runId, "reviewing", "stderr", `Review retry also failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
          break;
        }
      }
      lastReviewResult = reviewResult;

      const score = reviewResult.score;
      pushLog(runId, "reviewing", "stdout", `Review score: ${score}/100`);
      pushLog(runId, "reviewing", "stdout", `Summary: ${reviewResult.summary}`);
      if (reviewResult.issues.length > 0) {
        pushLog(runId, "reviewing", "stdout", `Issues:\n${reviewResult.issues.map((i: string) => `  - ${i}`).join("\n")}`);
      }

      setRunStatus(runId, "reviewing", "reviewing", score);
      await updateDb(runId, { review_score: score });

      if (ac.signal.aborted) throw new Error("Cancelled");

      // Check if score passes threshold
      if (score >= threshold) {
        break; // Proceed to merge
      }

      // Score below threshold — retry or fail
      if (attempt < totalAttempts) {
        pushLog(runId, "reviewing", "stderr", `Review rejected (score ${score}). Starting retry ${attempt + 1}/${totalAttempts}...`);
      }
    }

    const finalScore = lastReviewResult?.score ?? null;

    // --- Step 4: Merge (if score >= threshold) or reject/fail ---
    if (finalScore != null && finalScore >= threshold) {
      setRunStatus(runId, "merging", "merging");
      await updateDb(runId, { status: "merging", current_step: "merging" });

      pushLog(runId, "merging", "stdout", `Score ${finalScore} >= threshold ${threshold}, merging...`);

      const mergeResult = await execInDir(gitRoot, "git", [
        "merge", "--no-ff", branchName, "-m", `"Pipeline: ${specTitle.replace(/"/g, '\\"')}"`,
      ]);
      if (mergeResult.code !== 0) {
        throw new Error(`Merge failed: ${mergeResult.stderr}`);
      }

      pushLog(runId, "merging", "stdout", "Merge successful!");

      // --- Step 5: Update knowledge base (after merge, before success) ---
      if (knowledgeExists) {
        try {
          setRunStatus(runId, "updating", "updating");
          await updateDb(runId, { status: "updating", current_step: "updating" });

          pushLog(runId, "updating", "stdout", "Updating knowledge base...");

          // Get diff summary from merge
          const diffStat = (await execInDir(gitRoot, "git", ["diff", "--stat", `${baseCommit}..HEAD`])).stdout;
          const fullDiff = (await execInDir(gitRoot, "git", ["diff", `${baseCommit}..HEAD`])).stdout;
          const truncatedDiff = fullDiff.slice(0, 50_000);

          const updatePrompt = `You are a knowledge base maintenance agent. A pipeline just merged changes for the specification below. Update ./knowledge/ to reflect these changes.

<specification>
${specContent}
</specification>

<diff-summary>
${diffStat}
</diff-summary>

<full-diff>
${truncatedDiff}
</full-diff>

Instructions:
1. Read existing knowledge docs in ./knowledge/
2. Update component docs for changed files
3. Create new docs for significantly new files/modules
4. Update architecture docs if project structure changed
5. Add a decision log entry in knowledge/decisions/ if new patterns were introduced
6. Update frontmatter: lastUpdated, relatedSpecs, pipelineRunId, confidence (set to 85 for pipeline-confirmed docs)
7. Update meta.json files if you created new docs

Keep docs concise (30-80 lines). Focus on WHAT and WHY.`;

          const updateStream = stream(updatePrompt, {
            model: "sonnet",
            cwd: projectPath,
            permissionMode: "bypassPermissions",
            timeoutMs: 0,
            signal: ac.signal,
          });

          await consumeAgentStream(updateStream, runId, "updating", ac.signal);

          // Commit knowledge changes if any
          await execInDir(projectPath, "git", ["add", "knowledge/"]);
          const knowledgeDiffCheck = await execInDir(projectPath, "git", ["diff", "--cached", "--quiet", "--", "knowledge/"]);
          let knowledgeCommitSha: string | null = null;
          if (knowledgeDiffCheck.code !== 0) {
            const commitResult = await execInDir(projectPath, "git", [
              "commit", "-m", `Knowledge: update docs for ${specTitle.replace(/"/g, '\\"')}`,
            ]);
            if (commitResult.code === 0) {
              const { stdout: sha } = await execInDir(projectPath, "git", ["rev-parse", "HEAD"]);
              knowledgeCommitSha = sha.trim();
              pushLog(runId, "updating", "stdout", `Knowledge docs committed: ${knowledgeCommitSha?.slice(0, 8)}`);
            }
          } else {
            pushLog(runId, "updating", "stdout", "No knowledge changes to commit.");
          }

          // Insert knowledge_updates row
          await getSupabase().from("knowledge_updates").insert({
            project_id: projectId,
            pipeline_run_id: runId,
            type: "pipeline",
            docs_created: 0,
            docs_updated: 1,
            commit_sha: knowledgeCommitSha,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (ac.signal.aborted) throw err;
          pushLog(runId, "updating", "stderr", `Knowledge update failed (non-fatal): ${msg}`);
          // Non-fatal — still set pipeline to success
        }
      }

      setRunStatus(runId, "success", null);
      await updateDb(runId, { status: "success", finished_at: new Date().toISOString() });
      await setSpecStatus(specificationId, "done");
    } else {
      // maxRetries=0 (single-pass, no retry loop) → "failed"; maxRetries>=1 → "rejected"
      const finalStatus: PipelineStatus = maxRetries === 0 ? "failed" : "rejected";
      const errorMsg = finalScore != null
        ? `Review score ${finalScore} below threshold ${threshold} after ${state.iteration} iteration(s)`
        : `Review parse failure after ${state.iteration} iteration(s)`;
      const exhaustionSuffix = maxRetries > 0 ? " All retries exhausted." : "";
      pushLog(runId, "reviewing", "stderr", `${errorMsg}.${exhaustionSuffix}`);
      setRunStatus(runId, finalStatus, null, finalScore);
      await updateDb(runId, { status: finalStatus, error_message: errorMsg, finished_at: new Date().toISOString() });
      await setSpecStatus(specificationId, "failed");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isCancelled = message === "Cancelled" || ac.signal.aborted;
    const finalStatus: PipelineStatus = isCancelled ? "cancelled" : "failed";

    pushLog(runId, state.currentStep ?? "worktree", "stderr", `Pipeline ${finalStatus}: ${message}`);
    setRunStatus(runId, finalStatus, null);
    await updateDb(runId, {
      status: finalStatus,
      error_message: isCancelled ? "Cancelled by user" : message,
      finished_at: new Date().toISOString(),
    });
    await setSpecStatus(specificationId, isCancelled ? "cancelled" : "failed");
  } finally {
    if (state.status === "success") {
      pushLog(runId, state.currentStep ?? "worktree", "stdout", "Cleaning up worktree...");
      await execInDir(gitRoot, "git", ["worktree", "remove", worktreeDir, "--force"]).catch(() => {});
      await execInDir(gitRoot, "git", ["branch", "-D", branchName]).catch(() => {});
    } else {
      pushLog(runId, state.currentStep ?? "worktree", "stdout", `Worktree preserved for inspection: ${worktreeRoot}`);
    }
    await persistLogs(runId).catch(() => {});
  }
}

export function retryMerge(
  runId: string,
  gitRoot: string,
  branchName: string,
  worktreePath: string,
  specTitle: string,
  dbRun: { review_score: number | null; step_timings: StepTimings; logs: PipelineLogEntry[]; iterations?: number; max_retries?: number },
) {
  const shortId = runId.slice(0, 8);
  const worktreeDir = `.claude/worktrees/pipeline-${shortId}`;

  // Initialize in-memory state (preserve existing clients for SSE)
  const existing = runs.get(runId);
  const state: PipelineState = {
    status: "merging",
    currentStep: "merging",
    reviewScore: dbRun.review_score,
    stepTimings: dbRun.step_timings,
    logs: dbRun.logs,
    clients: existing?.clients ?? new Set(),
    abortController: new AbortController(),
    iteration: dbRun.iterations ?? 1,
    maxRetries: dbRun.max_retries ?? 0,
  };
  runs.set(runId, state);

  // Set status to merging and broadcast
  setRunStatus(runId, "merging", "merging");

  async function execute() {
    await updateDb(runId, { status: "merging", current_step: "merging", error_message: null, finished_at: null });

    pushLog(runId, "merging", "stdout", "Retrying merge...");

    try {
      const mergeResult = await execInDir(gitRoot, "git", [
        "merge", "--no-ff", branchName, "-m", `"Pipeline: ${specTitle.replace(/"/g, '\\"')}"`,
      ]);
      if (mergeResult.code !== 0) {
        throw new Error(`Merge failed: ${mergeResult.stderr}`);
      }

      pushLog(runId, "merging", "stdout", "Merge successful!");

      setRunStatus(runId, "success", null);
      await updateDb(runId, { status: "success", finished_at: new Date().toISOString() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      pushLog(runId, "merging", "stderr", `Merge retry failed: ${message}`);
      setRunStatus(runId, "failed", null);
      await updateDb(runId, {
        status: "failed",
        current_step: "merging",
        error_message: message,
        finished_at: new Date().toISOString(),
      });
    } finally {
      if (state.status === "success") {
        pushLog(runId, state.currentStep ?? "merging", "stdout", "Cleaning up worktree...");
        await execInDir(gitRoot, "git", ["worktree", "remove", worktreeDir, "--force"]).catch(() => {});
        await execInDir(gitRoot, "git", ["branch", "-D", branchName]).catch(() => {});
      } else {
        pushLog(runId, state.currentStep ?? "merging", "stdout", `Worktree preserved for inspection: ${worktreePath}`);
      }
      await persistLogs(runId).catch(() => {});
    }
  }

  // Fire and forget — SSE stream delivers progress to connected clients
  execute().catch(() => {});
}

/** Abort the in-memory pipeline. Returns true if the run was found in memory. */
export function cancelPipeline(runId: string): boolean {
  const state = runs.get(runId);
  if (!state) return false;
  state.abortController.abort();
  return true;
}

export function getPipelineStatus(runId: string): { status: PipelineStatus; currentStep: PipelineStep | null; reviewScore: number | null; stepTimings: StepTimings; iteration: number; maxRetries: number } {
  const state = runs.get(runId);
  if (!state) return { status: "pending", currentStep: null, reviewScore: null, stepTimings: {}, iteration: 1, maxRetries: 0 };
  return { status: state.status, currentStep: state.currentStep, reviewScore: state.reviewScore, stepTimings: state.stepTimings, iteration: state.iteration, maxRetries: state.maxRetries };
}

export async function getPipelineStatusFromDb(runId: string): Promise<{ status: PipelineStatus; currentStep: PipelineStep | null; reviewScore: number | null; stepTimings: StepTimings; iteration: number; maxRetries: number }> {
  const { data } = await getSupabase().from("pipeline_runs").select("status, current_step, review_score, step_timings, iterations, max_retries").eq("id", runId).single();
  if (!data) return { status: "pending", currentStep: null, reviewScore: null, stepTimings: {}, iteration: 1, maxRetries: 0 };
  return { status: data.status, currentStep: data.current_step, reviewScore: data.review_score, stepTimings: (data.step_timings as StepTimings) ?? {}, iteration: (data.iterations as number) ?? 1, maxRetries: (data.max_retries as number) ?? 0 };
}

export function getBufferedLogs(runId: string): PipelineLogEntry[] {
  const state = runs.get(runId);
  if (!state) return [];
  return [...state.logs];
}

export async function getBufferedLogsFromDb(runId: string): Promise<PipelineLogEntry[]> {
  const { data } = await getSupabase().from("pipeline_runs").select("logs").eq("id", runId).single();
  if (!data?.logs) return [];
  return data.logs as PipelineLogEntry[];
}

export function addClient(runId: string, callback: (event: PipelineSSEEvent) => void): () => void {
  let state = runs.get(runId);
  if (!state) {
    state = {
      status: "pending",
      currentStep: null,
      reviewScore: null,
      stepTimings: {},
      logs: [],
      clients: new Set(),
      abortController: new AbortController(),
      iteration: 1,
      maxRetries: 0,
    };
    runs.set(runId, state);
  }
  state.clients.add(callback);
  return () => {
    state!.clients.delete(callback);
  };
}
