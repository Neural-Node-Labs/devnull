/**
 * Fix multi-statement SQL in store files.
 * better-sqlite3's .prepare() rejects SQL strings with more than one statement.
 * This script splits them into individual db.query() calls.
 */
const fs = require("fs");
const path = require("path");

const files = [
  "src/api/planStore.ts",
  "src/api/wbsStore.ts",
  "src/api/phaseReportStore.ts",
  "src/api/taskHistoryStore.ts",
  "src/api/postgresProjectStore.ts",
  "src/core/postgresTaskHistory.ts",
];

function normalizeLineEndings(str) {
  return str.replace(/\r\n/g, "\n");
}

function fixFile(filePath) {
  console.log(`\n=== ${filePath} ===`);
  let content = fs.readFileSync(filePath, "utf8");
  const hasCRLF = content.includes("\r\n");
  const normalized = normalizeLineEndings(content);

  // Find the init() method and extract the db.query() call with multi-statement SQL
  const initMatch = normalized.match(
    /async init\(\)[\s\S]*?\{([\s\S]*?)\}\s*catch\s*\(/
  );

  if (!initMatch) {
    console.log("  Could not find init() method");
    return false;
  }

  const initBody = initMatch[1];

  // Find multi-statement db.query() calls (containing CREATE TABLE + CREATE INDEX or multiple CREATE TABLE)
  const queryMatch = initBody.match(
    /await this\.db\.query\(`([\s\S]*?)`\s*\);/
  );

  if (!queryMatch) {
    console.log("  No db.query() call found in init()");
    return false;
  }

  const fullQuery = queryMatch[0];
  const sqlContent = queryMatch[1];

  // Split by semicolons followed by newline and optional whitespace
  const statements = sqlContent
    .split(/;\s*\n\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length <= 1) {
    console.log("  Only one statement found, no fix needed");
    return false;
  }

  console.log(`  Found ${statements.length} statements to split`);

  // Build replacement: individual db.query() calls
  const newQueries = statements
    .map((stmt) => {
      // Re-indent the statement
      const indented = stmt
        .split("\n")
        .map((line, i) => (i === 0 ? line : `          ${line.trim()}`))
        .join("\n");
      return `      await this.db.query(\`\n        ${indented};\n      \`);`;
    })
    .join("\n");

  const newContent = normalized.replace(fullQuery, newQueries);

  // Write back with original line endings
  fs.writeFileSync(filePath, hasCRLF ? newContent.replace(/\n/g, "\r\n") : newContent, "utf8");
  console.log(`  ✅ Fixed: split ${statements.length} statements`);
  return true;
}

let fixed = 0;
for (const f of files) {
  if (fixFile(f)) fixed++;
}
console.log(`\nFixed ${fixed} of ${files.length} files.`);
