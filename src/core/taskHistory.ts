import fs from "node:fs";
import path from "node:path";

const HISTORY_PATH = path.join(".agent", "task-history.jsonl");
const MAX_ENTRIES = 200; // cap file growth; oldest entries drop off on append past this

export interface TaskHistoryEntry {
  id: string;
  task: string;
  summary: string;
  timestamp: string; // ISO 8601
  iterations: number;
  totalTokens?: number;
}

/**
 * Appends a completed top-level task to .agent/task-history.jsonl (never called for subagent
 * runs — those are internal implementation detail, not something a user would call "the last
 * task"). Deliberately NOT read back into `messages` anywhere in orchestrator.ts — the only way
 * this data reaches the model is if it explicitly calls task_history_tool, per the design goal
 * of keeping it out of default context while still being queryable on demand.
 */
export function appendTaskHistory(
  cwd: string,
  entry: Omit<TaskHistoryEntry, "id" | "timestamp">
): TaskHistoryEntry {
  const full: TaskHistoryEntry = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const p = path.join(cwd, HISTORY_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });

  const existing = readTaskHistory(cwd, MAX_ENTRIES);
  const updated = [...existing, full].slice(-MAX_ENTRIES);
  fs.writeFileSync(p, updated.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");

  return full;
}

/** Most recent `limit` tasks, newest first. */
export function readTaskHistory(cwd: string, limit = 5): TaskHistoryEntry[] {
  const p = path.join(cwd, HISTORY_PATH);
  if (!fs.existsSync(p)) return [];

  const lines = fs.readFileSync(p, "utf-8").split("\n").filter((l) => l.trim());
  const entries: TaskHistoryEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip a corrupt line rather than fail the whole read
    }
  }
  return entries.slice(-limit).reverse();
}

/** Keyword search across task descriptions and summaries, newest match first. */
export function searchTaskHistory(cwd: string, query: string, limit = 5): TaskHistoryEntry[] {
  const all = readTaskHistory(cwd, MAX_ENTRIES);
  const q = query.toLowerCase();
  return all.filter((e) => e.task.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)).slice(0, limit);
}
