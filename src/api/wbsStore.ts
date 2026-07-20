import pg from "pg";

const { Pool } = pg;

/**
 * A WBS entry stored in PostgreSQL.
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
 * PostgreSQL-backed store for WBS entries.
 * Stores WBS entries with status tracking per phase.
 * Falls back gracefully if the database is unreachable.
 */
export class WbsStore {
  private pool: pg.Pool;
  private initialized = false;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS wbs_entries (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            task_description TEXT NOT NULL,
            phase_number INTEGER NOT NULL,
            phase_title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);
        `);
        this.initialized = true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn("[WbsStore] Failed to initialize:", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Save a batch of WBS entries for a task (one per phase).
   */
  async saveBatch(entries: Omit<WbsEntry, "id" | "createdAt" | "updatedAt">[]): Promise<boolean> {
    try {
      if (!this.initialized) await this.init();
      const now = new Date().toISOString();

      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        for (const entry of entries) {
          const id = `wbs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${entry.phaseNumber}`;
          await client.query(
            `INSERT INTO wbs_entries (id, task_id, task_description, phase_number, phase_title, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               updated_at = EXCLUDED.updated_at`,
            [id, entry.taskId, entry.taskDescription, entry.phaseNumber, entry.phaseTitle, entry.status, now, now]
          );
        }

        await client.query("COMMIT");
        return true;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn("[WbsStore] Failed to saveBatch:", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * Update the status of a WBS entry.
   */
  async updateStatus(taskId: string, phaseNumber: number, status: WbsEntry["status"]): Promise<boolean> {
    try {
      if (!this.initialized) await this.init();
      const now = new Date().toISOString();
      const result = await this.pool.query(
        `UPDATE wbs_entries SET status = $1, updated_at = $2
         WHERE task_id = $3 AND phase_number = $4`,
        [status, now, taskId, phaseNumber]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      console.warn("[WbsStore] Failed to updateStatus:", err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * List WBS entries for a task, ordered by phase number.
   */
  async listByTask(taskId: string): Promise<WbsEntry[]> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query(
        `SELECT id, task_id as "taskId", task_description as "taskDescription",
                phase_number as "phaseNumber", phase_title as "phaseTitle",
                status, created_at as "createdAt", updated_at as "updatedAt"
         FROM wbs_entries WHERE task_id = $1 ORDER BY phase_number ASC`,
        [taskId]
      );
      return result.rows;
    } catch (err) {
      console.warn("[WbsStore] Failed to listByTask:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
    } catch {
      // ignore close errors
    }
  }
}
