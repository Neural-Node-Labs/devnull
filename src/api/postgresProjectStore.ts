import pg from "pg";
import crypto from "node:crypto";
import { StoredProject } from "./projectStore.js";

const { Pool } = pg;

/**
 * PostgreSQL-backed project store.
 * Stores project information in a PostgreSQL table instead of a JSON file.
 * Falls back gracefully if the database is unreachable.
 */
export class PostgresProjectStore {
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
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            active BOOLEAN DEFAULT FALSE,
            include_in_llm BOOLEAN DEFAULT FALSE,
            created_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);
        `);
        this.initialized = true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn("[PostgresProjectStore] Failed to initialize:", err instanceof Error ? err.message : String(err));
    }
  }

  async list(): Promise<StoredProject[]> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query(
        `SELECT id, name, path, active, include_in_llm as "includeInLlm", created_at as "createdAt"
         FROM projects ORDER BY created_at DESC`
      );
      return result.rows;
    } catch (err) {
      console.warn("[PostgresProjectStore] Failed to list:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async get(id: string): Promise<StoredProject | undefined> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query(
        `SELECT id, name, path, active, include_in_llm as "includeInLlm", created_at as "createdAt"
         FROM projects WHERE id = $1`,
        [id]
      );
      return result.rows[0] || undefined;
    } catch (err) {
      console.warn("[PostgresProjectStore] Failed to get:", err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }

  async add(project: StoredProject): Promise<void> {
    try {
      if (!this.initialized) await this.init();
      await this.pool.query(
        `INSERT INTO projects (id, name, path, active, include_in_llm, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           path = EXCLUDED.path,
           active = EXCLUDED.active,
           include_in_llm = EXCLUDED.include_in_llm`,
        [project.id, project.name, project.path, project.active, project.includeInLlm, project.createdAt]
      );
    } catch (err) {
      console.warn("[PostgresProjectStore] Failed to add:", err instanceof Error ? err.message : String(err));
    }
  }

  async update(id: string, updates: Partial<StoredProject>): Promise<void> {
    try {
      if (!this.initialized) await this.init();
      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        sets.push(`name = $${paramIndex++}`);
        params.push(updates.name);
      }
      if (updates.active !== undefined) {
        sets.push(`active = $${paramIndex++}`);
        params.push(updates.active);
      }
      if (updates.includeInLlm !== undefined) {
        sets.push(`include_in_llm = $${paramIndex++}`);
        params.push(updates.includeInLlm);
      }
      if (updates.path !== undefined) {
        sets.push(`path = $${paramIndex++}`);
        params.push(updates.path);
      }

      if (sets.length === 0) return;

      params.push(id);
      await this.pool.query(
        `UPDATE projects SET ${sets.join(", ")} WHERE id = $${paramIndex}`,
        params
      );
    } catch (err) {
      console.warn("[PostgresProjectStore] Failed to update:", err instanceof Error ? err.message : String(err));
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      if (!this.initialized) await this.init();
      const result = await this.pool.query("DELETE FROM projects WHERE id = $1", [id]);
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      console.warn("[PostgresProjectStore] Failed to delete:", err instanceof Error ? err.message : String(err));
      return false;
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
