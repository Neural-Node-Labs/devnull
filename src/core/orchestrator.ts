import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { LlmClient, LlmMessage, ReActStep, TelemetryInterface, LoadedSkill, Phase, LlmUsage } from "./types.js";
import { SkillRegistry } from "./skillRegistry.js";
import { TOOL_SCHEMAS } from "../tools/toolSchemas.js";
import { dispatchToolCall } from "../tools/toolDispatcher.js";
import { buildProtocolPrompt, writeTodo, appendTodoReview } from "./protocol.js";
import { validateGoal, buildObservationTranscript } from "./goalValidator.js";
import {
  Spinner,
  reportThought,
  reportAction,
  reportObservation,
  reportSubagentStart,
  reportUsage,
  reportTotalUsage,
  reportHealthWarning,
  reportPhaseStats,
} from "./consoleReporter.js";
import { compactStaleFileReads } from "./contextCompaction.js";
import { createHealthState, scoreStep, rollingHealth, HealthState } from "./stepScorer.js";
import { appendTaskHistory } from "./taskHistory.js";
import { PostgresTaskHistory } from "./postgresTaskHistory.js";
import { PhaseReportStore } from "../api/phaseReportStore.js";
import { WbsStore } from "../api/wbsStore.js";
import { prepareWorkspace } from "./workspaceManager.js";

export interface OrchestratorOptions {
  maxIterations?: number; // "iteration maxout" ceiling per round
  cwd?: string;
  planMode?: "auto" | "always" | "never"; // "auto": plan mode kicks in for multi-skill/complex tasks
  validateGoal?: boolean; // independent second-agent audit before accepting completion (default: true)
  maxValidatorRetries?: number; // how many times a rejected claim gets sent back before giving up (default: 2)
  /**
   * When false, the orchestrator skips all interactive stdin prompts (plan approval, iteration
   * limit continuation). Plan mode still generates the plan and writes todo.md, but auto-approves
   * it. Iteration limit auto-continues. Set this for API/CI contexts where no TTY is available.
   * Defaults to true (interactive prompts enabled).
   */
  interactive?: boolean;
  /**
   * When true, the orchestrator auto-continues past the iteration limit instead of stopping.
   * Used by the API when the UI sends continueOnLimit: true. Overrides onIterationLimitReached.
   */
  continueOnLimit?: boolean;
  /**
   * Called when the iteration ceiling is hit and more work is needed. Return true to reset the
   * counter and continue, false to stop. Defaults to an interactive stdin yes/no prompt. Inject
   * this for automated diagnostics/CI where no TTY is available, or to log/audit every restart
   * decision (see src/core/liveDiagnostics.ts diagnostic #2).
   */
  onIterationLimitReached?: (taskDescription: string, iterationsSoFar: number) => Promise<boolean>;
  /**
   * Live console reporting: a spinner while waiting on the LLM, plus Thought/Action/Observation
   * lines printed as each ReAct step happens (in addition to telemetry, which already records
   * everything — this is purely for a human watching the terminal). Default: true.
   */
  consoleThoughts?: boolean;
  /** Internal — nesting depth used to indent subagent console output. Do not set directly. */
  consoleIndent?: number;
  /**
   * When true (default), collapses stale/superseded read_tool Observations (earlier full-file
   * snapshots of a path that's since been re-read or edited) down to a short placeholder
   * instead of keeping every historical copy in context — see src/core/contextCompaction.ts
   * for exactly what is and isn't touched, and why. Set fullContextToken to true to keep the
   * full history (the old default behavior).
   */
  leanToken?: boolean;
  /**
   * When true, keeps every historical copy of read_tool file snapshots in context instead of
   * collapsing stale/superseded ones (the default lean-token behavior). Set this to opt out
   * of context compaction and preserve the full read history. Default: false.
   */
  fullContextToken?: boolean;
  /**
   * When true (default), scores each tool step heuristically (see stepScorer.ts) and, if the
   * rolling average drops low, injects a one-time nudge into context asking the model to
   * reconsider its approach instead of continuing down a stuck path. Purely heuristic — no
   * extra LLM calls, no added cost/latency.
   */
  selfHealing?: boolean;
  /**
   * When true, tool operations (read/write/run_command/glob/grep/etc.) run against an isolated
   * copy of the project at <cwd>/workspace-agent/ instead of the live project directory — see
   * workspaceManager.ts. Protocol, lessons, task history, and todo.md still read/write at the
   * original project root regardless, since those are meant to persist across resets rather
   * than live inside the disposable copy. Default: false.
   */
  isolatedWorkspace?: boolean;
  /** Internal — lets subagents inherit the real project root for protocol/history/todo even
   *  when their `cwd` points at an already-isolated workspace-agent copy. Do not set directly. */
  projectRoot?: string;
  /**
   * When true, disables phase-based planning and runs as a single ReAct loop instead.
   * Phase planning (default ON) divides the task into multiple phases, each running as a
   * sub-orchestrator with isolated ReAct memory. Results from completed phases are summarized
   * and passed to the next phase. This reduces per-phase token footprint at the cost of losing
   * cross-phase context continuity. See enhancement/planning.md.
   * Default: false (phase planning is ON).
   */
  singlePhase?: boolean;
}

export interface RunOptions {
  skipPlanMode?: boolean; // true for subagent runs — subagents don't re-enter plan mode
  isSubagent?: boolean;
}

const READ_ONLY_TOOLS = new Set(["glob_tool", "grep_tool", "read_tool"]);
const ACTION_TOOLS = new Set(["write_edit_tool", "ssh_tool", "schedule_task_tool", "docker_deploy_ssh_tool"]);
const VALIDATION_TOOLS = new Set(["playwright_run_tool"]);
const GITHUB_READ_ACTIONS = new Set(["clone", "fetch", "pull", "status"]);
const VALIDATION_COMMANDS = /\b(test|lint|type-?check|tsc|jest|pytest|kubectl (apply|rollout)|docker build|docker compose|playwright)\b/i;

/**
 * Drives the full ReAct loop with real tool execution, under the devnull.md engineering
 * protocol (Plan Mode, Subagent Strategy, Verification Before Done, etc — see agent/devnull.md):
 *
 *   Plan Mode (if triggered) -> write tasks/todo.md -> confirm with user before proceeding
 *   Search phase      -> Thought -> Action(glob/grep/read) -> Observation
 *   Action phase      -> Thought -> Action(write/edit/ssh/deploy/...) -> Observation
 *   Validation phase  -> Thought -> Action(run_command/playwright_run) -> Observation -> decide
 *
 * subagent_tool is intercepted before generic dispatch: it spins a fresh ReActOrchestrator.run()
 * with skipPlanMode=true and returns only the final text summary — the sub-agent's own tool
 * calls and reasoning never enter the parent's message history, keeping context clean per the
 * "Subagent Strategy" directive.
 */
export class ReActOrchestrator {
  private registry = new SkillRegistry();
  private cwd: string; // tool-execution root; becomes workspace-agent/ when isolatedWorkspace is on
  private projectRoot: string; // protocol/lessons/history/todo always live here, never inside workspace-agent

  /** Running total for this orchestrator instance, including every LLM call it made directly
   *  (main loop, goal validation, plan generation) plus everything its subagents used — see
   *  runSubagent(), which folds each subagent's total into its parent's before returning. */
  private cumulativeUsage: LlmUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0, cachedTokens: 0 };
  private llmCallCount = 0;
  private health: HealthState = createHealthState();
  private lastNudgeIteration = -Infinity;
  private lastOutcome: "completed" | "iteration_limit" | "plan_rejected" = "completed";

  /** How the most recent run() call ended. "completed" means a genuine final answer was
   *  reached; anything else means the returned text is a fallback explanation, not a real
   *  result, and callers (e.g. the API) should surface that distinction rather than treating
   *  it as a normal success. */
  getLastOutcome(): "completed" | "iteration_limit" | "plan_rejected" {
    return this.lastOutcome;
  }

  /** Read-only view of this run's rolling self-healing health score (0-100, 100 = no signal yet). */
  getHealthScore(window = 5): number {
    return rollingHealth(this.health, window);
  }

  constructor(
    private llm: LlmClient,
    private telemetry: TelemetryInterface,
    private opts: OrchestratorOptions = {}
  ) {
    this.cwd = opts.cwd ?? process.cwd();
    this.projectRoot = opts.projectRoot ?? this.cwd;
  }

  /** The effective tool-execution root for this run — the isolated workspace-agent copy when
   *  isolatedWorkspace is on, otherwise the project root itself. Useful for callers (e.g. the
   *  API's download endpoint) that need to know where the agent actually wrote its output. */
  getWorkspacePath(): string {
    return this.cwd;
  }

  /** Read-only view of this run's cumulative token usage (includes subagent usage). */
  getCumulativeUsage(): LlmUsage {
    return { ...this.cumulativeUsage };
  }

  private addUsage(usage: LlmUsage | undefined): void {
    if (!usage) return;
    this.llmCallCount += 1;
    this.cumulativeUsage.promptTokens += usage.promptTokens;
    this.cumulativeUsage.completionTokens += usage.completionTokens;
    this.cumulativeUsage.totalTokens += usage.totalTokens;
    this.cumulativeUsage.reasoningTokens = (this.cumulativeUsage.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0);
    this.cumulativeUsage.cachedTokens = (this.cumulativeUsage.cachedTokens ?? 0) + (usage.cachedTokens ?? 0);
  }

  /** Folds a subagent's own cumulative usage (and call count) into this instance's total. */
  private absorbSubagentUsage(sub: ReActOrchestrator): void {
    const subUsage = sub.getCumulativeUsage();
    this.cumulativeUsage.promptTokens += subUsage.promptTokens;
    this.cumulativeUsage.completionTokens += subUsage.completionTokens;
    this.cumulativeUsage.totalTokens += subUsage.totalTokens;
    this.cumulativeUsage.reasoningTokens = (this.cumulativeUsage.reasoningTokens ?? 0) + (subUsage.reasoningTokens ?? 0);
    this.cumulativeUsage.cachedTokens = (this.cumulativeUsage.cachedTokens ?? 0) + (subUsage.cachedTokens ?? 0);
    this.llmCallCount += sub.llmCallCount;
  }

  /** Route the task to one or more skills (multi-skill composition via composes_with). */
  selectSkills(taskDescription: string): LoadedSkill[] {
    const headers = this.registry.route(taskDescription);
    const primary = headers[0];
    if (!primary) return [];

    const names = new Set<string>([primary.name, ...primary.composes_with]);
    return [...names]
      .map((n) => this.registry.loadSkill(n))
      .filter((s): s is LoadedSkill => Boolean(s));
  }

  async run(taskDescription: string, runOpts: RunOptions = {}): Promise<string> {
    this.lastOutcome = "completed";
    if (this.opts.isolatedWorkspace && !runOpts.isSubagent) {
      this.cwd = prepareWorkspace(this.projectRoot);
    }

    const skills = this.selectSkills(taskDescription);
    const maxIterations = this.opts.maxIterations ?? 20;

    const indent = this.opts.consoleIndent ?? 0;
    const headerPrefix = indent > 0 ? "  ".repeat(indent) : "";
    console.log(`${headerPrefix}\n--- Running task: "${taskDescription}" ---\n${headerPrefix} (maxIterations=${maxIterations}, planMode=${this.opts.planMode ?? "auto"}, validateGoal=${this.opts.validateGoal ?? true})\n`);
    if (this.opts.isolatedWorkspace && !runOpts.isSubagent) {
      console.log(`${headerPrefix}Operating in isolated workspace: ${this.cwd}\n`);
    }

    if (!runOpts.isSubagent) {
      if (skills.length === 0) {
        console.log("No matching skill found for this task. Proceeding with base ReAct loop only.");
      } else {
        console.log(`Loaded skills: ${skills.map((s) => s.header.name).join(", ")}`);
      }
    }

    // --- Plan Mode ---
    // "Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)."
    // Heuristic for "non-trivial": multiple skills routed (implies cross-cutting work).
    const shouldPlan =
      !runOpts.skipPlanMode &&
      (this.opts.planMode === "always" || (this.opts.planMode !== "never" && skills.length >= 2));

    if (shouldPlan) {
      const proceed = await this.runPlanMode(taskDescription, skills);
      if (!proceed) {
        console.log("Plan rejected. Stopping.");
        this.lastOutcome = "plan_rejected";
        return "(No changes were made — the generated plan was not approved before execution.)";
      }
    }

    // --- Phase Planning ---
    // When phasePlanning is enabled, the task is divided into multiple phases, each running as
    // a sub-orchestrator with isolated ReAct memory. Results from completed phases are summarized
    // and passed to the next phase. This reduces per-phase token footprint at the cost of losing
    // cross-phase context continuity. See enhancement/planning.md.
    if (!this.opts.singlePhase && !runOpts.isSubagent) {
      return await this.runPhasePlanning(taskDescription, skills, runOpts);
    }

    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt(skills, this.projectRoot) },
      { role: "user", content: taskDescription },
    ];

    let iteration = 0;
    let finalContent = "";
    let validatorRejections = 0;
    let restartCount = 0;
    const maxValidatorRetries = this.opts.maxValidatorRetries ?? 2;
    const validationEnabled = this.opts.validateGoal !== false; // default true
    const showConsole = this.opts.consoleThoughts !== false; // default true

    while (true) {
      iteration += 1;

      if (iteration > maxIterations) {
        if (runOpts.isSubagent) {
          // Subagents don't interactively prompt — they just stop and report what they have.
          finalContent = "(subagent hit iteration limit without completing)";
          break;
        }
        // continueOnLimit takes highest priority — auto-continue without asking
        const shouldContinue = this.opts.continueOnLimit
          ? true
          : this.opts.onIterationLimitReached
          ? await this.opts.onIterationLimitReached(taskDescription, iteration - 1)
          : await this.askContinue(taskDescription, maxIterations);
        await this.telemetry.logThought({
          iteration,
          phase: "validation",
          thought: `iteration limit reached (${maxIterations}); restart ${shouldContinue ? "approved" : "declined"}`,
          action: { tool: "iteration_limit_check", input: { maxIterations, priorRestarts: restartCount } },
          observation: { approved: shouldContinue },
        });
        if (!shouldContinue) {
          console.log("Stopping at user's request.");
          this.lastOutcome = "iteration_limit";
          // Always synthesize a proper report from the message history instead of
          // relying on finalContent (which may be empty or just a brief thought from
          // a tool-calling turn). This ensures the orchestrator NEVER returns an
          // empty or meaningless string — the user always gets a useful summary.
          finalContent = this.synthesizeReport(
            taskDescription,
            messages,
            finalContent,
            maxIterations,
            restartCount
          );
          break;
        }
        restartCount += 1;
        iteration = 1; // reset iteration count for another round
      }

      const spinner = new Spinner();
      if (showConsole) spinner.start(indent > 0 ? "Subagent thinking..." : "Thinking...");
      const response = await this.llm.complete(messages, { tools: TOOL_SCHEMAS });
      if (showConsole) spinner.stop();
      this.addUsage(response.usage);

      // Show the model's reasoning as soon as it's available. When there ARE tool calls this is
      // genuinely a mid-task thought (falls back to `content` if the model isn't in thinking mode
      // and didn't return reasoning_content separately). When there are none, `content` IS the
      // final answer and gets printed via its own path below — only show reasoningContent here
      // to avoid printing the same text twice.
      if (showConsole) {
        if (response.toolCalls.length > 0) {
          reportThought(response.reasoningContent ?? response.content, indent);
        } else if (response.reasoningContent) {
          reportThought(response.reasoningContent, indent);
        }
        reportUsage(response.usage, this.cumulativeUsage.totalTokens, indent);
      }

      if (response.toolCalls.length === 0) {
        // Candidate completion. Before accepting it, run it past an independent validator
        // (devnull.md "Verification Before Done") unless validation is disabled or exhausted.
        if (validationEnabled && validatorRejections < maxValidatorRetries) {
          const transcript = buildObservationTranscript(messages);
          const vSpinner = new Spinner();
          if (showConsole && !runOpts.isSubagent) vSpinner.start("Validating completion...");
          const verdict = await validateGoal(this.llm, taskDescription, transcript, response.content);
          if (showConsole && !runOpts.isSubagent) vSpinner.stop();
          this.addUsage(verdict.usage);
          if (showConsole && !runOpts.isSubagent) reportUsage(verdict.usage, this.cumulativeUsage.totalTokens, indent);

          // console.log(`iteration: ${iteration} thought: ${response.content} \naction: ${transcript} \nobservation:${verdict}` );
          await this.telemetry.logThought({
            iteration,
            phase: "validation",
            thought: deriveThought(response),
            action: { tool: "goal_validator", input: { transcript } },
            observation: verdict,
          });

          if (!verdict.valid) {
            validatorRejections += 1;
            if (!runOpts.isSubagent) {
              console.log(`\n[goal validator] Rejected (attempt ${validatorRejections}/${maxValidatorRetries}): ${verdict.reason}`);
            }
            // Feed the rejection back in as new context and let the agent try again.
            messages.push({ role: "assistant", content: response.content, tool_calls: response.toolCalls, reasoning_content: response.reasoningContent });
            messages.push({
              role: "user",
              content: `VALIDATION FAILED: An independent reviewer found your claimed completion is not supported by the recorded observations. Reason: "${verdict.reason}". Address this — either take the actions needed to actually satisfy the task, or correct your claim to match what the observations actually show. Then report completion again.`,
            });
            continue; // loop back into the ReAct cycle, does NOT count against maxIterations differently — still increments iteration
          }
        }

        await this.telemetry.logThought({ iteration, phase: "validation", thought: deriveThought(response) });
        if (validationEnabled && validatorRejections >= maxValidatorRetries) {
          await this.telemetry.logError(
            { reason: "validator retries exhausted, accepting claim unverified" },
            "goal_validator"
          );
          if (!runOpts.isSubagent) {
            console.log(`\n[goal validator] Retries exhausted (${validatorRejections}/${maxValidatorRetries}) — accepting final answer WITHOUT independent verification.`);
          }
        }
        if (!runOpts.isSubagent) console.log(response.content);
        finalContent = response.content;
        break;
      }

      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.toolCalls,
        reasoning_content: response.reasoningContent,
      });

      for (const call of response.toolCalls) {
        if (call.function.name === "subagent_tool") {
          const parsedArgs = safeParse(call.function.arguments);
          const subTaskLabel =
            parsedArgs && typeof parsedArgs === "object" && "task" in (parsedArgs as Record<string, unknown>)
              ? String((parsedArgs as Record<string, unknown>).task)
              : call.function.arguments;
          if (showConsole) reportSubagentStart(subTaskLabel, indent);

          const observation = await this.runSubagent(call.function.arguments);
          if (showConsole) reportObservation(observation, false, indent);
          await this.telemetry.logThought({
            iteration,
            phase: "search",
            thought: deriveThought(response),
            action: { tool: "subagent_tool", input: safeParse(call.function.arguments) },
            observation,
          });
          messages.push({ role: "tool", tool_call_id: call.id, name: "subagent_tool", content: JSON.stringify(observation) });
          continue;
        }

        const phase = classifyPhase(call.function.name, call.function.arguments);
        const step: ReActStep = {
          iteration,
          phase,
          thought: deriveThought(response),
          action: { tool: call.function.name, input: safeParse(call.function.arguments) },
        };

        if (showConsole) reportAction(step.action!.tool, step.action!.input, indent);
        const result = await dispatchToolCall(call, this.cwd);
        step.observation = result.observation;

        const selfHealingOn = this.opts.selfHealing !== false;
        if (selfHealingOn) {
          const { score } = scoreStep(this.health, {
            tool: result.toolName,
            args: step.action!.input,
            observation: result.observation,
            isError: result.isError,
          });
          step.score = score;
        }

        if (showConsole) reportObservation(result.observation, result.isError, indent, step.score);
        await this.telemetry.logThought(step);

        if (result.isError) {
          await this.telemetry.logError(result.observation, `tool:${result.toolName}`);
        }

        messages.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          name: result.toolName,
          content: JSON.stringify(result.observation),
        });

        // Context compaction (lean-token mode, default ON): a fresh read_tool or write_edit_tool
        // observation for a path makes any earlier read_tool observation of that same path stale
        // — collapse it. Set fullContextToken to true to keep the full history instead.
        // See contextCompaction.ts for exactly what this does.
        if (!this.opts.fullContextToken && (result.toolName === "read_tool" || result.toolName === "write_edit_tool")) {
          const args = step.action?.input as { filePath?: string } | undefined;
          if (args?.filePath) {
            compactStaleFileReads(messages, args.filePath, result.toolCallId);
          }
        }
      }
      // Loop continues: the new Observations go back in as context for the next Thought.

      if (this.opts.selfHealing !== false) {
        const avgHealth = rollingHealth(this.health);
        const cooldownPassed = iteration - this.lastNudgeIteration >= 3;
        if (avgHealth < 40 && cooldownPassed && this.health.scores.length >= 2) {
          this.lastNudgeIteration = iteration;
          if (showConsole) reportHealthWarning(avgHealth, indent);
          messages.push({
            role: "user",
            content: `[self-check] Your last several steps haven't been making much progress (rolling health score: ${avgHealth}/100 — errors and/or repeated identical actions with no new information). Before continuing: re-read the current state of whatever you're working on rather than assuming, double-check your last assumption was actually correct, and consider a genuinely different approach instead of retrying something similar.`,
          });
        }
      }
    }

    if (shouldPlan && !runOpts.isSubagent) {
      appendTodoReview(this.projectRoot, finalContent);
    }
    if (!runOpts.isSubagent) {
      const historyEntry = {
        task: taskDescription,
        summary: finalContent,
        iterations: iteration,
        totalTokens: this.cumulativeUsage.totalTokens || undefined,
      };
      appendTaskHistory(this.projectRoot, historyEntry);
      // Also persist to PostgreSQL (best-effort)
      const pgHistory = new PostgresTaskHistory();
      await pgHistory.append({
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        ...historyEntry,
      });
      await pgHistory.close();
    }
    if (showConsole && !runOpts.isSubagent) {
      reportTotalUsage(this.cumulativeUsage, this.llmCallCount, indent);
      if (this.health.scores.length > 0) {
        console.log(`${"  ".repeat(indent)}📈 Final health score: ${this.getHealthScore()}/100 (${this.health.scores.length} scored steps)`);
      }
    }
    return finalContent;
  }

  /**
   * Synthesizes a meaningful report from the message history when the orchestrator terminates
   * without a proper final answer (e.g., iteration limit hit while the model was still making
   * tool calls). This ensures the orchestrator NEVER returns an empty or meaningless string.
   *
   * The report includes:
   * - What was accomplished (tools called, files changed, observations made)
   * - What was left incomplete
   * - The last thought/state of the model
   * - A fallback message if nothing useful can be extracted
   */
  private synthesizeReport(
    taskDescription: string,
    messages: LlmMessage[],
    currentFinalContent: string,
    maxIterations: number,
    restartCount: number
  ): string {
    // If the model already produced a meaningful final answer (non-empty, not just a brief thought),
    // use it as-is. A "meaningful" answer is one that's longer than a typical mid-task thought
    // (e.g., "Reading file..." or "Step 1 thinking...") and doesn't end with "..." or "thinking..."
    if (currentFinalContent && currentFinalContent.length > 30) {
      const trimmed = currentFinalContent.trim();
      if (!trimmed.endsWith("...") && !trimmed.endsWith("thinking...") && !trimmed.endsWith("working...")) {
        return currentFinalContent;
      }
    }

    // Extract tool calls and observations from the message history to build a summary
    const toolActions: string[] = [];
    const observations: string[] = [];
    let lastThought = "";

    for (const msg of messages) {
      if (msg.role === "assistant" && msg.content) {
        lastThought = msg.content;
      }
      if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          try {
            const args = JSON.parse(tc.function.arguments);
            const argSummary = Object.keys(args).length > 0
              ? `(${Object.entries(args).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(", ")})`
              : "";
            toolActions.push(`${tc.function.name} ${argSummary}`);
          } catch {
            toolActions.push(tc.function.name);
          }
        }
      }
      if (msg.role === "tool" && msg.content) {
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        observations.push(content.slice(0, 200));
      }
    }

    // Build a structured report
    const parts: string[] = [];
    parts.push(`Task stopped: hit the ${maxIterations}-iteration limit${restartCount > 0 ? ` after ${restartCount} restart(s)` : ""} without reaching a final answer.`);

    if (toolActions.length > 0) {
      parts.push(`\n## What was done\n\nThe following ${toolActions.length} tool call(s) were made:\n${toolActions.map((a) => `- ${a}`).join("\n")}`);
    }

    if (lastThought) {
      parts.push(`\n## Last model thought\n\n${lastThought.slice(0, 500)}`);
    }

    if (observations.length > 0) {
      parts.push(`\n## Key observations\n\n${observations.slice(-3).map((o) => `- ${o}`).join("\n")}`);
    }

    parts.push(`\n## Next steps\n\nPartial progress may exist in the workspace. Check task_history_tool or the workspace files directly to see what was accomplished before continuing.`);

    return parts.join("\n");
  }

  /**
   * Delegates a focused task to a fresh orchestrator instance with isolated message history.
   * Only the final text summary is returned to the caller — matches "Subagent Strategy":
   * offload research/exploration to keep the main context window clean.
   */
  private async runSubagent(argsJson: string): Promise<{ summary: string }> {
    let task: string;
    try {
      task = JSON.parse(argsJson).task;
    } catch {
      return { summary: "subagent_tool error: invalid arguments" };
    }
    const sub = new ReActOrchestrator(this.llm, this.telemetry, {
      ...this.opts,
      cwd: this.cwd,
      projectRoot: this.projectRoot,
      consoleIndent: (this.opts.consoleIndent ?? 0) + 1,
    });
    const result = await sub.run(task, { skipPlanMode: true, isSubagent: true });
    this.absorbSubagentUsage(sub);
    return { summary: result };
  }

  /**
   * Generate a plan for the given task without executing it.
   * Returns the plan markdown string. Does NOT write to tasks/todo.md or prompt the user.
   * Used by the API's /chat/plan endpoint so the UI can display the plan for approval.
   */
  async generatePlan(taskDescription: string): Promise<string> {
    const skills = this.selectSkills(taskDescription);
    const skillContext = skills.length
      ? `\n\nThe following specialized skills are relevant to this task — let their guidance shape the plan's steps:\n\n${skills
          .map((s) => `## ${s.header.name} (${s.header.role})\n${s.body}`)
          .join("\n\n")}`
      : "";

    const planPrompt: LlmMessage[] = [
      {
        role: "system",
        content:
          buildProtocolPrompt(this.projectRoot) +
          "You are in Plan Mode. Do not call any tools. Produce a short, concrete, checkable " +
          "plan for the task below as a markdown checklist (`- [ ] step`), 3-8 steps. " +
          "No prose outside the checklist." +
          skillContext,
      },
      { role: "user", content: taskDescription },
    ];

    const response = await (async () => {
      const spinner = new Spinner();
      if (this.opts.consoleThoughts !== false) spinner.start("Drafting plan...");
      const res = await this.llm.complete(planPrompt);
      if (this.opts.consoleThoughts !== false) spinner.stop();
      return res;
    })();
    this.addUsage(response.usage);
    if (this.opts.consoleThoughts !== false) {
      reportUsage(response.usage, this.cumulativeUsage.totalTokens, this.opts.consoleIndent ?? 0);
    }
    return `# Plan: ${taskDescription}\n\n${response.content.trim()}\n`;
  }

  /**
   * Plan Mode: asks the LLM (no tools, plain completion) for a short numbered plan, writes it
   * to tasks/todo.md, shows it to the user, and requires explicit confirmation before the
   * tool-calling loop begins. "Verify Plan: Check in before starting implementation."
   *
   * In non-interactive mode (API context), the plan is still generated and written to todo.md,
   * but auto-approved without a stdin prompt — the caller (e.g. /chat endpoint) is responsible
   * for returning the plan to the UI for display and approval via the /chat/plan + /chat/execute
   * two-phase flow.
   */
  private async runPlanMode(taskDescription: string, skills: LoadedSkill[]): Promise<boolean> {
    const planMarkdown = await this.generatePlan(taskDescription);
    writeTodo(this.projectRoot, planMarkdown);

    const interactive = this.opts.interactive !== false; // default true
    if (!interactive) {
      // API context: auto-approve the plan. The caller (/chat endpoint) will return the plan
      // in the response so the UI can display it. The UI should use /chat/plan + /chat/execute
      // for the two-phase approval flow.
      console.log(`\n--- Plan (tasks/todo.md) ---\n${planMarkdown}`);
      console.log("(non-interactive mode — plan auto-approved)");
      return true;
    }

    console.log(`\n--- Plan (tasks/todo.md) ---\n${planMarkdown}`);
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question("Proceed with this plan? (yes/no) ");
    rl.close();
    return /^y(es)?$/i.test(answer.trim());
  }

  /**
   * Phase Planning: divides the task into multiple phases, each running as a sub-orchestrator
   * with isolated ReAct memory. Results from completed phases are summarized and passed to the
   * next phase. This reduces per-phase token footprint at the cost of losing cross-phase context
   * continuity. See enhancement/planning.md.
   *
   * The phases are generated by the LLM (no tools) as a numbered list. Each phase is then
   * executed sequentially. If a phase hits the iteration limit, the user is asked whether to
   * continue (in interactive mode) or auto-continue (in non-interactive mode).
   *
   * After all phases complete, a task history entry is written (Item 1a). Per-phase reports
   * are saved to tasks/[task_name]-phase-[N].md (Item 2a). A WBS file is generated and
   * updated as phases complete (Item 5a/5b).
   */
  private async runPhasePlanning(taskDescription: string, skills: LoadedSkill[], runOpts: RunOptions): Promise<string> {
    const skillContext = skills.length
      ? `\n\nThe following specialized skills are relevant to this task — let their guidance shape the phases:\n\n${skills
          .map((s) => `## ${s.header.name} (${s.header.role})\n${s.body}`)
          .join("\n\n")}`
      : "";

    const phasePrompt: LlmMessage[] = [
      {
        role: "system",
        content:
          buildProtocolPrompt(this.projectRoot) +
          "You are in Phase Planning Mode. Do not call any tools. " +
          "Divide the task below into 2-5 sequential phases. Each phase should be a self-contained " +
          "unit of work with its own goal. Phases are interdependent — each builds on the previous one. " +
          "The goal is to keep each phase's memory footprint small by isolating context. " +
          "Output each phase as a markdown heading (### Phase N: Title) followed by a brief description " +
          "of what that phase accomplishes. No prose outside the phase descriptions." +
          skillContext,
      },
      { role: "user", content: taskDescription },
    ];

    const spinner = new Spinner();
    if (this.opts.consoleThoughts !== false) spinner.start("Dividing task into phases...");
    const response = await this.llm.complete(phasePrompt);
    if (this.opts.consoleThoughts !== false) spinner.stop();
    this.addUsage(response.usage);

    const phasesMarkdown = response.content.trim();
    console.log(`\n--- Phase Plan ---\n${phasesMarkdown}\n`);

    // Parse phases from the markdown output
    const phaseRegex = /###\s*Phase\s+(\d+)[:\s]+(.+?)(?=\n###|\n*$)/gis;
    const phases: { number: number; title: string; description: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = phaseRegex.exec(phasesMarkdown)) !== null) {
      phases.push({
        number: parseInt(match[1], 10),
        title: match[2].trim(),
        description: match[0].trim(),
      });
    }

    // Derive a sanitized filename base from the task description
    const sanitizedTaskName = taskDescription
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const tasksDir = path.join(this.projectRoot, "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    // Item 5a: Generate WBS file from phase plan
    const wbsPath = path.join(tasksDir, `${sanitizedTaskName}-wbs.md`);
    const wbsLines = phases.map((p) => `- [ ] Phase ${p.number}: ${p.title}`);
    const wbsContent = `# WBS: ${taskDescription}\n\n${wbsLines.join("\n")}\n`;
    fs.writeFileSync(wbsPath, wbsContent, "utf-8");
    console.log(`\n📋 WBS written to tasks/${sanitizedTaskName}-wbs.md\n`);

    // If no phases were parsed, treat the whole thing as one phase
    if (phases.length === 0) {
      console.log("(No distinct phases identified — running as a single phase)");
      const sub = new ReActOrchestrator(this.llm, this.telemetry, {
        ...this.opts,
        cwd: this.cwd,
        projectRoot: this.projectRoot,
        consoleIndent: (this.opts.consoleIndent ?? 0) + 1,
        singlePhase: true, // prevent infinite recursion
      });
      const result = await sub.run(taskDescription, { ...runOpts, isSubagent: true });
      this.absorbSubagentUsage(sub);
      return result;
    }

    // Confirm phases with user in interactive mode
    const interactive = this.opts.interactive !== false;
    if (interactive) {
      const rl = readline.createInterface({ input, output });
      const answer = await rl.question("Proceed with these phases? (yes/no) ");
      rl.close();
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Phase plan rejected. Stopping.");
        this.lastOutcome = "plan_rejected";
        return "(No changes were made — the phase plan was not approved before execution.)";
      }
    }

    // Execute each phase sequentially, passing summaries forward
    let accumulatedSummary = "";
    const phaseStats: { phaseNumber: number; phaseTitle: string; tokens: number; iterations: number; reportPath: string }[] = [];

    for (const phase of phases) {
      const phaseTask = `Phase ${phase.number}: ${phase.title}\n\n${phase.description}\n\nContext from previous phases:\n${accumulatedSummary || "(none — this is the first phase)"}\n\nComplete this phase. Do not work on future phases — focus only on what this phase requires.`;

      console.log(`\n=== Starting Phase ${phase.number}: ${phase.title} ===\n`);

      const sub = new ReActOrchestrator(this.llm, this.telemetry, {
        ...this.opts,
        cwd: this.cwd,
        projectRoot: this.projectRoot,
        consoleIndent: (this.opts.consoleIndent ?? 0) + 1,
        singlePhase: true, // prevent infinite recursion
      });
      const phaseResult = await sub.run(phaseTask, { ...runOpts, isSubagent: true });
      this.absorbSubagentUsage(sub);

      // Capture per-phase stats (Item 3a)
      const phaseUsage = sub.getCumulativeUsage();
      const phaseTokens = phaseUsage.totalTokens;
      const phaseIterations = sub.llmCallCount;

      // Item 2a: Write phase report to tasks/[task_name]-phase-[N].md
      const phaseReportPath = path.join(tasksDir, `${sanitizedTaskName}-phase-${phase.number}.md`);
      const phaseReportContent = `# Phase ${phase.number}: ${phase.title}\n\n**Task:** ${taskDescription}\n\n**Result:**\n\n${phaseResult}\n\n**Stats:**\n- Tokens: ${phaseTokens.toLocaleString()}\n- Iterations: ${phaseIterations}\n`;
      fs.writeFileSync(phaseReportPath, phaseReportContent, "utf-8");
      console.log(`📝 Phase report written to tasks/${sanitizedTaskName}-phase-${phase.number}.md`);

      // Item 3b: Color-coded CLI output
      reportPhaseStats(phase.number, phase.title, phaseTokens, phaseIterations, this.opts.consoleIndent ?? 0);

      // Persist phase report to PostgreSQL (best-effort)
      try {
        const phaseReportStore = new PhaseReportStore();
        await phaseReportStore.save({
          taskId: sanitizedTaskName,
          phaseNumber: phase.number,
          phaseTitle: phase.title,
          content: phaseResult,
          tokens: phaseTokens,
          iterations: phaseIterations,
        });
        await phaseReportStore.close();
      } catch (err) {
        console.warn("[PhaseReportStore] Failed to save phase report:", err instanceof Error ? err.message : String(err));
      }

      // Persist WBS entries to PostgreSQL (best-effort)
      try {
        const wbsStore = new WbsStore();
        await wbsStore.saveBatch(
          phases.map((p) => ({
            taskId: sanitizedTaskName,
            taskDescription: taskDescription,
            phaseNumber: p.number,
            phaseTitle: p.title,
            status: (p.number <= phase.number ? "completed" : "pending") as "completed" | "pending",
          }))
        );
        await wbsStore.close();
      } catch (err) {
        console.warn("[WbsStore] Failed to save WBS entries:", err instanceof Error ? err.message : String(err));
      }

      // Persist phase-level task history to PostgreSQL (best-effort)
      try {
        const pgHistory = new PostgresTaskHistory();
        await pgHistory.append({
          id: `phase_${sanitizedTaskName}_${phase.number}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          task: `Phase ${phase.number}: ${phase.title}`,
          summary: phaseResult,
          iterations: phaseIterations,
          totalTokens: phaseTokens,
        });
        await pgHistory.close();
      } catch (err) {
        console.warn("[PostgresTaskHistory] Failed to append phase history:", err instanceof Error ? err.message : String(err));
      }

      // Item 5b: Update WBS to mark this phase as done
      const wbsContent = phases.map((p) => {
        const checked = p.number <= phase.number ? "x" : " ";
        return `- [${checked}] Phase ${p.number}: ${p.title}`;
      }).join("\n");
      fs.writeFileSync(wbsPath, `# WBS: ${taskDescription}\n\n${wbsContent}\n`, "utf-8");

      // Summarize what this phase accomplished for the next phase
      const summaryPrompt: LlmMessage[] = [
        {
          role: "system",
          content: "Summarize the following phase result in 2-3 sentences. Focus on what was accomplished, what files were changed, and any important state that the next phase needs to know about. Be concise.",
        },
        { role: "user", content: `Phase ${phase.number}: ${phase.title}\n\nResult:\n${phaseResult}` },
      ];

      const summarySpinner = new Spinner();
      if (this.opts.consoleThoughts !== false) summarySpinner.start("Summarizing phase...");
      const summaryResponse = await this.llm.complete(summaryPrompt);
      if (this.opts.consoleThoughts !== false) summarySpinner.stop();
      this.addUsage(summaryResponse.usage);

      const phaseSummary = summaryResponse.content.trim();
      // Item 2b: Include phase report path in accumulated summary
      accumulatedSummary += `\n### Phase ${phase.number}: ${phase.title}\n${phaseSummary}\n\n_Phase report: tasks/${sanitizedTaskName}-phase-${phase.number}.md_\n`;

      phaseStats.push({
        phaseNumber: phase.number,
        phaseTitle: phase.title,
        tokens: phaseTokens,
        iterations: phaseIterations,
        reportPath: `tasks/${sanitizedTaskName}-phase-${phase.number}.md`,
      });

      console.log(`\n=== Phase ${phase.number} Complete ===\n${phaseSummary}\n`);
    }

    // Build the final result with per-phase stats
    const statsLines = phaseStats.map(
      (s) => `- **Phase ${s.phaseNumber}: ${s.phaseTitle}** — ${s.tokens.toLocaleString()} tokens, ${s.iterations} iterations (report: ${s.reportPath})`
    );
    const finalResult = `Phase planning completed.\n\n## Summary\n\n${accumulatedSummary}\n\n## Per-Phase Stats\n\n${statsLines.join("\n")}\n\nAll ${phases.length} phases completed successfully.`;

    // Item 1a: Save task report summary to task history
    appendTaskHistory(this.projectRoot, {
      task: taskDescription,
      summary: finalResult,
      iterations: phaseStats.reduce((sum, s) => sum + s.iterations, 0),
      totalTokens: this.cumulativeUsage.totalTokens || undefined,
    });

    return finalResult;
  }

  private async askContinue(taskDescription: string, maxIterations: number): Promise<boolean> {
    const ANSI_GREEN = "\x1b[32m";
    const ANSI_RESET = "\x1b[0m";
    const interactive = this.opts.interactive !== false; // default true
    if (!interactive) {
      // API context: auto-continue rather than hanging on stdin
      console.log(`\nIteration limit reached (${maxIterations}) — non-interactive mode, auto-continuing.`);
      return true;
    }
    const rl = readline.createInterface({ input, output });
    console.log(
      `\n${ANSI_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${ANSI_RESET}`
    );
    console.log(
      `${ANSI_GREEN}▶ ITERATION LIMIT REACHED — Continue?${ANSI_RESET}`
    );
    console.log(
      `${ANSI_GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${ANSI_RESET}`
    );
    const answer = await rl.question(
      `\n${ANSI_GREEN}Iteration limit reached for maxIterations [${maxIterations}]: "${taskDescription}".\nContinue for another round? (yes/no) ${ANSI_RESET}`
    );
    rl.close();
    return /^y(es)?$/i.test(answer.trim());
  }
}

function classifyPhase(toolName: string, args: string): Phase {
  if (READ_ONLY_TOOLS.has(toolName)) return "search";
  if (VALIDATION_TOOLS.has(toolName)) return "validation";
  if (toolName === "github_tool") {
    try {
      const parsed = JSON.parse(args);
      return GITHUB_READ_ACTIONS.has(parsed.action) ? "search" : "action";
    } catch {
      return "action";
    }
  }
  if (ACTION_TOOLS.has(toolName)) return "action";
  if (toolName === "run_command_tool") {
    try {
      const parsed = JSON.parse(args);
      if (VALIDATION_COMMANDS.test(parsed.command ?? "")) return "validation";
    } catch {
      /* fall through */
    }
    return "action";
  }
  return "action";
}

/**
 * What actually gets stored as this step's "thought" in telemetry. `response.content` is the
 * primary source (the model's stated reasoning alongside a tool call), but some models —
 * especially when calling a tool with nothing else to say — return an empty content string and
 * put everything in `reasoning_content` instead (thinking-mode) or nothing at all. Falling back
 * to reasoningContent keeps telemetry consistent with what the live console already shows (see
 * consoleReporter.ts's reportThought, which does the same fallback) instead of silently
 * recording "" when there was actually something to show.
 */
function deriveThought(response: { content: string; reasoningContent?: string }): string {
  return response.content || response.reasoningContent || "(no explicit reasoning before this action)";
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

function buildSystemPrompt(skills: LoadedSkill[], cwd: string): string {
  const protocol = buildProtocolPrompt(cwd);

  const base =
    "You are devnull, a ReAct CLI agent. You have tools for searching the workspace " +
    "(glob_tool, grep_tool, read_tool), making changes (write_edit_tool, ssh_tool, github_tool, " +
    "docker_deploy_ssh_tool, schedule_task_tool), validating your work (run_command_tool, " +
    "playwright_run_tool), and delegating isolated sub-tasks (subagent_tool). Follow the ReAct " +
    "pattern: search for context before editing, and always validate your changes before " +
    "considering a task done. Stop calling tools once the task is verified complete, and " +
    "summarize what you did.\n\n" +
    "You do NOT automatically have any memory of previous tasks in this workspace — each task " +
    "starts fresh. If the user says something like 'continue', 'keep going', 'what was the last " +
    "task', or otherwise references earlier work without restating what it was, call " +
    "task_history_tool (action='recent') before doing anything else to find out what that refers " +
    "to. Don't guess or assume.";

  const skillBlocks = skills.length
    ? `\n\nThe following specialized skill directives are loaded for this task — follow their Process/Strategies/Instructions/Planning/Experience guidance:\n\n${skills
        .map((s) => `## Skill: ${s.header.name} (${s.header.role})\n${s.body}`)
        .join("\n\n")}`
    : "";

  return `${protocol}<task_context>\n${base}${skillBlocks}\n</task_context>`;
}

