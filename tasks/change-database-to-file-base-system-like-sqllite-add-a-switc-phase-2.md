# Phase 2: Design Configuration & Connection Factory
Create a configuration switch (e.g., `DATABASE_TYPE=sqlite|postgres`) with SQLite as default. Implement a connection factory that returns the appropriate database client based on the config. Define the SQLite file path convention and ensure all connection parameters are configurable.

**Task:** change database to file base system like sqllite , add a switch to use [sqllite or Postgres] make sqllite as default

**Result:**

## What was accomplished

- **Created `src/db/types.ts`** — Defines `DatabaseType` (`"sqlite" | "postgres"`), `QueryResult<T>` interface, and `DatabaseClient` interface with `init()`, `query()`, `close()`, and `initialized` property.
- **Created `src/db/config.ts`** — Defines `DatabaseConfig` interface with all connection parameters (SQLite path, Postgres host/port/database/user/password/SSL/pool settings). Implements `loadDatabaseConfig()` reading from environment variables with defaults:
  - `DATABASE_TYPE=sqlite|postgres` (default: `sqlite`)
  - `DATABASE_SQLITE_PATH` (default: `~/.devnull/data/devnull.db`)
  - `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_SSL`, `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE`, `DATABASE_POOL_TIMEOUT`
- **Created `src/db/sqliteClient.ts`** — `SqliteClient` implementing `DatabaseClient` using `better-sqlite3`. Enables WAL mode and foreign keys on init. Handles SELECT, INSERT/UPDATE/DELETE, and DDL statements with proper result shapes. Graceful fallback on errors (logs warning, returns empty result).
- **Created `src/db/postgresClient.ts`** — `PostgresClient` implementing `DatabaseClient` wrapping `pg.Pool`. Supports both `DATABASE_URL` connection string and individual connection parameters. Same graceful fallback pattern.
- **Created `src/db/connection.ts`** — `createConnection(config?)` factory function that returns `SqliteClient` or `PostgresClient` based on config type. `createConnectionAsync()` convenience function that loads config and calls `init()`.
- **Created `src/db/index.ts`** — Barrel export for all database module types and functions.
- **Installed `better-sqlite3` and `@types/better-sqlite3`** — Added as runtime and dev dependencies respectively.

## What was left undone

- **No existing store classes were migrated** — The 7 existing store classes (`PostgresProjectStore`, `PlanStore`, `TaskHistoryStore`, `PhaseReportStore`, `WbsStore`, `PostgresTelemetry`, `PostgresTaskHistory`) still create their own independent `pg.Pool` instances. They have not been updated to use the new `DatabaseClient` interface or the connection factory.
- **No `_.env_` update** — The `.env` file was not updated with the new `DATABASE_TYPE` and SQLite config variables (this was listed in the plan but not executed).
- **No TypeScript compilation verification** — The plan included a step to verify TypeScript compiles without errors, but this was not executed.
- **No tests** — No unit tests were written for the new database abstraction layer.

## Key decisions made

- **Chose `better-sqlite3` over `sql.js`** — `better-sqlite3` is synchronous (simpler API, no callback overhead), faster for typical workloads, and the most widely used SQLite binding for Node.js. It requires native compilation but is well-maintained.
- **SQLite file path convention: `~/.devnull/data/devnull.db`** — Uses `DEVNULL_HOME` env var if set, otherwise `os.homedir()`. The directory is auto-created on config load.
- **`DatabaseClient` interface is async** — Even though `better-sqlite3` is synchronous, the interface uses `async` methods to match the existing `pg.Pool` async pattern, making it easy to swap implementations.
- **Graceful fallback pattern preserved** — Both clients follow the same error-handling pattern as existing stores: catch errors, log warnings, return safe fallbacks (empty rows, zero counts).
- **PostgresClient uses `SELECT 1` for init verification** — Unlike the existing stores which create tables in `init()`, the new `PostgresClient.init()` just verifies connectivity. Schema management remains per-store responsibility.

## Blockers encountered

- **No blockers encountered.** The implementation was straightforward — the existing codebase had a clear pattern to follow, and the new abstraction layer was designed to be a drop-in replacement that existing stores can be migrated to in a future phase.

**Stats:**
- Tokens: 1,095,817
- Iterations: 21
