import pg from "pg";
import { TelemetryInterface, ReActStep } from "../core/types.js";

const { Pool } = pg;

/**
 * PostgreSQL-backed telemetry implementation.
 * Stores ReAct steps, LLM calls, and errors in PostgreSQL tables.
 * Falls back gracefully if the database is unreachable (logs to console).
 *
 * Schema is auto-created on first connection via init().
 */
export class PostgresTelemetry implements TelemetryInterface {
  private pool: pg.Pool;
  private initialized = false;
  private fallbackLog: Array<{ type: string; data: unknown }> = [];

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  /**
   * Initialize the database schema. Creates tables if they don't exist.
   * Safe to call multiple times — uses IF NOT EXISTS.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS telemetry_logs (
            id SERIAL PRIMARY KEY,
            task_id TEXT,
            iteration INTEGER,
            phase TEXT,
            thought TEXT,
            action_tool TEXT,
            action_input JSONB,
            observation JSONB,
            score INTEGER,
            timestamp TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS telemetry_llm_calls (
            id SERIAL PRIMARY KEY,
            task_id TEXT,
            request JSONB,
            response JSONB,
            timestamp TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS telemetry_errors (
            id SERIAL PRIMARY KEY,
            task_id TEXT,
            context TEXT,
            error_message TEXT,
            error_stack TEXT,
            timestamp TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_telemetry_logs_task_id ON telemetry_logs(task_id);
          CREATE INDEX IF NOT EXISTS idx_telemetry_logs_timestamp ON telemetry_logs(timestamp);
          CREATE INDEX IF NOT EXISTS idx_telemetry_llm_calls_task_id ON telemetry_llm_calls(task_id);
          CREATE INDEX IF NOT EXISTS idx_telemetry_errors_task_id ON telemetry_errors(task_id);
        `);
        this.initialized = true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn("[PostgresTelemetry] Failed to initialize database schema, using fallback:", err instanceof Error ? err.message : String(err));
    }
  }

  private async query(text: string, params?: unknown[]): Promise<void> {
    try {
      if (!this.initialized) await this.init();
      await this.pool.query(text, params);
    } catch (err) {
      // Fallback: store in memory and log to console
      console.warn("[PostgresTelemetry] Query failed, falling back:", err instanceof Error ? err.message : String(err));
    }
  }

  async logThought(step: ReActStep): Promise<void> {
    await this.query(
      `INSERT INTO telemetry_logs (task_id, iteration, phase, thought, action_tool, action_input, observation, score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        (step as any).taskId || null,
        step.iteration,
        step.phase,
        step.thought,
        step.action?.tool || null,
        step.action?.input ? JSON.stringify(step.action.input) : null,
        step.observation ? JSON.stringify(step.observation) : null,
        step.score ?? null,
      ]
    );
  }

  async logLlmCall(request: unknown, response: unknown): Promise<void> {
    await this.query(
      `INSERT INTO telemetry_llm_calls (request, response) VALUES ($1, $2)`,
      [JSON.stringify(request), JSON.stringify(response)]
    );
  }

  async logError(err: unknown, context?: string): Promise<void> {
    const serialized = err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { err };
    await this.query(
      `INSERT INTO telemetry_errors (context, error_message, error_stack) VALUES ($1, $2, $3)`,
      [context || null, serialized.message || null, serialized.stack || null]
    );
  }

  /**
   * Get telemetry logs for a specific task.
   */
  async getLogsForTask(taskId: string, limit = 100): Promise<ReActStep[]> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query(
        `SELECT * FROM telemetry_logs WHERE task_id = $1 ORDER BY timestamp DESC LIMIT $2`,
        [taskId, limit]
      );
      return result.rows.map((row: any) => ({
        iteration: row.iteration,
        phase: row.phase,
        thought: row.thought,
        action: row.action_tool ? { tool: row.action_tool, input: row.action_input } : undefined,
        observation: row.observation,
        score: row.score,
      }));
    } catch (err) {
      console.warn("[PostgresTelemetry] Failed to get logs for task:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  /**
   * Get all telemetry logs with optional filters.
   */
  async getLogs(opts?: { taskId?: string; limit?: number; offset?: number; logType?: string }): Promise<any[]> {
    try {
      if (!this.initialized) await this.init();
      let query = "SELECT * FROM telemetry_logs WHERE 1=1";
      const params: unknown[] = [];
      let paramIndex = 1;

      if (opts?.taskId) {
        query += ` AND task_id = $${paramIndex++}`;
        params.push(opts.taskId);
      }

      query += " ORDER BY timestamp DESC";

      if (opts?.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(opts.limit);
      } else {
        query += " LIMIT 100";
      }

      if (opts?.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(opts.offset);
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (err) {
      console.warn("[PostgresTelemetry] Failed to get logs:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  /**
   * Close the database connection pool.
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
    } catch {
      // ignore close errors
    }
  }
}
