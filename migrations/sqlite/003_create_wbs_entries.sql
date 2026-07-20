-- Migration 003: Create wbs_entries table (SQLite)
-- Stores Work Breakdown Structure entries with status tracking per phase.
-- Used by the phase planning system to track progress across phases.

CREATE TABLE IF NOT EXISTS wbs_entries (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    task_description TEXT NOT NULL,
    phase_number INTEGER NOT NULL,
    phase_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);
