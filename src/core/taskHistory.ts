import fs from "node:fs";
import path from "node:path";

const HISTORY_PATH = path.join(".agent", "task-history.jsonl");
const MARKDOWN_PATH = path.join("tasks", "task_history.md");
const MAX_ENTRIES = 200; // cap file growth; oldest entries drop off on append past this
const MAX_MARKDOWN_ENTRIES = 50;

export interface TaskHistoryEntry {
  id: string;
  task: string;
  summary: string;
  timestamp: string; // ISO 8601
  iterations: number;
  totalTokens?: number;
}

/**
 * Appends a completed top-level task to .agent/task-history.jsonl AND tasks/task_history.md
 * (never called for subagent runs — those are internal implementation detail, not something a
 * user would call "the last task"). Deliberately NOT read back into `messages` anywhere in
 * orchestrator.ts — the only way this data reaches the model is if it explicitly calls
 * task_history_tool, per the design goal of keeping it out of default context while still being
 * queryable on demand.
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

  // --- Write to .agent/task-history.jsonl ---
  const jsonlPath = path.join(cwd, HISTORY_PATH);
  fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });

  const existing = readTaskHistory(cwd, MAX_ENTRIES);
  const updated = [...existing, full].slice(-MAX_ENTRIES);
  fs.writeFileSync(jsonlPath, updated.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");

  // --- Write to tasks/task_history.md ---
  const mdPath = path.join(cwd, MARKDOWN_PATH);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });

  const mdEntry = formatMarkdownEntry(full);
  let mdContent = mdEntry + "\n";

  // Read existing markdown entries (skip the first entry we're about to prepend)
  if (fs.existsSync(mdPath)) {
    const existingMd = fs.readFileSync(mdPath, "utf-8").trim();
    if (existingMd) {
      mdContent = mdEntry + "\n" + existingMd + "\n";
    }
  }

  // Keep only the last MAX_MARKDOWN_ENTRIES (split on "## " to count entries)
  const mdLines = mdContent.split("\n");
  const entryCount = mdContent.split("\n## ").length;
  if (entryCount > MAX_MARKDOWN_ENTRIES) {
    // Find the position of the (MAX_MARKDOWN_ENTRIES+1)th "## " heading
    let headingCount = 0;
    let cutoff = 0;
    for (let i = 0; i < mdLines.length; i++) {
      if (mdLines[i].startsWith("## ")) {
        headingCount++;
        if (headingCount > MAX_MARKDOWN_ENTRIES) {
          cutoff = i;
          break;
        }
      }
    }
    if (cutoff > 0) {
      mdContent = mdLines.slice(0, cutoff).join("\n") + "\n";
    }
  }

  fs.writeFileSync(mdPath, mdContent, "utf-8");

  return full;
}

/** Format a single entry as markdown. */
function formatMarkdownEntry(entry: TaskHistoryEntry): string {
  const date = new Date(entry.timestamp);
  const localTimestamp = date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const stats = `**Stats:** ${entry.iterations} iterations${entry.totalTokens != null ? `, ${entry.totalTokens} tokens` : ""}`;

  return [
    `## ${localTimestamp} — ${entry.task}`,
    "",
    `**Summary:** ${entry.summary}`,
    "",
    stats,
    "",
    "---",
  ].join("\n");
}

/** Most recent `limit` tasks, newest first. */
export function readTaskHistory(cwd: string, limit = 5): TaskHistoryEntry[] {
  const p = path.join(cwd, HISTORY_PATH);
  if (fs.existsSync(p)) {
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

  // Fallback: read from tasks/task_history.md
  const mdPath = path.join(cwd, MARKDOWN_PATH);
  if (!fs.existsSync(mdPath)) return [];

  const md = fs.readFileSync(mdPath, "utf-8");
  return parseMarkdownEntries(md).slice(0, limit);
}

/** Parse markdown entries back into TaskHistoryEntry objects. */
function parseMarkdownEntries(md: string): TaskHistoryEntry[] {
  const entries: TaskHistoryEntry[] = [];
  // Split on "## " headings (each entry starts with one)
  const blocks = md.split("\n## ");
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    const heading = lines[0].trim();

    // Parse heading: "Mar 17, 2025, 10:30:00 AM GMT — task description"
    const headingMatch = heading.match(/^(.+?) — (.+)$/);
    if (!headingMatch) continue;

    const timestampStr = headingMatch[1];
    const task = headingMatch[2];

    // Parse summary line
    const summaryLine = lines.find((l) => l.startsWith("**Summary:**"));
    const summary = summaryLine ? summaryLine.replace("**Summary:** ", "") : "";

    // Parse stats line
    const statsLine = lines.find((l) => l.startsWith("**Stats:**"));
    let iterations = 0;
    let totalTokens: number | undefined;
    if (statsLine) {
      const iterMatch = statsLine.match(/(\d+) iterations/);
      if (iterMatch) iterations = parseInt(iterMatch[1], 10);
      const tokenMatch = statsLine.match(/(\d+) tokens/);
      if (tokenMatch) totalTokens = parseInt(tokenMatch[1], 10);
    }

    // Convert local timestamp back to ISO — best effort
    const parsedDate = new Date(timestampStr);
    const timestamp = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

    entries.push({
      id: `md_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      task,
      summary,
      timestamp,
      iterations,
      totalTokens,
    });
  }
  return entries;
}

/** Keyword search across task descriptions and summaries, newest match first. */
export function searchTaskHistory(cwd: string, query: string, limit = 5): TaskHistoryEntry[] {
  const all = readTaskHistory(cwd, MAX_ENTRIES);
  const q = query.toLowerCase();
  return all.filter((e) => e.task.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)).slice(0, limit);
}
