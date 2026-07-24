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
 * (search/read/write/run/converse/subagent) that essentially every task needs, so gating them
 * behind a skill's requires_tools list would just force every skill author to list them anyway.
 *
 * Safety fallback: if no skill matched the task (skills.length === 0) OR any loaded skill
 * doesn't declare requires_tools, this returns the full TOOL_SCHEMAS unfiltered -- silently
 * shrinking the toolset when we're not confident which tools are actually needed would risk the
 * agent capability-starving itself mid-task, which is worse than the token cost this is meant
 * to save.
 */

const CORE_TOOL_NAMES = new Set([
  "conversation_tool",
  "glob_tool",
  "grep_tool",
  "read_tool",
  "write_edit_tool",
  "run_command_tool",
  "subagent_tool",
]);

export function filterToolsForSkills(skills: LoadedSkill[]): ToolSchema[] {
  if (skills.length === 0) return TOOL_SCHEMAS;

  const requiredNames = new Set<string>(CORE_TOOL_NAMES);
  for (const skill of skills) {
    const declared = skill.header.requires_tools;
    if (!declared || declared.length === 0) {
      // This skill doesn't declare its tool needs -- fail safe to the full set rather than
      // guess, since under-provisioning tools mid-task is a correctness risk, not just a
      // cost one.
      return TOOL_SCHEMAS;
    }
    for (const name of declared) requiredNames.add(name);
  }

  const filtered = TOOL_SCHEMAS.filter((t) => requiredNames.has(t.function.name));

  // Extra safety net: if the filter somehow produced an empty/near-empty set (e.g. a typo in a
  // skill's requires_tools), fall back rather than crippling the agent.
  if (filtered.length < CORE_TOOL_NAMES.size) return TOOL_SCHEMAS;

  return filtered;
}
