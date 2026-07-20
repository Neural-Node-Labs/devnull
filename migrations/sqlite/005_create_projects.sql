-- Migration 005: Create projects table (SQLite)
-- Stores user projects with workspace paths.
-- Used by the PostgresProjectStore (database-backed project storage).

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    active INTEGER DEFAULT 0,
    include_in_llm INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);
