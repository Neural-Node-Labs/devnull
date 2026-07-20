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

## 11. Known Gaps / Honest Limitations

- **DB writes are best-effort, not transactional with file writes**: If the DB write
  fails after the file write succeeds, the data is inconsistent until the next sync.
  This is acceptable because the file is the authoritative source.
- **Phase summaries are LLM-generated and may hallucinate**: The summary prompt is
  focused and constrained, but the risk exists. Mitigated by including the phase report
  path in the accumulated summary so the next phase can read the full report if needed.
- **No cross-phase context beyond summaries**: A phase cannot directly reference tool
  observations from earlier phases. This is by design (token footprint reduction) but
  may cause issues for tightly coupled tasks.
