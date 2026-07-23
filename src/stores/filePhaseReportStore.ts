import fs from "node:fs";
import path from "node:path";

/**
 * A phase report stored in a JSONL file.
 */
export interface PhaseReport {
  id: string;
  taskId: string;
  phaseNumber: number;
  phaseTitle: string;
  content: string;
  tokens: number;
  iterations: number;
  createdAt: string;
}

/**
 * File-based store for phase reports.
 * Stores phase reports as JSONL (one JSON object per line) in a configurable log directory.
 * No database dependency — purely file-based for the CLI code path.
 *
 * Log directory is configurable via DEVNULL_LOG_DIR env var (default: ./logs/).
 * The file is stored at <logDir>/phase-reports.jsonl.
 */
export class FilePhaseReportStore {
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
   * Save a phase report by appending to the JSONL file.
   */
  async save(report: Omit<PhaseReport, "id" | "createdAt">): Promise<PhaseReport | null> {
    try {
      const id = `phase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      const record: PhaseReport = {
        id,
        ...report,
        createdAt: now,
      };

      const filePath = path.join(this.logDir, "phase-reports.jsonl");
      fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");

      return record;
    } catch (err) {
      console.warn("[FilePhaseReportStore] Failed to save:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Get a phase report by ID by scanning the JSONL file.
   */
  async get(id: string): Promise<PhaseReport | null> {
    try {
      const records = this.readAll();
      return records.find((r) => r.id === id) ?? null;
    } catch (err) {
      console.warn("[FilePhaseReportStore] Failed to get:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * List phase reports for a task, ordered by phase number.
   */
  async listByTask(taskId: string): Promise<PhaseReport[]> {
    try {
      const records = this.readAll();
      return records
        .filter((r) => r.taskId === taskId)
        .sort((a, b) => a.phaseNumber - b.phaseNumber);
    } catch (err) {
      console.warn("[FilePhaseReportStore] Failed to listByTask:", err instanceof Error ? err.message : String(err));
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
  private readAll(): PhaseReport[] {
    const filePath = path.join(this.logDir, "phase-reports.jsonl");
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    const records: PhaseReport[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as PhaseReport);
      } catch {
        // skip corrupt lines
      }
    }
    return records;
  }
}
