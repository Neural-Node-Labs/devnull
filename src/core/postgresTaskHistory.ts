import pg from "pg";
import { TaskHistoryEntry } from "./taskHistory.js";

const { Pool } = pg;

/**
 * PostgreSQL-backed task history store.
 * Stores task history entries in a PostgreSQL table.
 * Falls back gracefully if the database is unreachable.
 */
export class PostgresTaskHistory {
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
          CREATE TABLE IF NOT EXISTS task_history (
            id TEXT PRIMARY KEY,
            task TEXT NOT NULL,
            summary TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            iterations INTEGER DEFAULT 0,
            total_tokens INTEGER
          );

          CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
        `);
        this.initialized = true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn("[PostgresTaskHistory] Failed to initialize:", err instanceof Error ? err.message : String(err));
    }
  }

  async append(entry: TaskHistoryEntry): Promise<void> {
    try {
      if (!this.initialized) await this.init();
      await this.pool.query(
        `INSERT INTO task_history (id, task, summary, timestamp, iterations, total_tokens)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           task = EXCLUDED.task,
           summary = EXCLUDED.summary,
           timestamp = EXCLUDED.timestamp,
           iterations = EXCLUDED.iterations,
           total_tokens = EXCLUDED.total_tokens`,
        [entry.id, entry.task, entry.summary, entry.timestamp, entry.iterations, entry.totalTokens ?? null]
      );
    } catch (err) {
      console.warn("[PostgresTaskHistory] Failed to append:", err instanceof Error ? err.message : String(err));
    }
  }

  async read(limit = 10): Promise<TaskHistoryEntry[]> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query(
        `SELECT id, task, summary, timestamp, iterations, total_tokens as "totalTokens"
         FROM task_history ORDER BY timestamp DESC LIMIT $1`,
        [limit]
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        task: row.task,
        summary: row.summary,
        timestamp: row.timestamp,
        iterations: row.iterations,
        totalTokens: row.total_tokens,
      }));
    } catch (err) {
      console.warn("[PostgresTaskHistory] Failed to read:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async search(query: string, limit = 10): Promise<TaskHistoryEntry[]> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query(
        `SELECT id, task, summary, timestamp, iterations, total_tokens as "totalTokens"
         FROM task_history
         WHERE task ILIKE $1 OR summary ILIKE $1
         ORDER BY timestamp DESC LIMIT $2`,
        [`%${query}%`, limit]
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        task: row.task,
        summary: row.summary,
        timestamp: row.timestamp,
        iterations: row.iterations,
        totalTokens: row.total_tokens,
      }));
    } catch (err) {
      console.warn("[PostgresTaskHistory] Failed to search:", err instanceof Error ? err.message : String(err));
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
