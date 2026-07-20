const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

// Test 1: In-memory DB creation
test('In-memory SQLite database creation', () => {
  const db = new Database(':memory:');
  db.close();
});

// Test 2: Table creation
test('Table creation', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
  db.close();
});

// Test 3: Insert
test('Insert row', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
  const info = db.prepare('INSERT INTO test (name, value) VALUES (?, ?)').run('hello', 42.5);
  if (info.changes !== 1) throw new Error(`Expected 1 change, got ${info.changes}`);
  db.close();
});

// Test 4: Select
test('Select row', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
  db.prepare('INSERT INTO test (name, value) VALUES (?, ?)').run('hello', 42.5);
  const row = db.prepare('SELECT * FROM test WHERE id = ?').get(1);
  if (row.name !== 'hello') throw new Error(`Expected name 'hello', got '${row.name}'`);
  if (row.value !== 42.5) throw new Error(`Expected value 42.5, got ${row.value}`);
  db.close();
});

// Test 5: Multiple rows
test('Multiple rows', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
  const insert = db.prepare('INSERT INTO test (name, value) VALUES (?, ?)');
  for (let i = 0; i < 10; i++) insert.run('item-' + i, i * 1.5);
  const count = db.prepare('SELECT COUNT(*) as cnt FROM test').get();
  if (count.cnt !== 10) throw new Error(`Expected 10 rows, got ${count.cnt}`);
  db.close();
});

// Test 6: Transactions
test('Transactions', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
  const tx = db.transaction(() => {
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO test (name, value) VALUES (?, ?)').run('tx-' + i, i);
    }
  });
  tx();
  const count = db.prepare('SELECT COUNT(*) as cnt FROM test').get();
  if (count.cnt !== 5) throw new Error(`Expected 5 rows after tx, got ${count.cnt}`);
  db.close();
});

// Test 7: File-based DB with persistence
test('File-based DB persistence', () => {
  const dbFile = path.join(__dirname, 'test_validation.db');
  try {
    const fileDb = new Database(dbFile);
    fileDb.exec('CREATE TABLE IF NOT EXISTS persistent (id INTEGER PRIMARY KEY, data TEXT)');
    fileDb.prepare('INSERT INTO persistent (data) VALUES (?)').run('persistent-data');
    fileDb.close();

    const fileDb2 = new Database(dbFile);
    const rows = fileDb2.prepare('SELECT * FROM persistent').all();
    if (rows.length !== 1) throw new Error(`Expected 1 row, got ${rows.length}`);
    if (rows[0].data !== 'persistent-data') throw new Error(`Data mismatch`);
    fileDb2.close();
  } finally {
    if (fs.existsSync(dbFile)) try { fs.unlinkSync(dbFile); } catch(e) {}
  }
});

// Test 8: WAL mode (file-based DB, not in-memory)
test('WAL journal mode on file DB', () => {
  const dbFile = path.join(__dirname, 'test_wal.db');
  try {
    const db = new Database(dbFile);
    db.pragma('journal_mode = WAL');
    const mode = db.pragma('journal_mode');
    const modeVal = Array.isArray(mode) ? mode[0].journal_mode : mode.journal_mode;
    if (modeVal !== 'wal') throw new Error(`WAL mode not set: ${JSON.stringify(mode)}`);
    db.close();
  } finally {
    if (fs.existsSync(dbFile)) try { fs.unlinkSync(dbFile); } catch(e) {}
  }
});

// Test 9: Prepared statement with multiple params
test('Prepared statement with multiple param types', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (a INTEGER, b TEXT, c REAL, d BLOB)');
  db.prepare('INSERT INTO t VALUES (?, ?, ?, ?)').run(1, 'str', 3.14, Buffer.from('blob'));
  const row = db.prepare('SELECT * FROM t').get();
  if (row.a !== 1) throw new Error(`Expected a=1, got ${row.a}`);
  if (row.b !== 'str') throw new Error(`Expected b='str', got '${row.b}'`);
  if (row.c !== 3.14) throw new Error(`Expected c=3.14, got ${row.c}`);
  db.close();
});

// Test 10: Rollback on error in transaction
test('Transaction rollback on error', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO test (name) VALUES (?)').run('before');
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO test (name) VALUES (?)').run('during');
      throw new Error('force rollback');
    })();
  } catch (e) {
    // expected
  }
  const rows = db.prepare('SELECT * FROM test').all();
  if (rows.length !== 1) throw new Error(`Expected 1 row after rollback, got ${rows.length}`);
  db.close();
});

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
