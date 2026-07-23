import fs from "node:fs";
import path from "node:path";

/**
 * A task history entry stored in a JSONL file.
 */
export interface TaskHistoryRecord {
  id: string;
  task: string;
  summary: string;
  timestamp: string;
  iterations: number;
  totalTokens: number | null;
}

/**
 * File-based store for task history.
 * Stores task history entries as JSONL (one JSON object per line) in a configurable log directory.
 * No database dependency — purely file-based for the CLI code path.
 *
 * Log directory is configurable via DEVNULL_LOG_DIR env var (default: ./logs/).
 * The file is stored at <logDir>/task-history.jsonl.
 */
export class FileTaskHistoryStore {
  private logDir: string;

  constructor(logDir?: string) {
    this.logDir = logDir ?? process.env.DEVNULL_LOG_DIR ?? path.join(process.cwd(), "logs");
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  /**
   * No-op for file-based store — initialization is just ensuring the directory exists,
   * which is already done in the constructor.
   */
  async init(): Promise<void> {
    // Directory already created in constructor
  }

  /**
   * Save a task history entry by appending to the JSONL file.
   */
  async save(entry: Omit<TaskHistoryRecord, "id" | "timestamp">): Promise<TaskHistoryRecord | null> {
    try {
      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toISOString();

      const record: TaskHistoryRecord = {
        id,
        ...entry,
        timestamp,
        totalTokens: entry.totalTokens ?? null,
      };

      const filePath = path.join(this.logDir, "task-history.jsonl");
      fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");

      return record;
    } catch (err) {
      console.warn("[FileTaskHistoryStore] Failed to save:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Get a task history entry by ID by scanning the JSONL file.
   */
  async getById(id: string): Promise<TaskHistoryRecord | null> {
    try {
      const records = this.readAll();
      return records.find((r) => r.id === id) ?? null;
    } catch (err) {
      console.warn("[FileTaskHistoryStore] Failed to getById:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * List task history entries, newest first.
   */
  async list(limit = 10): Promise<TaskHistoryRecord[]> {
    try {
      const records = this.readAll();
      return records.reverse().slice(0, limit);
    } catch (err) {
      console.warn("[FileTaskHistoryStore] Failed to list:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  /**
   * No-op for file-based store.
   */
  async close(): Promise<void> {
    // No-op
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  /**
   * Read all records from the JSONL file.
   */
  private readAll(): TaskHistoryRecord[] {
    const filePath = path.join(this.logDir, "task-history.jsonl");
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    const records: TaskHistoryRecord[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as TaskHistoryRecord);
      } catch {
        // skip corrupt lines
      }
    }
    return records;
  }
}
