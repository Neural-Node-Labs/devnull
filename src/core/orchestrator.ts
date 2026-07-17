import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { LlmClient, LlmMessage, ReActStep, TelemetryInterface, LoadedSkill, Phase } from "./types.js";
import { SkillRegistry } from "./skillRegistry.js";
import { TOOL_SCHEMAS } from "../tools/toolSchemas.js";
import { dispatchToolCall } from "../tools/toolDispatcher.js";
import { buildProtocolPrompt, writeTodo, appendTodoReview } from "./protocol.js";
import { validateGoal, buildObservationTranscript } from "./goalValidator.js";

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
   * Called when the iteration ceiling is hit and more work is needed. Return true to reset the
   * counter and continue, false to stop. Defaults to an interactive stdin yes/no prompt. Inject
   * this for automated diagnostics/CI where no TTY is available, or to log/audit every restart
   * decision (see src/core/liveDiagnostics.ts diagnostic #2).
   */
  onIterationLimitReached?: (taskDescription: string, iterationsSoFar: number) => Promise<boolean>;
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
  private cwd: string;

  constructor(
    private llm: LlmClient,
    private telemetry: TelemetryInterface,
    private opts: OrchestratorOptions = {}
  ) {
    this.cwd = opts.cwd ?? process.cwd();
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
    const skills = this.selectSkills(taskDescription);
    const maxIterations = this.opts.maxIterations ?? 20;

    console.log(`\n--- Running task: "${taskDescription}" ---\n (maxIterations=${maxIterations}, planMode=${this.opts.planMode ?? "auto"}, validateGoal=${this.opts.validateGoal ?? true})\n`);

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
        return "";
      }
    }

    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt(skills, this.cwd) },
      { role: "user", content: taskDescription },
    ];

    let iteration = 0;
    let finalContent = "";
    let validatorRejections = 0;
    let restartCount = 0;
    const maxValidatorRetries = this.opts.maxValidatorRetries ?? 2;
    const validationEnabled = this.opts.validateGoal !== false; // default true

    while (true) {
      iteration += 1;

      if (iteration > maxIterations) {
        if (runOpts.isSubagent) {
          // Subagents don't interactively prompt — they just stop and report what they have.
          finalContent = "(subagent hit iteration limit without completing)";
          break;
        }
        const shouldContinue = this.opts.onIterationLimitReached
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
          return finalContent;
        }
        restartCount += 1;
        iteration = 1; // reset iteration count for another round
      }

      const response = await this.llm.complete(messages, { tools: TOOL_SCHEMAS });

      if (response.toolCalls.length === 0) {
        // Candidate completion. Before accepting it, run it past an independent validator
        // (devnull.md "Verification Before Done") unless validation is disabled or exhausted.
        if (validationEnabled && validatorRejections < maxValidatorRetries) {
          const transcript = buildObservationTranscript(messages);
          const verdict = await validateGoal(this.llm, taskDescription, transcript, response.content);

          // console.log(`iteration: ${iteration} thought: ${response.content} \naction: ${transcript} \nobservation:${verdict}` );
          await this.telemetry.logThought({
            iteration,
            phase: "validation",
            thought: response.content,
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

        await this.telemetry.logThought({ iteration, phase: "validation", thought: response.content });
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
          const observation = await this.runSubagent(call.function.arguments);
          await this.telemetry.logThought({
            iteration,
            phase: "search",
            thought: response.content,
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
          thought: response.content,
          action: { tool: call.function.name, input: safeParse(call.function.arguments) },
        };

        const result = await dispatchToolCall(call, this.cwd);
        step.observation = result.observation;
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
      }
      // Loop continues: the new Observations go back in as context for the next Thought.
    }

    if (shouldPlan && !runOpts.isSubagent) {
      appendTodoReview(this.cwd, finalContent);
    }
    return finalContent;
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
    const sub = new ReActOrchestrator(this.llm, this.telemetry, { ...this.opts, cwd: this.cwd });
    const result = await sub.run(task, { skipPlanMode: true, isSubagent: true });
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
          buildProtocolPrompt(this.cwd) +
          "You are in Plan Mode. Do not call any tools. Produce a short, concrete, checkable " +
          "plan for the task below as a markdown checklist (`- [ ] step`), 3-8 steps. " +
          "No prose outside the checklist." +
          skillContext,
      },
      { role: "user", content: taskDescription },
    ];

    const response = await this.llm.complete(planPrompt);
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
    writeTodo(this.cwd, planMarkdown);

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

  private async askContinue(taskDescription: string, maxIterations: number): Promise<boolean> {
    const interactive = this.opts.interactive !== false; // default true
    if (!interactive) {
      // API context: auto-continue rather than hanging on stdin
      console.log(`\nIteration limit reached (${maxIterations}) — non-interactive mode, auto-continuing.`);
      return true;
    }
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(
      `\nIteration limit reached for maxIterations [${maxIterations}]: "${taskDescription}".\nContinue for another round? (yes/no) `
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
    "summarize what you did.";

  const skillBlocks = skills.length
    ? `\n\nThe following specialized skill directives are loaded for this task — follow their Process/Strategies/Instructions/Planning/Experience guidance:\n\n${skills
        .map((s) => `## Skill: ${s.header.name} (${s.header.role})\n${s.body}`)
        .join("\n\n")}`
    : "";

  return `${protocol}<task_context>\n${base}${skillBlocks}\n</task_context>`;
}
