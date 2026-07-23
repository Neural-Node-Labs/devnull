#!/usr/bin/env python3
"""Split multi-statement SQL in store init() methods into separate db.query() calls."""

import re

files = {}

# ── src/api/planStore.ts ──
files['src/api/planStore.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS plans (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task_description TEXT NOT NULL,\n'
        '          plan_content TEXT NOT NULL,\n'
        '          status TEXT NOT NULL DEFAULT \'active\',\n'
        '          created_at TEXT DEFAULT (datetime(\'now\')),\n'
        '          updated_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE TABLE IF NOT EXISTS plan_tasks (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,\n'
        '          description TEXT NOT NULL,\n'
        '          status TEXT NOT NULL DEFAULT \'pending\',\n'
        '          task_order INTEGER NOT NULL DEFAULT 0,\n'
        '          created_at TEXT DEFAULT (datetime(\'now\')),\n'
        '          updated_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);\n'
        '        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS plans (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task_description TEXT NOT NULL,\n'
        '          plan_content TEXT NOT NULL,\n'
        '          status TEXT NOT NULL DEFAULT \'active\',\n'
        '          created_at TEXT DEFAULT (datetime(\'now\')),\n'
        '          updated_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS plan_tasks (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,\n'
        '          description TEXT NOT NULL,\n'
        '          status TEXT NOT NULL DEFAULT \'pending\',\n'
        '          task_order INTEGER NOT NULL DEFAULT 0,\n'
        '          created_at TEXT DEFAULT (datetime(\'now\')),\n'
        '          updated_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);`);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);`);\n'
    )
}

# ── src/api/phaseReportStore.ts ──
files['src/api/phaseReportStore.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS phase_reports (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task_id TEXT NOT NULL,\n'
        '          phase_number INTEGER NOT NULL,\n'
        '          phase_title TEXT NOT NULL,\n'
        '          content TEXT NOT NULL,\n'
        '          tokens INTEGER DEFAULT 0,\n'
        '          iterations INTEGER DEFAULT 0,\n'
        '          created_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS phase_reports (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task_id TEXT NOT NULL,\n'
        '          phase_number INTEGER NOT NULL,\n'
        '          phase_title TEXT NOT NULL,\n'
        '          content TEXT NOT NULL,\n'
        '          tokens INTEGER DEFAULT 0,\n'
        '          iterations INTEGER DEFAULT 0,\n'
        '          created_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);`);\n'
    )
}

# ── src/api/taskHistoryStore.ts ──
files['src/api/taskHistoryStore.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS task_history (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task TEXT NOT NULL,\n'
        '          summary TEXT NOT NULL,\n'
        '          timestamp TEXT NOT NULL,\n'
        '          iterations INTEGER DEFAULT 0,\n'
        '          total_tokens INTEGER\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS task_history (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task TEXT NOT NULL,\n'
        '          summary TEXT NOT NULL,\n'
        '          timestamp TEXT NOT NULL,\n'
        '          iterations INTEGER DEFAULT 0,\n'
        '          total_tokens INTEGER\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);`);\n'
    )
}

# ── src/api/wbsStore.ts ──
files['src/api/wbsStore.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS wbs_entries (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task_id TEXT NOT NULL,\n'
        '          task_description TEXT NOT NULL,\n'
        '          phase_number INTEGER NOT NULL,\n'
        '          phase_title TEXT NOT NULL,\n'
        '          status TEXT NOT NULL DEFAULT \'pending\',\n'
        '          created_at TEXT DEFAULT (datetime(\'now\')),\n'
        '          updated_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS wbs_entries (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task_id TEXT NOT NULL,\n'
        '          task_description TEXT NOT NULL,\n'
        '          phase_number INTEGER NOT NULL,\n'
        '          phase_title TEXT NOT NULL,\n'
        '          status TEXT NOT NULL DEFAULT \'pending\',\n'
        '          created_at TEXT DEFAULT (datetime(\'now\')),\n'
        '          updated_at TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);`);\n'
    )
}

# ── src/api/postgresProjectStore.ts ──
files['src/api/postgresProjectStore.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS projects (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          name TEXT NOT NULL,\n'
        '          path TEXT NOT NULL,\n'
        '          active INTEGER DEFAULT 0,\n'
        '          include_in_llm INTEGER DEFAULT 0,\n'
        '          created_at TEXT NOT NULL\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS projects (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          name TEXT NOT NULL,\n'
        '          path TEXT NOT NULL,\n'
        '          active INTEGER DEFAULT 0,\n'
        '          include_in_llm INTEGER DEFAULT 0,\n'
        '          created_at TEXT NOT NULL\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);`);\n'
    )
}

# ── src/core/postgresTaskHistory.ts ──
files['src/core/postgresTaskHistory.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS task_history (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task TEXT NOT NULL,\n'
        '          summary TEXT NOT NULL,\n'
        '          timestamp TEXT NOT NULL,\n'
        '          iterations INTEGER DEFAULT 0,\n'
        '          total_tokens INTEGER\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS task_history (\n'
        '          id TEXT PRIMARY KEY,\n'
        '          task TEXT NOT NULL,\n'
        '          summary TEXT NOT NULL,\n'
        '          timestamp TEXT NOT NULL,\n'
        '          iterations INTEGER DEFAULT 0,\n'
        '          total_tokens INTEGER\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);`);\n'
    )
}

# ── src/telemetry/postgresTelemetry.ts ──
files['src/telemetry/postgresTelemetry.ts'] = {
    'old': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS telemetry_logs (\n'
        '          id SERIAL PRIMARY KEY,\n'
        '          task_id TEXT,\n'
        '          iteration INTEGER,\n'
        '          phase TEXT,\n'
        '          thought TEXT,\n'
        '          action_tool TEXT,\n'
        '          action_input TEXT,\n'
        '          observation TEXT,\n'
        '          score INTEGER,\n'
        '          timestamp TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE TABLE IF NOT EXISTS telemetry_llm_calls (\n'
        '          id SERIAL PRIMARY KEY,\n'
        '          task_id TEXT,\n'
        '          request TEXT,\n'
        '          response TEXT,\n'
        '          timestamp TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE TABLE IF NOT EXISTS telemetry_errors (\n'
        '          id SERIAL PRIMARY KEY,\n'
        '          task_id TEXT,\n'
        '          context TEXT,\n'
        '          error_message TEXT,\n'
        '          error_stack TEXT,\n'
        '          timestamp TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '\n'
        '        CREATE INDEX IF NOT EXISTS idx_telemetry_logs_task_id ON telemetry_logs(task_id);\n'
        '        CREATE INDEX IF NOT EXISTS idx_telemetry_logs_timestamp ON telemetry_logs(timestamp);\n'
        '        CREATE INDEX IF NOT EXISTS idx_telemetry_llm_calls_task_id ON telemetry_llm_calls(task_id);\n'
        '        CREATE INDEX IF NOT EXISTS idx_telemetry_errors_task_id ON telemetry_errors(task_id);\n'
        '      `);\n'
    ),
    'new': (
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS telemetry_logs (\n'
        '          id SERIAL PRIMARY KEY,\n'
        '          task_id TEXT,\n'
        '          iteration INTEGER,\n'
        '          phase TEXT,\n'
        '          thought TEXT,\n'
        '          action_tool TEXT,\n'
        '          action_input TEXT,\n'
        '          observation TEXT,\n'
        '          score INTEGER,\n'
        '          timestamp TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS telemetry_llm_calls (\n'
        '          id SERIAL PRIMARY KEY,\n'
        '          task_id TEXT,\n'
        '          request TEXT,\n'
        '          response TEXT,\n'
        '          timestamp TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`\n'
        '        CREATE TABLE IF NOT EXISTS telemetry_errors (\n'
        '          id SERIAL PRIMARY KEY,\n'
        '          task_id TEXT,\n'
        '          context TEXT,\n'
        '          error_message TEXT,\n'
        '          error_stack TEXT,\n'
        '          timestamp TEXT DEFAULT (datetime(\'now\'))\n'
        '        );\n'
        '      `);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_logs_task_id ON telemetry_logs(task_id);`);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_logs_timestamp ON telemetry_logs(timestamp);`);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_llm_calls_task_id ON telemetry_llm_calls(task_id);`);\n'
        '      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_telemetry_errors_task_id ON telemetry_errors(task_id);`);\n'
    )
}

for filepath, changes in files.items():
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old = changes['old']
    new = changes['new']

    if old in content:
        content = content.replace(old, new, 1)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'FIXED: {filepath}')
    else:
        print(f'NOT FOUND in {filepath}')
        # Debug: show what's around the area
        idx = content.find('await this.db.query')
        if idx >= 0:
            print(f'  Found at index {idx}')
            print(f'  Context: {repr(content[idx:idx+300])}')
