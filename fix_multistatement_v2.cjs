const fs = require('fs');

/**
 * Fix multi-statement SQL in store init() methods.
 * better-sqlite3's .prepare() rejects multi-statement strings,
 * so we must split CREATE TABLE + CREATE INDEX into separate db.query() calls.
 * 
 * This version handles \r\n line endings (Windows) properly.
 */

const files = [
  {
    path: 'src/api/wbsStore.ts',
    old: `        CREATE TABLE IF NOT EXISTS wbs_entries (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          task_description TEXT NOT NULL,
          phase_number INTEGER NOT NULL,
          phase_title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);`,
    new: `        CREATE TABLE IF NOT EXISTS wbs_entries (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          task_description TEXT NOT NULL,
          phase_number INTEGER NOT NULL,
          phase_title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);`
  },
  {
    path: 'src/api/phaseReportStore.ts',
    old: `        CREATE TABLE IF NOT EXISTS phase_reports (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          phase_number INTEGER NOT NULL,
          phase_title TEXT NOT NULL,
          content TEXT NOT NULL,
          tokens INTEGER DEFAULT 0,
          iterations INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);`,
    new: `        CREATE TABLE IF NOT EXISTS phase_reports (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          phase_number INTEGER NOT NULL,
          phase_title TEXT NOT NULL,
          content TEXT NOT NULL,
          tokens INTEGER DEFAULT 0,
          iterations INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);`
  },
  {
    path: 'src/api/taskHistoryStore.ts',
    old: `        CREATE TABLE IF NOT EXISTS task_history (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iterations INTEGER DEFAULT 0,
          total_tokens INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);`,
    new: `        CREATE TABLE IF NOT EXISTS task_history (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iterations INTEGER DEFAULT 0,
          total_tokens INTEGER
        );
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);`
  },
  {
    path: 'src/api/planStore.ts',
    old: `        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY,
          task_description TEXT NOT NULL,
          plan_content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS plan_tasks (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          task_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);
        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);`,
    new: `        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY,
          task_description TEXT NOT NULL,
          plan_content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE TABLE IF NOT EXISTS plan_tasks (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          task_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);`
  },
  {
    path: 'src/api/postgresProjectStore.ts',
    old: `        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          active INTEGER DEFAULT 0,
          include_in_llm INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);`,
    new: `        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          active INTEGER DEFAULT 0,
          include_in_llm INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );
      ` + '`);' + `
      await this.db.query(` + '`' + `
        CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(active);`
  }
];

let successCount = 0;
let failCount = 0;

for (const file of files) {
  try {
    let content = fs.readFileSync(file.path, 'utf8');
    if (content.includes(file.old)) {
      content = content.replace(file.old, file.new);
      fs.writeFileSync(file.path, content, 'utf8');
      console.log('✓ ' + file.path + ' — fixed');
      successCount++;
    } else {
      console.log('✗ ' + file.path + ' — pattern not found (may already be fixed)');
      failCount++;
    }
  } catch (err) {
    console.log('✗ ' + file.path + ' — error: ' + err.message);
    failCount++;
  }
}

console.log('\nDone: ' + successCount + ' fixed, ' + failCount + ' failed');
