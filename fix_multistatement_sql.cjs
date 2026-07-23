const fs = require('fs');

/**
 * Fix multi-statement SQL in store init() methods.
 * better-sqlite3's .prepare() rejects multi-statement strings,
 * so we must split CREATE TABLE + CREATE INDEX into separate db.query() calls.
 */

const files = [
  {
    path: 'src/api/wbsStore.ts',
    old: `await this.db.query(\`
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
      \`);`,
    new: `await this.db.query(\`
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
      \`);
      await this.db.query(\`
        CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);
      \`);`
  },
  {
    path: 'src/api/phaseReportStore.ts',
    old: `await this.db.query(\`
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
      \`);`,
    new: `await this.db.query(\`
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
      \`);
      await this.db.query(\`
        CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);
      \`);`
  },
  {
    path: 'src/api/taskHistoryStore.ts',
    old: `await this.db.query(\`
        CREATE TABLE IF NOT EXISTS task_history (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iterations INTEGER DEFAULT 0,
          total_tokens INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
      \`);`,
    new: `await this.db.query(\`
        CREATE TABLE IF NOT EXISTS task_history (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          summary TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iterations INTEGER DEFAULT 0,
          total_tokens INTEGER
        );
      \`);
      await this.db.query(\`
        CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
      \`);`
  },
  {
    path: 'src/api/planStore.ts',
    old: `await this.db.query(\`
        CREATE TABLE IF NOT EXISTS plans (
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
        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
      \`);`,
    new: `await this.db.query(\`
        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY,
          task_description TEXT NOT NULL,
          plan_content TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      \`);
      await this.db.query(\`
        CREATE TABLE IF NOT EXISTS plan_tasks (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          task_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      \`);
      await this.db.query(\`
        CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);
      \`);
      await this.db.query(\`
        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
      \`);`
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
      console.log(`✓ ${file.path} — fixed`);
      successCount++;
    } else {
      console.log(`✗ ${file.path} — pattern not found (may already be fixed)`);
      failCount++;
    }
  } catch (err) {
    console.log(`✗ ${file.path} — error: ${err.message}`);
    failCount++;
  }
}

console.log(`\nDone: ${successCount} fixed, ${failCount} failed`);
