import { LoadedSkill, ToolSchema } from "../core/types.js";
import { TOOL_SCHEMAS } from "./toolSchemas.js";

/**
 * Token-efficiency fix: previously every LLM call sent the FULL TOOL_SCHEMAS array (all 25
 * tools, ~5.7k tokens) regardless of which skill(s) were routed for the task -- a pentest task
 * got the same schema payload as a "fix this typo" task. SkillHeader already declares
 * `requires_tools: string[]` per skill (this existed already, just wasn't being read anywhere),
 * so this wires that up instead of adding new plumbing.
 *
 * CORE_TOOLS are always included regardless of skill -- these are the base ReAct primitives
 * (search/read/write/run/converse/subagent) plus the plan/task-tracking tools
 * (add_plan_task_tool, delete_plan_task_tool, save_plan_tool, task_history_tool,
 * update_task_status_tool). The latter aren't in ANY skill's requires_tools list in this
 * codebase's actual SKILL.md files (checked directly, not assumed) -- they're cross-cutting
 * orchestration bookkeeping (tracking progress against a plan) that any skill's task might need
 * to touch, not domain-specific work tools a skill author would think to declare, so gating them
 * behind requires_tools would just silently strip them for every skill.
 *
 * Safety fallback: if no skill matched the task (skills.length === 0) OR a loaded skill has no
 * `requires_tools` field AT ALL (undefined -- distinct from a deliberately empty array; see
 * below), this returns the full TOOL_SCHEMAS unfiltered -- silently shrinking the toolset when
 * we're not confident which tools are actually needed would risk the agent capability-starving
 * itself mid-task, which is worse than the token cost this is meant to save.
 */

const CORE_TOOL_NAMES = new Set([
  "conversation_tool",
  "glob_tool",
  "grep_tool",
  "read_tool",
  "write_edit_tool",
  "run_command_tool",
  "subagent_tool",
  "add_plan_task_tool",
  "delete_plan_task_tool",
  "save_plan_tool",
  "task_history_tool",
  "update_task_status_tool",
]);

export function filterToolsForSkills(skills: LoadedSkill[]): ToolSchema[] {
  if (skills.length === 0) return TOOL_SCHEMAS;

  const requiredNames = new Set<string>(CORE_TOOL_NAMES);
  for (const skill of skills) {
    const declared = skill.header.requires_tools;

    // Genuinely missing (undefined) -- the header doesn't declare its tool needs at all, so we
    // don't know what it requires. Fail safe to the full set rather than guess.
    //
    // NOT the same as `declared.length === 0`: some real skills in this codebase (scrum-
    // framework, scrum-master-agent) deliberately declare `requires_tools: []` because they're
    // pure reference/coaching skills that genuinely need zero tools beyond core -- treating that
    // identically to "undeclared" was a bug: it meant those two skills never actually benefited
    // from filtering at all, silently falling back to the full 25-tool list every time despite
    // having explicitly (and correctly) declared they need none of them.
    if (!declared) {
      return TOOL_SCHEMAS;
    }
    for (const name of declared) requiredNames.add(name);
  }

  const filtered = TOOL_SCHEMAS.filter((t) => requiredNames.has(t.function.name));

  // Extra safety net: if the filter somehow produced a smaller-than-core set (e.g. a typo'd
  // tool name in requires_tools reducing coverage, or a future core tool renamed without
  // updating CORE_TOOL_NAMES), fall back rather than crippling the agent.
  if (filtered.length < CORE_TOOL_NAMES.size) return TOOL_SCHEMAS;

  return filtered;
}
