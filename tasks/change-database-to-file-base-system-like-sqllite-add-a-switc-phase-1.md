# Phase 1: Analyze Current Database Abstraction Layer
Review the existing codebase to understand the current database connection pattern, ORM/query builder usage, repository layer, configuration management, and all places where database connections are established or referenced. Identify the abstraction boundary that needs to be modified.

**Task:** change database to file base system like sqllite , add a switch to use [sqllite or Postgres] make sqllite as default

**Result:**

I now have a thorough understanding of the entire database abstraction layer. Let me compile the analysis.

---

## Phase 1 Complete: Analysis of Current Database Abstraction Layer

### 1. Database Connection Pattern

Every database-backed class creates its own **independent `pg.Pool`** instance in its constructor. There is **no shared connection pool** — each class manages its own lifecycle.

| Class | File | Pool Config |
|---|---|---|
| `PostgresProjectStore` | `src/api/postgresProjectStore.ts` | `new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })` |
| `PlanStore` | `src/api/planStore.ts` | Same pattern |
| `TaskHistoryStore` | `src/api/taskHistoryStore.ts` | Same pattern |
| `PhaseReportStore` | `src/api/phaseReportStore.ts` | Same pattern |
| `WbsStore` | `src/api/wbsStore.ts` | Same pattern |
| `PostgresTelemetry` | `src/telemetry/postgresTelemetry.ts` | Same pattern |
| `PostgresTaskHistory` | `src/core/postgresTaskHistory.ts` | Same pattern |

**Total: 7 independent pool instances**, each with identical configuration.

### 2. Connection String Resolution

Every class uses the same fallback chain:
```
constructor(connectionString?: string) {
  this.pool = new Pool({
    connectionString: connectionString || process.env.DATABASE_URL,
    ...
  });
}
```

The `DATABASE_URL` environment variable is the single source of truth. The `connectionString` constructor parameter exists but is **never passed** by any caller — all 7 classes always fall through to `process.env.DATABASE_URL`.

### 3. Initialization Pattern (Lazy Schema Creation)

Every class follows the same lazy-init pattern:
```typescript
async init(): Promise<void> {
  if (this.initialized) return;
  try {
    const client = await this.pool.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS ...`);
      this.initialized = true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn("[ClassName] Failed to initialize:", ...);
  }
}
```

Each class creates its own tables. There is **no centralized schema management** or migration system. Tables are created on first use.

### 4. Error Handling Pattern

All classes use a **uniform error-handling pattern**: every public method wraps its body in try/catch, logs a warning via `console.warn`, and returns a safe fallback value (empty array, null, false, or undefined). **No errors propagate** to callers — the system is designed to degrade gracefully when PostgreSQL is unavailable.

### 5. Lifecycle Management

Each class has a `close()` method that calls `this.pool.end()`. However:
- **No centralized lifecycle management** — callers must remember to call `close()`.
- In `routes.ts`, `PhaseReportStore` and `WbsStore` are created as module-level singletons but **never closed**.
- In `orchestrator.ts`, stores are created, used, and closed within the same method (e.g., `runPhasePlanning` creates `PhaseReportStore`, `WbsStore`, `TaskHistoryStore` and calls `close()` on each).
- In `routes.ts`, `TaskHistoryStore` is created per-request and `close()` is never called.

### 6. All Database-Backed Classes (Complete Inventory)

| # | Class | Purpose | Tables | Created In |
|---|---|---|---|---|
| 1 | `PostgresProjectStore` | Project CRUD | `projects` | `src/api/postgresProjectStore.ts` |
| 2 | `PlanStore` | Plan + task CRUD | `plans`, `plan_tasks` | `src/api/planStore.ts` |
| 3 | `TaskHistoryStore` | Task history CRUD | `task_history` | `src/api/taskHistoryStore.ts` |
| 4 | `PhaseReportStore` | Phase report CRUD | `phase_reports` | `src/api/phaseReportStore.ts` |
| 5 | `WbsStore` | WBS entry CRUD | `wbs_entries` | `src/api/wbsStore.ts` |
| 6 | `PostgresTelemetry` | Telemetry logging | `telemetry_logs`, `telemetry_llm_calls`, `telemetry_errors` | `src/telemetry/postgresTelemetry.ts` |
| 7 | `PostgresTaskHistory` | Task history (duplicate) | `task_history` | `src/core/postgresTaskHistory.ts` |

### 7. Duplicate Table Detection

**`PostgresTaskHistory`** (`src/core/postgresTaskHistory.ts`) and **`TaskHistoryStore`** (`src/api/taskHistoryStore.ts`) both create and manage a `task_history` table with the **same schema**. This is a clear duplication — they serve the same purpose but are never used together. `PostgresTaskHistory` is defined but **never imported or instantiated** anywhere in the codebase.

### 8. Where Database Connections Are Established

| Location | File | How |
|---|---|---|
| API routes (module-level singletons) | `src/api/routes.ts` | `new PhaseReportStore()`, `new WbsStore()` — created once, never closed |
| Plan routes (module-level singleton) | `src/api/planRoutes.ts` | `new PlanStore()` — created once, never closed |
| Orchestrator (per-run) | `src/core/orchestrator.ts` | `new TaskHistoryStore()`, `new PhaseReportStore()`, `new WbsStore()` — created and closed per run |
| API route handlers (per-request) | `src/api/routes.ts` | `new TaskHistoryStore()` — created per request, never closed |
| PostgresTelemetry | `src/telemetry/postgresTelemetry.ts` | Created by callers, lifecycle varies |

### 9. Non-Database Stores (File-Based)

These stores use JSON files instead of PostgreSQL and are **not part of the DB abstraction**:
- `projectStore.ts` — `~/.devnull/projects.json`
- `llmKeyStore.ts` — `~/.devnull/llm-key.json`
- `taskHistory.ts` (core) — `.agent/task-history.jsonl` + `tasks/task_history.md`

### 10. Abstraction Boundary Analysis

The current abstraction boundary is **per-class**: each store class encapsulates its own pool, schema, and CRUD operations. There is no:
- **Shared pool** — 7 independent pools
- **Shared connection config** — each class duplicates the pool options
- **Shared schema management** — each class creates its own tables
- **Shared lifecycle** — no centralized init/close
- **Repository interface** — no abstract base class or interface that all stores implement
- **Transaction coordination** — each class manages its own transactions independently

### Key Findings Summary

1. **7 independent `pg.Pool` instances** — wastes connections, no connection sharing
2. **Duplicate `task_history` table** — `PostgresTaskHistory` (unused) and `TaskHistoryStore` (used) manage the same schema
3. **No centralized lifecycle** — pools are created but often never closed (memory leak risk)
4. **No shared config** — pool options are copy-pasted across 7 files
5. **No repository interface** — each class has its own method signatures
6. **Graceful degradation is consistent** — all classes handle DB failures the same way (log + return fallback)
7. **`DATABASE_URL` is the single config point** — no other connection configuration mechanism is used

The abstraction boundary that needs modification is the **pool creation + lifecycle management layer**: extracting a shared `DatabasePool` singleton that all store classes use, eliminating the 7 independent pools, and providing a centralized `close()` mechanism.

**Stats:**
- Tokens: 391,095
- Iterations: 9
