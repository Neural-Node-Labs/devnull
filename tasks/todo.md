# Plan: Phase 5 — Integration, Testing & Validation

## Tasks

- [x] **1. Fix `PostgresClient` constructor** — Update `src/db/postgresClient.ts` to accept a connection string (string) in addition to the existing `DatabaseConfig`, matching how `SqliteClient` handles it.

- [x] **2. Fix smoke test call sites** — Update `src/test/testEnhancementSmoke.ts` to create `DatabaseClient` instances before passing them to stores, instead of passing raw connection strings.

- [x] **3. Add unit tests for `SqliteClient`** — Create `tests/unit/sqliteClient.test.ts` with CRUD operations, SQL dialect translation, and connection lifecycle tests.

- [x] **4. Add unit tests for `PostgresClient`** — Create `tests/unit/postgresClient.test.ts` mirroring the SQLite client tests.

- [x] **5. Add integration tests for database switching** — Create `tests/unit/databaseSwitching.test.ts` that verifies the factory function returns the correct client type based on config.

- [x] **6. Run full test suite** — Execute `npm test` and fix any failures.

- [x] **7. Validate default (SQLite) path end-to-end** — Run the application with default config and verify the database file is created and CRUD operations work.

- [x] **8. Document results** — Update this file with completed items and test results.

## Results

### Task 1: Fix `PostgresClient` constructor
**Status:** ✅ Complete
**Changes:**
- Updated `PostgresClient` constructor to accept `DatabaseConfig | string` — if a string is passed, it's treated as a PostgreSQL connection URL and converted to a `DatabaseConfig` internally.
- This maintains backward compatibility with the smoke test that passes raw connection strings.

### Task 2: Fix smoke test call sites
**Status:** ✅ Complete
**Changes:**
- Updated `src/test/testEnhancementSmoke.ts` to create `DatabaseClient` instances via `createConnection()` before passing them to store constructors.
- All 4 store instantiations (PostgresTelemetry, PostgresTaskHistory, PostgresProjectStore, PlanStore) now use proper `DatabaseClient` objects.

### Task 3: Add unit tests for `SqliteClient`
**Status:** ✅ Complete
**Changes:**
- Created `tests/unit/sqliteClient.test.ts` with tests for:
  - Connection lifecycle (init, close, re-init)
  - CRUD operations (INSERT, SELECT, UPDATE, DELETE)
  - SQL dialect translation (ILIKE→LIKE, $1→?, NOW(), EXCLUDED, SERIAL→INTEGER, JSONB→TEXT, BOOLEAN→INTEGER, RETURNING stripping)
  - Error handling (bad SQL, uninitialized client)
  - WAL mode and foreign keys pragmas

### Task 4: Add unit tests for `PostgresClient`
**Status:** ✅ Complete
**Changes:**
- Created `tests/unit/postgresClient.test.ts` with tests for:
  - Connection lifecycle (init, close, re-init)
  - CRUD operations (INSERT, SELECT, UPDATE, DELETE)
  - Error handling (bad SQL, uninitialized client)
  - Connection string constructor (backward compatibility)
  - Config-based constructor

### Task 5: Add integration tests for database switching
**Status:** ✅ Complete
**Changes:**
- Created `tests/unit/databaseSwitching.test.ts` with tests for:
  - Factory function returns `SqliteClient` for SQLite config
  - Factory function returns `PostgresClient` for PostgreSQL config
  - Default config (no env vars) returns `SqliteClient`
  - `createConnectionAsync()` loads config and initializes
  - `loadDatabaseConfig()` defaults to SQLite
  - `loadDatabaseConfig()` respects `DATABASE_TYPE=postgres`

### Task 6: Run full test suite
**Status:** ✅ Complete
**Results:** All 13 test files pass (0 failures).

### Task 7: Validate default (SQLite) path end-to-end
**Status:** ✅ Complete
**Results:**
- Database file created at `~/.devnull/data/devnull.db`
- All CRUD operations work via the abstraction layer
- No PostgreSQL-specific errors surface with default config

### Task 8: Document results
**Status:** ✅ Complete
**Changes:**
- This file updated with all results.
- Lessons learned captured in `tasks/lessons.md`.
