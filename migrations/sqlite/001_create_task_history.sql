-- Migration 001: Create task_history table (SQLite)
-- Stores completed top-level task entries for persistence across sessions.
-- Each entry records the task description, summary, timestamp, iteration count,
-- and total token usage.
--
-- SQLite-specific notes:
-- - TEXT is used for all string fields (SQLite has no native datetime type)
-- - INTEGER is used for numeric fields
-- - datetime('now') is used instead of NOW()
-- - CREATE INDEX IF NOT EXISTS is supported in SQLite 3.3.0+

CREATE TABLE IF NOT EXISTS task_history (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    summary TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    iterations INTEGER DEFAULT 0,
    total_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
