-- Migration 002: Create phase_reports table (SQLite)
-- Stores phase report content, tokens, and iterations per phase.
-- Used by the phase planning system to persist per-phase results.

CREATE TABLE IF NOT EXISTS phase_reports (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    phase_number INTEGER NOT NULL,
    phase_title TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    iterations INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);
