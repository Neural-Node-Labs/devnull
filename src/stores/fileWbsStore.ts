import fs from "node:fs";
import path from "node:path";

/**
 * A WBS entry stored in a JSONL file.
 */
export interface WbsEntry {
  id: string;
  taskId: string;
  taskDescription: string;
  phaseNumber: number;
  phaseTitle: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  createdAt: string;
  updatedAt: string;
}

/**
 * File-based store for WBS entries.
 * Stores WBS entries as JSONL (one JSON object per line) in a configurable log directory.
 * No database dependency — purely file-based for the CLI code path.
 *
 * Log directory is configurable via DEVNULL_LOG_DIR env var (default: ./logs/).
 * The file is stored at <logDir>/wbs-entries.jsonl.
 */
export class FileWbsStore {
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
   * Save a batch of WBS entries for a task (one per phase).
   */
  async saveBatch(entries: Omit<WbsEntry, "id" | "createdAt" | "updatedAt">[]): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const filePath = path.join(this.logDir, "wbs-entries.jsonl");

      for (const entry of entries) {
        const id = `wbs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${entry.phaseNumber}`;
        const record: WbsEntry = {
          id,
          ...entry,
          createdAt: now,
          updatedAt: now,
        };
        fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
      }

      return true;
    } catch (err) {
      console.warn("[FileWbsStore] Failed to saveBatch:", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * Get a WBS entry by ID by scanning the JSONL file.
   */
  async get(id: string): Promise<WbsEntry | null> {
    try {
      const records = this.readAll();
      return records.find((r) => r.id === id) ?? null;
    } catch (err) {
      console.warn("[FileWbsStore] Failed to get:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Update the status of a WBS entry.
   * Since JSONL is append-only, we rewrite the entire file with the updated entry.
   */
  async updateStatus(taskId: string, phaseNumber: number, status: WbsEntry["status"]): Promise<boolean> {
    try {
      const records = this.readAll();
      const now = new Date().toISOString();
      let updated = false;

      const updatedRecords = records.map((r) => {
        if (r.taskId === taskId && r.phaseNumber === phaseNumber) {
          updated = true;
          return { ...r, status, updatedAt: now };
        }
        return r;
      });

      if (!updated) return false;

      const filePath = path.join(this.logDir, "wbs-entries.jsonl");
      const content = updatedRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
      fs.writeFileSync(filePath, content, "utf-8");

      return true;
    } catch (err) {
      console.warn("[FileWbsStore] Failed to updateStatus:", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * List WBS entries for a task, ordered by phase number.
   */
  async listByTask(taskId: string): Promise<WbsEntry[]> {
    try {
      const records = this.readAll();
      return records
        .filter((r) => r.taskId === taskId)
        .sort((a, b) => a.phaseNumber - b.phaseNumber);
    } catch (err) {
      console.warn("[FileWbsStore] Failed to listByTask:", err instanceof Error ? err.message : String(err));
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
  private readAll(): WbsEntry[] {
    const filePath = path.join(this.logDir, "wbs-entries.jsonl");
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    const records: WbsEntry[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as WbsEntry);
      } catch {
        // skip corrupt lines
      }
    }
    return records;
  }
}
