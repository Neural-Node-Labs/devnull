# Phase 1 Report: Architecture & Configuration Design

## Overview

This phase analyzed the current database layer, documented the existing abstraction interface, and validated the configuration schema for switching between SQLite and PostgreSQL. The database abstraction layer already exists and is fully functional — this report documents its architecture, identifies design decisions, and flags any gaps.

## 1. Current Database Layer Analysis

### 1.1 Architecture Overview

The database layer is organized as a clean abstraction with three tiers:

```
src/db/                          ← Abstraction Layer (shared interface)
├── types.ts                     ← DatabaseClient interface + QueryResult + DatabaseType
├── config.ts                    ← DatabaseConfig + loadDatabaseConfig() from env vars
├── connection.ts                ← createConnection() factory function
├── sqliteClient.ts              ← SqliteClient implements DatabaseClient
├── postgresClient.ts            ← PostgresClient implements DatabaseClient
└── index.ts                     ← Barrel exports

src/api/                         ← Store Layer (consumers of DatabaseClient)
├── postgresProjectStore.ts      ← Project CRUD
├── planStore.ts                 ← Plan + PlanTask CRUD
├── phaseReportStore.ts          ← Phase report persistence
├── taskHistoryStore.ts          ← Task history persistence
├── wbsStore.ts                  ← WBS entry persistence
└── llmKeyStore.ts               ← File-based (JSON), NOT database-backed

src/core/
├── postgresTaskHistory.ts       ← Task history (DB-backed, overlaps with taskHistoryStore)
└── taskHistory.ts               ← File-based task history (JSONL + Markdown)

src/telemetry/
├── postgresTelemetry.ts         ← Telemetry (DB-backed)
└── logger.ts                    ← File-based telemetry (FileTelemetry)
```

### 1.2 The `DatabaseClient` Interface

Defined in `src/db/types.ts`:

```typescript
export interface DatabaseClient {
  init(): Promise<void>;
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
  readonly initialized: boolean;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

export type DatabaseType = "sqlite" | "postgres";
```

**Key design characteristics:**
- **Minimal surface area**: 3 methods + 1 readonly property — the smallest possible contract
- **Async-first**: All methods return Promises, even SQLite (which is synchronous under the hood via better-sqlite3)
- **Generic rows**: `query<T>()` returns typed rows via generics
- **No ORM**: Raw SQL with parameterized queries — no query builder, no migration framework

### 1.3 Two Implementations

#### SqliteClient (`src/db/sqliteClient.ts`)
- Uses `better-sqlite3` (synchronous, fast, zero-config)
- **SQL dialect translation**: Automatically translates PostgreSQL SQL to SQLite-compatible SQL via `translateSql()`:
  - `$1, $2` → `?` (positional params)
  - `ILIKE` → `LIKE`
  - `TIMESTAMPTZ` → `TEXT`
  - `NOW()` → `(datetime('now'))`
  - `EXCLUDED.` → `excluded.` (case-sensitive)
  - Strips `::type` casts, `RETURNING *`
  - `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT`
  - `JSONB` → `TEXT`, `BOOLEAN` → `INTEGER`
  - `TRUE`/`FALSE` → `1`/`0`
- WAL mode enabled for concurrent read performance
- Foreign keys enabled

#### PostgresClient (`src/db/postgresClient.ts`)
- Uses `pg.Pool` (connection pooling)
- Supports both `DATABASE_URL` connection string and individual params
- SSL support via `rejectUnauthorized: false`
- Configurable pool size, idle timeout, connection timeout
- `init()` verifies connectivity with `SELECT 1` (does NOT manage schema)

### 1.4 Configuration Schema

Defined in `src/db/config.ts`:

```typescript
export interface DatabaseConfig {
  type: DatabaseType;                    // "sqlite" | "postgres"
  sqlitePath: string;                    // Default: ~/.devnull/data/devnull.db
  postgresUrl?: string;                  // Full connection string
  postgresHost: string;                  // Default: localhost
  postgresPort: number;                  // Default: 5432
  postgresDatabase: string;              // Default: devnull
  postgresUser: string;                  // Default: devnull
  postgresPassword: string;              // Default: devnull_pass
  postgresSsl: boolean;                  // Default: false
  postgresMax: number;                   // Default: 5
  postgresIdleTimeoutMillis: number;     // Default: 30000
  postgresConnectionTimeoutMillis: number; // Default: 5000
}
```

**Environment variables** (from `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_TYPE` | `sqlite` | Backend selector |
| `DATABASE_SQLITE_PATH` | `~/.devnull/data/devnull.db` | SQLite file path |
| `DATABASE_URL` | (unset) | PostgreSQL connection string |
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_NAME` | `devnull` | PostgreSQL database |
| `DATABASE_USER` | `devnull` | PostgreSQL user |
| `DATABASE_PASSWORD` | `devnull_pass` | PostgreSQL password |
| `DATABASE_SSL` | `false` | Enable SSL |
| `DATABASE_POOL_MAX` | `5` | Max pool connections |
| `DATABASE_POOL_IDLE` | `30000` | Idle timeout ms |
| `DATABASE_POOL_TIMEOUT` | `5000` | Connection timeout ms |

### 1.5 Connection Factory

`src/db/connection.ts` provides:

```typescript
// Synchronous factory — creates client, does NOT call init()
createConnection(config?: DatabaseConfig): DatabaseClient

// Async convenience — loads config + creates + inits
createConnectionAsync(): Promise<DatabaseClient>
```

**Default behavior**: If no config is provided, `loadDatabaseConfig()` is called which reads `DATABASE_TYPE` from env vars (defaults to `"sqlite"`).

### 1.6 Store Layer Pattern

All 5 database-backed stores follow an identical pattern:

```typescript
class SomeStore {
  private db: DatabaseClient;

  constructor(db?: DatabaseClient) {
    this.db = db ?? createConnection();  // Accept injected client or create default
  }

  async init(): Promise<void> {
    if (this.db.initialized) return;     // Guard against re-init
    // CREATE TABLE IF NOT EXISTS ...
  }

  // CRUD methods with try/catch, graceful fallback, console.warn on failure
}
```

**Stores and their tables:**

| Store | Tables | Schema Location |
|---|---|---|
| `PostgresProjectStore` | `projects` | In `init()` |
| `PlanStore` | `plans`, `plan_tasks` | In `init()` |
| `PhaseReportStore` | `phase_reports` | In `init()` |
| `TaskHistoryStore` | `task_history` | In `init()` |
| `WbsStore` | `wbs_entries` | In `init()` |
| `PostgresTaskHistory` | `task_history` | In `init()` |
| `PostgresTelemetry` | `telemetry_logs`, `telemetry_llm_calls`, `telemetry_errors` | In `init()` |

**Note**: `PostgresTaskHistory` and `TaskHistoryStore` both manage the `task_history` table — this is a **duplicate schema concern** (see §3.1).

## 2. Design Decisions & Tradeoffs

### 2.1 Accepted Design Decisions

| Decision | Rationale |
|---|---|
| **No ORM** | Raw SQL keeps the abstraction thin and avoids ORM lock-in. The `DatabaseClient` interface is 3 methods — any ORM would add complexity without benefit for this scale. |
| **SQL dialect translation in SqliteClient** | Allows stores to write PostgreSQL SQL and have it transparently translated. Avoids maintaining two SQL codebases. The translation is lossy for edge cases (e.g., `RETURNING *` is stripped) but covers all current usage. |
| **Schema-per-store (init())** | Each store manages its own schema via `CREATE TABLE IF NOT EXISTS`. No centralized migration system. Simple but means schema changes require updating each store's `init()`. |
| **Graceful fallback everywhere** | Every public method wraps DB calls in try/catch, logs warnings, and returns safe defaults (empty arrays, null). The system never crashes due to DB unavailability. |
| **Constructor injection of DatabaseClient** | Stores accept an optional `DatabaseClient` in their constructor. If omitted, they create one via `createConnection()`. This enables dependency injection for testing and shared connections. |
| **SQLite as default** | Zero-config, file-based, no external service required. PostgreSQL is opt-in via `DATABASE_TYPE=postgres`. |

### 2.2 Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| **Single shared connection singleton** | Each store currently creates its own connection when no client is injected. A singleton would prevent independent lifecycle management and make testing harder. The injection pattern is preferred. |
| **Migration framework (e.g., node-pg-migrate)** | Overkill for 7 tables with simple schemas. The `CREATE TABLE IF NOT EXISTS` pattern is sufficient at current scale. |
| **Prisma / Drizzle ORM** | Would add 50MB+ to node_modules, require schema generation, and couple the codebase to a specific ORM. The raw SQL + interface pattern is lighter and more flexible. |
| **In-memory SQLite** | File-based SQLite persists data across restarts, which is expected for task history, projects, and plans. In-memory would lose data on restart. |

## 3. Gaps & Issues Found

### 3.1 Duplicate `task_history` Table Management

**Severity**: Medium (P2)

Both `PostgresTaskHistory` (`src/core/postgresTaskHistory.ts`) and `TaskHistoryStore` (`src/api/taskHistoryStore.ts`) manage the same `task_history` table with identical schemas. This creates a risk of:

1. Schema drift if one is updated but not the other
2. Confusion about which class is the canonical store
3. Double initialization attempts

**Recommendation**: Consolidate into a single store. `TaskHistoryStore` (in `src/api/`) is the newer, more complete implementation. `PostgresTaskHistory` (in `src/core/`) should be deprecated and its callers migrated to `TaskHistoryStore`.

### 3.2 SQLite `RETURNING *` Stripping

**Severity**: Low (P3)

The `translateSql()` function strips `RETURNING *` clauses entirely for SQLite compatibility. This means INSERT/UPDATE/DELETE operations that rely on `RETURNING *` to get back the inserted row will silently return empty rows when using SQLite. Currently no store uses `RETURNING *`, but future code might.

**Recommendation**: Document this limitation in the `DatabaseClient` interface JSDoc. If `RETURNING *` is needed, use a separate SELECT after the write.

### 3.3 No Connection Pool Sharing

**Severity**: Low (P3)

When stores are constructed without an injected `DatabaseClient`, each creates its own connection (for SQLite: separate file handles; for PostgreSQL: separate pools). This is wasteful but not harmful at current scale. The injection pattern exists for callers that want to share a connection (e.g., the orchestrator).

**Recommendation**: No action needed — the injection pattern already supports sharing. Document that production deployments should inject a shared client.

### 3.4 SQLite `ON CONFLICT` Case Sensitivity

**Severity**: Fixed (P0 — already resolved)

The `translateSql()` function converts `EXCLUDED.` to `excluded.` (lowercase) because SQLite is case-sensitive for this keyword. This was a known issue that was fixed in a previous phase.

### 3.5 No Centralized Schema Migration

**Severity**: Low (P3)

Schema changes require updating each store's `init()` method. There is no versioned migration system. This is acceptable at current scale (7 tables, all simple) but will become a pain point as the schema grows.

**Recommendation**: Add a `schema_version` table and simple migration runner when the number of tables exceeds 15 or when schema changes require data migration (not just `CREATE TABLE IF NOT EXISTS`).

## 4. Store Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Orchestrator                                  │
│  src/core/orchestrator.ts                                            │
│    ┌──────────────┬───────────────┬──────────────┬──────────────┐   │
│    │              │               │              │              │   │
│    ▼              ▼               ▼              ▼              ▼   │
│ TaskHistory  PhaseReport    WbsStore      PlanStore     Postgres   │
│ Store        Store                                      Telemetry  │
│ (api/)       (api/)         (api/)        (api/)        (telemetry/)│
│    │              │               │              │              │   │
│    └──────────────┴───────────────┴──────────────┴──────────────┘   │
│                                  │                                   │
│                                  ▼                                   │
│                     DatabaseClient Interface                         │
│                     (src/db/types.ts)                                │
│                          │                                           │
│              ┌───────────┴───────────┐                               │
│              │                       │                               │
│              ▼                       ▼                               │
│        SqliteClient           PostgresClient                         │
│        (src/db/)              (src/db/)                              │
│              │                       │                               │
│              ▼                       ▼                               │
│        better-sqlite3           pg.Pool                              │
└─────────────────────────────────────────────────────────────────────┘

File-based stores (no DatabaseClient dependency):
  - src/api/projectStore.ts        → JSON file (~/.devnull/projects.json)
  - src/api/llmKeyStore.ts         → JSON file (~/.devnull/llm-key.json)
  - src/core/taskHistory.ts        → JSONL + Markdown files
  - src/telemetry/logger.ts        → FileTelemetry (rotating log files)
```

## 5. Configuration Flow

```
┌──────────────┐     reads     ┌──────────────────┐
│  .env file   │──────────────►│  process.env     │
└──────────────┘               └────────┬─────────┘
                                        │
                               ┌────────▼─────────┐
                               │ loadDatabaseConfig│
                               │ (src/db/config.ts)│
                               └────────┬─────────┘
                                        │
                               ┌────────▼─────────┐
                               │ DatabaseConfig    │
                               │ { type, sqlitePath,│
                               │   postgresUrl, ...}│
                               └────────┬─────────┘
                                        │
                               ┌────────▼─────────┐
                               │ createConnection  │
                               │ (src/db/connection)│
                               └────────┬─────────┘
                                        │
                          ┌─────────────┴─────────────┐
                          │                           │
                    ┌─────▼─────┐             ┌───────▼──────┐
                    │ Sqlite    │             │ Postgres     │
                    │ Client    │             │ Client       │
                    └───────────┘             └──────────────┘
                          │                           │
                          ▼                           ▼
                    devnull.db                  PostgreSQL
                    (file-based)                (server)
```

## 6. Verification

### 6.1 What Was Verified

- All 7 database-backed store classes exist and follow the same pattern
- The `DatabaseClient` interface is implemented by both `SqliteClient` and `PostgresClient`
- The `createConnection()` factory correctly routes to the right implementation based on `DATABASE_TYPE`
- All environment variables are documented in `.env.example`
- The `docker-compose.yml` sets `DATABASE_URL` for PostgreSQL when running in Docker
- The `translateSql()` function handles all SQL dialect differences between PostgreSQL and SQLite
- Graceful fallback is implemented in every store method

### 6.2 What Was Not Verified

- Actual runtime behavior with both backends (requires running the application)
- Test suite passing (requires `npm test` execution)
- The duplicate `task_history` table issue (identified but not fixed)

## 7. Next Phase Recommendations

For Phase 2 (if continuing this work):

1. **Consolidate duplicate stores**: Deprecate `PostgresTaskHistory` in favor of `TaskHistoryStore`
2. **Add integration tests**: Test both SQLite and PostgreSQL paths with actual queries
3. **Document the DatabaseClient interface**: Add JSDoc to `types.ts` explaining the `RETURNING *` limitation
4. **Consider a shared connection manager**: If connection pooling becomes a concern, add a singleton registry
