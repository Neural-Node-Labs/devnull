# devnull — Solution Design: Phase Planning & Task History Persistence

## 1. Purpose

This document details the solution design for enhancing devnull with phase-based planning
as the default execution mode, dual persistence (filesystem + PostgreSQL) for task history,
phase reports, and WBS entries, and color-coded token/iteration statistics in both CLI
and UI output.

## 2. Business Logic

### 2.1 Phase Planning Flow

The orchestrator's `run()` method checks `singlePhase` (default: `false`). When phase
planning is enabled, it delegates to `runPhasePlanning()` instead of the standard ReAct
loop. The phase planning flow:

1. **Phase Generation** — A no-tools LLM call divides the task into 2-5 sequential phases.
2. **WBS Creation** — A WBS file is written to `tasks/[task_name]-wbs.md` and the DB.
3. **Sequential Execution** — Each phase runs as a sub-orchestrator with `singlePhase=true`.
4. **Phase Reporting** — Each phase result is written to `tasks/[task_name]-phase-N.md` and DB.
5. **WBS Update** — After each phase, the WBS is updated to mark the phase as complete.
6. **Phase Summarization** — An LLM call summarizes each phase for the next phase's context.
7. **Final Assembly** — Per-phase stats are assembled into the final result.

### 2.2 Dual Persistence

Every write operation targets both the filesystem and PostgreSQL:

| Data | Filesystem Path | DB Table |
|---|---|---|
| Task history | `.agent/task-history.jsonl` | `task_history` |
| Phase reports | `tasks/[task_name]-phase-N.md` | `phase_reports` |
| WBS entries | `tasks/[task_name]-wbs.md` | `wbs_entries` |

The filesystem path is always the primary write target (works without DB). The DB write
is best-effort — failures are logged but don't block execution.

## 3. Technology Stack

No new technology dependencies are introduced. The existing stack already covers all needs:

| Concern | Existing Component | Enhancement |
|---|---|---|
| DB access | `pg` (PostgreSQL client) | New tables: `phase_reports`, `wbs_entries` |
| File I/O | `fs` (Node.js built-in) | New file paths under `tasks/` |
| CLI output | `consoleReporter.ts` | Reuse `reportPhaseStats()` |
| API endpoints | Express router in `routes.ts` | New routes for phase reports and WBS |
| UI display | React/TypeScript in `ui/src/` | New components for phase stats |

## 4. Component Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLI Layer (src/cli/index.ts)                   │
│                                                                       │
│  --task "..."         → Orchestrator.run() with phasePlanning=true    │
│  --single-phase       → Orchestrator.run() with singlePhase=true      │
│  --chat               → Interactive mode (phase planning optional)    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────v───────────────────────────────────────┐
│                    Core Layer (src/core/)                             │
│                                                                       │
│  orchestrator.ts                                                     │
│    run()                                                              │
│      ├── selectSkills() → skill routing                              │
│      ├── runPlanMode() → plan generation (if 2+ skills)              │
│      ├── runPhasePlanning() → phase-based execution                  │
│      │     ├── LLM: generate phases                                  │
│      │     ├── writeWbs() → file + DB                                │
│      │     ├── For each phase:                                       │
│      │     │     ├── sub-orchestrator.run()                          │
│      │     │     ├── writePhaseReport() → file + DB                  │
│      │     │     ├── updateWbs() → file + DB                         │
│      │     │     └── summarizePhase() → LLM summary                  │
│      │     └── buildFinalResult() → per-phase stats                  │
│      └── appendTaskHistory() → file + DB                             │
│                                                                       │
│  taskHistory.ts → file-based .agent/task-history.jsonl               │
│  postgresTaskHistory.ts → DB-backed task_history table               │
│  consoleReporter.ts → reportPhaseStats() (color-coded)               │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────v──────────┐ ┌──────v───────┐ ┌──────────v──────────┐
│  API Layer          │ │  DB Layer    │ │  UI Layer            │
│  (src/api/)         │ │  (PostgreSQL)│ │  (ui/src/)           │
│                     │ │              │ │                      │
│  routes.ts          │ │  plans       │ │  PlansPage.tsx       │
│    /plans/*         │ │  plan_tasks  │ │  ChatPage.tsx        │
│    /phase-reports/* │ │  task_history│ │  (phase stats)       │
│    /wbs/*           │ │  phase_reports│ │  TelemetryPage.tsx   │
│    /task-history    │ │  wbs_entries │ │  (token stats)       │
└─────────────────────┘ └──────────────┘ └──────────────────────┘
```

## 5. Detailed Component Design

### 5.1 Orchestrator Changes (`src/core/orchestrator.ts`)

The existing `runPhasePlanning()` method already implements most of the required logic.
The following changes are needed:

**a) Wire DB persistence in `runPhasePlanning()`**

After each phase completes, in addition to writing the phase report file, also write to
the `phase_reports` DB table via `PostgresTaskHistory` or a new `PhaseReportStore`.

After each phase, in addition to updating the WBS file, also update the `wbs_entries`
DB table.

**b) Wire DB persistence in `run()`**

After the task completes (both phase-planned and single-phase paths), in addition to
calling `appendTaskHistory()` (file-based), also call `PostgresTaskHistory.append()`.

**c) Add `--single-phase` CLI flag**

The `OrchestratorOptions` already has `singlePhase?: boolean`. The CLI needs to expose
this as a `--single-phase` flag.

### 5.2 New DB Tables

```sql
-- Phase reports table
CREATE TABLE IF NOT EXISTS phase_reports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  phase_title TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  iterations INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase_reports_task_id ON phase_reports(task_id);

-- WBS entries table
CREATE TABLE IF NOT EXISTS wbs_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  phase_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wbs_entries_task_id ON wbs_entries(task_id);
```

### 5.3 New API Endpoints

**Phase Reports**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/phase-reports?taskId=...` | List phase reports for a task |
| `GET` | `/api/v1/phase-reports/:id` | Get a specific phase report |

**WBS**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/wbs?taskId=...` | Get WBS entries for a task |
| `PUT` | `/api/v1/wbs/:id/status` | Update WBS entry status |

### 5.4 CLI Changes (`src/cli/index.ts`)

Add `--single-phase` flag:

```typescript
program
  .option('--single-phase', 'Disable phase planning and run as a single ReAct loop')
  // ... existing options ...
```

When `--single-phase` is set, pass `singlePhase: true` to `OrchestratorOptions`.

### 5.5 UI Changes (`ui/src/`)

**ChatPage.tsx** — After receiving a chat response with phase stats, display:
- Total tokens with color coding (red >1M, green >500K, blue <500K)
- Iteration count with color coding (red >100, green >50, blue <20)
- Per-phase breakdown if phase planning was used

**PlansPage.tsx** — Display WBS entries alongside plan tasks, with status indicators.

## 6. Sequence Diagrams

### 6.1 Phase Planning Execution

```
Orchestrator              LLM                  File System            DB
    │                       │                      │                   │
    │──runPhasePlanning()──>│                      │                   │
    │                       │                      │                   │
    │──generate phases─────>│                      │                   │
    │   (no tools)          │                      │                   │
    │<──phases markdown─────│                      │                   │
    │                       │                      │                   │
    │──write WBS──────────────────────────────────>│                   │
    │──write WBS──────────────────────────────────────────────────────>│
    │                       │                      │                   │
    │──Phase 1──────────────│                      │                   │
    │  sub.run()            │                      │                   │
    │  │                    │                      │                   │
    │  │──write report────────────────────────────>│                   │
    │  │──write report────────────────────────────────────────────────>│
    │  │──update WBS──────────────────────────────>│                   │
    │  │──update WBS──────────────────────────────────────────────────>│
    │  │──summarize────────>│                      │                   │
    │  │<──summary─────────│                      │                   │
    │                       │                      │                   │
    │──Phase 2──────────────│                      │                   │
    │  (same flow)          │                      │                   │
    │                       │                      │                   │
    │──append task history─────────────────────────>│                   │
    │──append task history────────────────────────────────────────────>│
    │                       │                      │                   │
    │<──result + stats──────│                      │                   │
```

### 6.2 API Request with Phase Planning

```
UI/Client                  API Server              Orchestrator         DB
    │                       │                          │                │
    │──POST /api/v1/chat───>│                          │                │
    │  {task,               │                          │                │
    │   phasePlanning:true} │                          │                │
    │                       │──orchestrator.run()─────>│                │
    │                       │                          │                │
    │                       │                          │──phase plan───>│
    │                       │                          │──WBS──────────>│
    │                       │                          │──phase 1──────>│
    │                       │                          │──report───────>│
    │                       │                          │──phase 2──────>│
    │                       │                          │──report───────>│
    │                       │                          │──task hist────>│
    │                       │                          │                │
    │                       │<──result + usage────────│                │
    │<──200 {result,        │                          │                │
    │       usage: {        │                          │                │
    │         totalTokens,  │                          │                │
    │         ...},         │                          │                │
    │       limitation}     │                          │                │
```

## 7. Naming & Coding Conventions

All conventions follow the existing codebase patterns:

- **Files**: `camelCase.ts` for modules, `PascalCase` for classes
- **DB tables**: `snake_case` (`phase_reports`, `wbs_entries`)
- **API routes**: `kebab-case` (`/api/v1/phase-reports`, `/api/v1/wbs`)
- **DB columns**: `snake_case` with TypeScript aliases via `AS "camelCase"`
- **Tests**: `src/test/test<Subject>.ts`

## 8. Error Handling

### 8.1 DB Write Failures

DB writes are best-effort. Failures are logged via `console.warn` and do not block
execution. The filesystem write is always the authoritative source.

```typescript
try {
  await postgresTaskHistory.append(entry);
} catch (err) {
  console.warn("[PhasePlanning] Failed to write to DB:", err);
  // Continue — file write already succeeded
}
```

### 8.2 Phase Generation Failures

If the LLM returns no parseable phases, the orchestrator falls back to single-phase
execution (already implemented).

### 8.3 Phase Execution Failures

If a phase sub-orchestrator throws, the error is caught and surfaced in the phase
report. Subsequent phases still execute (the accumulated summary includes the error).

## 9. Testing Strategy

### 9.1 Unit Tests

Update `src/test/testPhasePlanning.ts` to verify:

1. Phase planning is ON by default (no `--single-phase`)
2. `--single-phase` disables phase planning
3. DB writes happen alongside file writes
4. WBS is generated and updated correctly
5. Phase reports are written to both file and DB

### 9.2 Integration Tests

Add tests that verify:

1. API endpoints for phase reports return correct data
2. API endpoints for WBS return correct data
3. UI displays phase stats correctly

### 9.3 Existing Tests

The existing test suites (`testIterationStopping`, `testGoalValidator`, etc.) should
continue to pass unchanged, as the phase planning changes are additive.

## 10. Deployment

No changes to the Dockerfile or docker-compose.yml are needed. The existing PostgreSQL
service already provides the database. The new tables are auto-created via `CREATE TABLE
IF NOT EXISTS` on first use.

## 11. Task History Data Model

### 11.1 Purpose

The task history data model defines how completed top-level tasks are persisted, queried, and
displayed. It covers three storage backends (JSONL filesystem, Markdown filesystem, PostgreSQL)
and the API/UI consumption layer.

### 11.2 Core Interface

Defined in `src/core/taskHistory.ts`:

```typescript
export interface TaskHistoryEntry {
  id: string;           // Unique identifier, e.g. "task_1712345678901_a1b2c3"
  task: string;         // Original task description
  summary: string;      // What was accomplished
  timestamp: string;    // ISO 8601 timestamp of completion
  iterations: number;   // Total ReAct loop iterations
  totalTokens?: number; // Cumulative token usage (prompt + completion)
}
```

### 11.3 Storage Backends

#### 11.3.1 JSONL Filesystem (`.agent/task-history.jsonl`)

- **Format**: One JSON object per line (JSON Lines / NDJSON)
- **Cap**: 200 entries (oldest dropped on append)
- **Primary use**: CLI access, offline debugging, programmatic parsing
- **Write path**: `appendTaskHistory()` in `src/core/taskHistory.ts`
- **Read path**: `readTaskHistory()` in `src/core/taskHistory.ts`

```jsonl
{"id":"task_1712345678901_a1b2c3","task":"implement feature X","summary":"...","timestamp":"2025-07-17T10:30:00.000Z","iterations":15,"totalTokens":45000}
```

#### 11.3.2 Markdown Filesystem (`tasks/task_history.md`)

- **Format**: Markdown with `##` headings per entry, `---` separators
- **Cap**: 50 entries (oldest dropped on append)
- **Primary use**: Human-readable, git-trackable, visible in workspace
- **Write path**: `appendTaskHistory()` in `src/core/taskHistory.ts`
- **Read path**: `parseMarkdownEntries()` in `src/core/taskHistory.ts` (fallback for `readTaskHistory()`)

```markdown
## Jul 17, 2025, 10:30:00 AM GMT — implement feature X

**Summary:** Implemented the rate limiter with Redis backend, added tests, verified with load testing.

**Stats:** 15 iterations, 45,000 tokens

---
```

#### 11.3.3 PostgreSQL (`task_history` table)

- **Format**: Relational table with indexed columns
- **Primary use**: UI consumption, structured queries, search
- **Write path**: `PostgresTaskHistory.append()` in `src/core/postgresTaskHistory.ts`
- **Read path**: `PostgresTaskHistory.read()` / `PostgresTaskHistory.search()` in `src/core/postgresTaskHistory.ts`
- **Best-effort**: Failures are logged but don't block execution

```sql
CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  summary TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  iterations INTEGER DEFAULT 0,
  total_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
```

### 11.4 API Layer

#### 11.4.1 API Types (`src/api/types.ts`)

```typescript
export interface TaskHistoryEntryResponse {
  id: string;
  task: string;
  summary: string;
  timestamp: string;
  iterations: number;
  totalTokens: number | null;
}

export interface TaskHistoryQuery {
  limit?: number;
}

export interface TaskHistoryListResponse {
  tasks: TaskHistoryEntryResponse[];
}

export interface TaskHistoryDetailResponse {
  task: TaskHistoryEntryResponse;
}
```

#### 11.4.2 API Endpoints (`src/api/routes.ts`)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/task-history` | List recent task history entries | Bearer token |
| `GET` | `/api/v1/task-history/:id` | Get a specific task history entry | Bearer token |
| `GET` | `/api/v1/task-history/:taskId/logs` | Get telemetry logs for a specific task | Bearer token |

**Query Parameters for `GET /api/v1/task-history`:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | `number` | `10` | Max entries to return (newest first) |
| `projectId` | `string` | active project | Filter by project |

### 11.5 UI Consumption

#### 11.5.1 Client API (`ui/src/api/client.ts`)

```typescript
async getTaskHistory(projectId?: string, limit = 10): Promise<ApiResponse<{ tasks: TaskHistoryEntry[] }>>
```

#### 11.5.2 TaskHistoryPage Component (`ui/src/pages/TaskHistoryPage.tsx`)

The page renders each task history entry as a collapsible card with:

1. **Header row** (always visible):
   - Task description (truncated with ellipsis, full text in `title` attribute)
   - Localized timestamp
   - Token badge (color-coded per thresholds below)
   - Iteration badge (color-coded per thresholds below)

2. **Expanded section** (click to toggle):
   - Summary text (pre-wrapped, max-height 300px with scroll)

3. **Refresh button** to reload from API

#### 11.5.3 Color-Coding Thresholds

| Metric | Threshold | Color | CSS Color | Label |
|---|---|---|---|---|
| Tokens | > 1,000,000 | 🔴 Red | `#ef4444` | >1M |
| Tokens | > 500,000 | 🟢 Green | `#22c55e` | >500K |
| Tokens | ≤ 500,000 | 🔵 Blue | `#3b82f6` | <500K |
| Iterations | > 100 | 🔴 Red | `#ef4444` | >100 |
| Iterations | > 50 | 🟢 Green | `#22c55e` | >50 |
| Iterations | ≤ 20 | 🔵 Blue | `#3b82f6` | <20 |

### 11.6 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI Layer                                     │
│                                                                      │
│  orchestrator.run() completes                                       │
│       │                                                             │
│       ├──► appendTaskHistory(cwd, entry)                            │
│       │     ├──► .agent/task-history.jsonl  (JSONL, cap 200)        │
│       │     └──► tasks/task_history.md      (Markdown, cap 50)      │
│       │                                                             │
│       └──► PostgresTaskHistory.append(entry)  (best-effort)         │
│             └──► INSERT INTO task_history                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        API Layer                                     │
│                                                                      │
│  GET /api/v1/task-history?limit=50                                  │
│       │                                                             │
│       └──► readTaskHistory(cwd, limit)                              │
│             └──► Parse .agent/task-history.jsonl                    │
│                   └──► Return TaskHistoryEntry[] as JSON            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        UI Layer                                      │
│                                                                      │
│  TaskHistoryPage mounts                                             │
│       │                                                             │
│       └──► api.getTaskHistory(undefined, 50)                        │
│             └──► Render collapsible cards with color-coded badges   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.7 Existing Implementation Status

The following components are **already implemented** and match this design:

| Component | File | Status |
|---|---|---|
| `TaskHistoryEntry` interface | `src/core/taskHistory.ts` | ✅ Implemented |
| `appendTaskHistory()` (JSONL + Markdown) | `src/core/taskHistory.ts` | ✅ Implemented |
| `readTaskHistory()` (JSONL + Markdown fallback) | `src/core/taskHistory.ts` | ✅ Implemented |
| `searchTaskHistory()` | `src/core/taskHistory.ts` | ✅ Implemented |
| `PostgresTaskHistory` class | `src/core/postgresTaskHistory.ts` | ✅ Implemented |
| `TaskHistoryStore` class (API layer) | `src/api/taskHistoryStore.ts` | ✅ Implemented |
| `TaskHistoryEntryResponse` type | `src/api/types.ts` | ✅ Implemented |
| `GET /api/v1/task-history` endpoint | `src/api/routes.ts` | ✅ Implemented |
| `GET /api/v1/task-history/:taskId/logs` endpoint | `src/api/routes.ts` | ✅ Implemented |
| `api.getTaskHistory()` client method | `ui/src/api/client.ts` | ✅ Implemented |
| `TaskHistoryPage` component | `ui/src/pages/TaskHistoryPage.tsx` | ✅ Implemented |
| Color-coded token/iteration badges | `ui/src/pages/TaskHistoryPage.tsx` | ✅ Implemented |
| DB persistence call in orchestrator | `src/core/orchestrator.ts` | ✅ Implemented |

### 11.8 Design Decisions

1. **Dual filesystem + DB persistence**: The filesystem path (JSONL + Markdown) is always the
   primary write target — it works without a database. The DB write is best-effort, with
   failures logged but not blocking execution. This ensures the system works offline and in
   environments without PostgreSQL.

2. **JSONL over plain JSON**: JSON Lines format allows append-only writes without reading and
   rewriting the entire file. Each line is independently parseable, making it resilient to
   corruption (a single corrupt line doesn't break the whole file).

3. **Markdown for human readability**: The `tasks/task_history.md` file is git-trackable and
   human-readable directly in the workspace. It's the format users see when browsing the
   project files.

4. **Color-coded badges**: Token and iteration counts are color-coded in both the UI and CLI
   to give immediate visual feedback about task complexity and cost. Thresholds are chosen
   based on typical DeepSeek usage patterns.

5. **Cap on entries**: Both filesystem backends have caps (200 for JSONL, 50 for Markdown) to
   prevent unbounded file growth. Oldest entries are dropped on append.

## 12. Test Architecture

### 12.1 Overview

The devnull test suite is organized into four tiers, each with different dependencies and
run requirements. Tests are written in TypeScript using **Vitest** (for unit tests) and
**Playwright** (for browser/E2E tests).

```
tests/
├── README.md              # Test suite documentation
├── vitest.config.ts       # Vitest configuration
├── fixtures/              # Shared test fixtures
│   ├── mockLlm.ts         # Mock LLM client for unit tests
│   └── testServer.ts      # Test API server helper
├── unit/                  # Pure unit tests (no external deps)
│   ├── auth.test.ts
│   ├── config.test.ts
│   ├── contextCompaction.test.ts
│   ├── duplicateActionDetector.test.ts
│   ├── goalValidator.test.ts
│   ├── ignoreRules.test.ts
│   ├── llmKeyStore.test.ts
│   ├── projectStore.test.ts
│   ├── protocol.test.ts
│   ├── skillRegistry.test.ts
│   ├── stepScorer.test.ts
│   ├── taskHistory.test.ts
│   └── workspaceManager.test.ts
└── pages/                 # Playwright page-level UI tests
    ├── helpers.ts         # Shared helpers (loginAsAdmin, navigateTo, etc.)
    ├── login-page.spec.ts
    ├── home-page.spec.ts
    ├── chat-page.spec.ts
    ├── projects-page.spec.ts
    ├── telemetry-page.spec.ts
    ├── settings-page.spec.ts
    ├── admin-page.spec.ts
    ├── diagnostics-page.spec.ts
    ├── plans-page.spec.ts
    ├── plan-detail-page.spec.ts
    └── task-history-page.spec.ts

e2e/                       # E2E deployment tests (Playwright)
├── playwright.config.ts   # Playwright config (API-focused)
├── deploy-test.spec.ts    # API health + UI smoke tests
└── plans-ui-test.spec.ts  # Plans page E2E tests

ui-test-suited/            # Comprehensive UI test suite
├── playwright.config.ts   # Shared Playwright config (UI-focused)
├── health.spec.ts
├── homepage.spec.ts
├── chat-flow.spec.ts
├── project-management.spec.ts
├── settings.spec.ts
├── telemetry.spec.ts
├── admin.spec.ts
├── diagnostic.spec.ts
└── api-user-management.spec.ts
```

### 12.2 Test Runner Configuration

#### Vitest (Unit Tests)

Configuration in `tests/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".agent", "workspace-*"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: true,
  },
});
```

- **Pattern**: `tests/**/*.test.ts` — all unit test files use `.test.ts` extension
- **Timeout**: 30 seconds per test (generous for filesystem operations)
- **Globals**: `true` — `describe`, `it`, `expect` available without imports
- **No external dependencies**: Unit tests mock all I/O or use temp directories

#### Playwright (Page Tests + E2E)

The shared Playwright configuration lives in `ui-test-suited/playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:8080",
    extraHTTPHeaders: { "Content-Type": "application/json" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "ui-tests", testMatch: "**/*.spec.ts" },
  ],
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report" }],
  ],
});
```

- **baseURL**: `http://localhost:8080` (the UI dev server / nginx proxy)
- **Screenshots**: Captured only on failure for debugging
- **Traces**: Retained on failure for CI debugging
- **Reporter**: List (console) + HTML (for CI artifacts)

### 12.3 Page Object Pattern

The page tests use a **lightweight helper pattern** rather than full Page Object Model
classes. This was chosen because:

1. **Minimal abstraction overhead** — each page has 5-15 tests, not hundreds
2. **Direct selector visibility** — tests read like a user's interaction flow
3. **Shared helpers** — common operations (login, navigation) are extracted to
   `tests/pages/helpers.ts` without the ceremony of full page classes

**Shared Helpers** (`tests/pages/helpers.ts`):

```typescript
import { Page, expect } from "@playwright/test";

export const UI_BASE = "http://localhost:8080";
export const API_BASE = "http://localhost:3001";

// Logs in as admin via the UI login form
export async function loginAsAdmin(page: Page) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

// Navigate to a page and wait for it to load
export async function navigateTo(page: Page, path: string) {
  await page.goto(`${UI_BASE}${path}`);
  await page.waitForLoadState("networkidle");
}

// Register the first admin user if no users exist yet
export async function registerFirstUser(page: Page) {
  await page.goto(`${UI_BASE}/login`);
  await page.waitForLoadState("networkidle");
  const registerBtn = page.locator("button[type='submit']");
  const btnText = await registerBtn.textContent();
  if (btnText?.includes("Register")) {
    await page.fill("#username", "admin");
    await page.fill("#password", "admin1234");
    await registerBtn.click();
    await page.waitForURL("**/");
    return true;
  }
  return false;
}
```

### 12.4 Test Data Strategy

| Concern | Strategy |
|---|---|
| **Auth tokens** | Generated fresh per test via `generateToken()` in unit tests; obtained via UI login flow in page tests |
| **Users** | In-memory store reset in `beforeEach` for unit tests; admin user created via registration flow in page tests |
| **Projects** | Created via UI form in page tests; in-memory store in unit tests |
| **LLM keys** | In-memory store in unit tests; UI form interaction in page tests |
| **Task history** | Temp directory with JSONL/Markdown files in unit tests; empty state in page tests |
| **Phase reports / WBS** | Temp directory in unit tests; empty state in page tests |
| **File system** | `fs.mkdtempSync()` for isolated temp directories in unit tests; real workspace in page tests |
| **API responses** | Real API calls in page tests (no mocking); mocked via `mockLlm.ts` in unit tests |

**Key principles:**
- **Unit tests never touch external services** — all I/O is mocked or uses temp directories
- **Page tests test against a real running stack** — no API mocking, tests exercise the full
  frontend-to-backend path
- **Test data is ephemeral** — created in `beforeEach` and cleaned up in `afterEach`
- **Empty states are first-class scenarios** — every page test verifies the empty/loading
  state before testing populated states

### 12.5 Test Execution Order

Tests are designed to be **independent and parallelizable**:

1. **Unit tests** (`vitest`) — fully parallel, no shared state
2. **Page tests** (`playwright`) — sequential per-file, parallel across files
3. **E2E tests** (`playwright`) — sequential, depend on Docker stack
4. **Comprehensive UI tests** (`playwright`) — sequential, depend on Docker stack

### 12.6 CI Integration

See `README.md` → "CI Integration" for the recommended GitHub Actions workflow.

## 13. Known Gaps / Honest Limitations

- **DB writes are best-effort, not transactional with file writes**: If the DB write
  fails after the file write succeeds, the data is inconsistent until the next sync.
  This is acceptable because the file is the authoritative source.
- **Phase summaries are LLM-generated and may hallucinate**: The summary prompt is
  focused and constrained, but the risk exists. Mitigated by including the phase report
  path in the accumulated summary so the next phase can read the full report if needed.
- **No cross-phase context beyond summaries**: A phase cannot directly reference tool
  observations from earlier phases. This is by design (token footprint reduction) but
  may cause issues for tightly coupled tasks.
