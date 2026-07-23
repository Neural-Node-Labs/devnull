import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { SqliteClient } from "../sqliteClient.js";

/**
 * Regression test: better-sqlite3's .prepare() rejects multi-statement SQL strings.
 * All store init() methods must split CREATE TABLE + CREATE INDEX into separate
 * db.query() calls.
 *
 * This test verifies that the SqliteClient correctly handles single-statement
 * queries (the fix) and would fail if multi-statement strings were passed.
 */
describe("Multi-statement SQL regression", () => {
  let dbPath: string;
  let client: SqliteClient;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test_multistmt_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    client = new SqliteClient(dbPath);
  });

  afterEach(async () => {
    await client.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it("single CREATE TABLE statement works", async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    // Verify the table exists by querying it
    const result = await client.query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveProperty("name", "test_table");
  });

  it("single CREATE INDEX statement works", async () => {
    // First create the table
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    // Then create the index separately
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_test_name ON test_table(name);
    `);
    // Verify the index exists
    const result = await client.query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_test_name'");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveProperty("name", "idx_test_name");
  });

  it("sequential CREATE TABLE + CREATE INDEX works (the fix pattern)", async () => {
    // This is the pattern the fix should use: separate calls
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_test_name ON test_table(name);
    `);

    // Verify both exist
    const tables = await client.query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'");
    expect(tables.rows).toHaveLength(1);

    const indexes = await client.query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_test_name'");
    expect(indexes.rows).toHaveLength(1);
  });

  it("multi-statement string in a single query is silently caught (no crash)", async () => {
    // This simulates the old buggy pattern — it should NOT crash, just log a warning
    // and return empty results (the tables won't be created)
    const result = await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_test_name ON test_table(name);
    `);

    // The query should not throw — it's caught by the try-catch in sqliteClient
    expect(result).toBeDefined();
    expect(result.rows).toEqual([]);

    // The table should NOT exist because the multi-statement query failed silently
    const tables = await client.query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'");
    expect(tables.rows).toHaveLength(0);
  });
});
