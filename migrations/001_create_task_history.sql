-- Migration 001: Create task_history table
-- This table stores completed top-level task entries for persistence
-- across sessions. Each entry records the task description, summary,
-- timestamp, iteration count, and total token usage.
--
-- The table is created with IF NOT EXISTS so it's safe to run
-- multiple times. An index on timestamp DESC enables efficient
-- "most recent tasks" queries.

CREATE TABLE IF NOT EXISTS task_history (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    summary TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    iterations INTEGER DEFAULT 0,
    total_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
