# Blueprint: devnull Enhancement — Phase Planning & Task History Persistence

## 1. Purpose

This blueprint describes the architectural changes needed to implement the enhancement
requirements from `enhancement/planning.md`. The core goal is to reduce per-task token
footprint by dividing work into isolated phases, persist task history and phase reports
to both filesystem and PostgreSQL, and provide color-coded token/iteration statistics
in CLI and UI output.

## 2. Requirements Summary

1. **Phase Planning as default** — `--single-phase` flag to opt out; phase planning divides
   a task into 2-5 sequential phases, each running as a sub-orchestrator with isolated ReAct
   memory. Results from completed phases are summarized and passed to the next phase.

2. **Task history persistence** — Each task report summary stored in both `tasks/task_history.md`
   (filesystem) and PostgreSQL database (for UI consumption).

3. **Phase report persistence** — Each phase report stored in `tasks/[task_name]-phase-[N].md`
   and in the database.

4. **Token/iteration statistics** — Total tokens (red >1M, green >500K, blue <500K) and
   iteration count (red >100, green >50, blue <20) highlighted in both CLI and UI output.

5. **WBS generation** — A WBS file `tasks/[task_name]-wbs.md` generated at phase-planning
   start and updated as each phase completes. Same data stored in database for UI.

6. **Phase planning as default** — `--single-phase` flag makes phase planning optional;
   without it, phase planning is ON.

## 3. Current Architecture (Baseline)

The existing system already has:

- **Phase planning** implemented in `src/core/orchestrator.ts` (`runPhasePlanning` method)
  with sub-orchestrator isolation, phase report writing to `tasks/[task_name]-phase-[N].md`,
  WBS file generation, and color-coded CLI stats via `reportPhaseStats()`.

- **Task history** via `src/core/taskHistory.ts` (file-based `.agent/task-history.jsonl`)
  and `src/core/postgresTaskHistory.ts` (PostgreSQL-backed).

- **Plan storage** via `src/api/planStore.ts` (PostgreSQL-backed) and `src/api/planRoutes.ts`.

- **Phase planning flag** `phasePlanning` in `ChatRequest` type and `singlePhase` in
  `OrchestratorOptions`.

- **CLI flag** `--single-phase` is already defined in `OrchestratorOptions`.

## 4. Gaps Between Current State and Requirements

| Requirement | Current State | Gap |
|---|---|---|
| Phase planning as default | `singlePhase` defaults to `false` (phase planning ON) | Already implemented |
| `--single-phase` CLI flag | Defined in `OrchestratorOptions` but not exposed in CLI | Need to add to CLI `commander` options |
| Task history in both file + DB | File-based exists; DB writes happen but aren't integrated with orchestrator | Need to wire `PostgresTaskHistory.append()` into orchestrator's `run()` and `runPhasePlanning()` |
| Phase reports in DB | Phase reports written to files only | Need DB schema + API endpoints for phase reports |
| Token/iteration stats in UI | CLI has `reportPhaseStats()`; UI has no equivalent | Need UI components to display phase stats |
| WBS in DB | WBS written to file only | Need DB schema + API endpoints for WBS |
| Task history in DB from both CLI and UI | CLI writes to file; UI reads from API | Need orchestrator to also write to DB |

## 5. Component Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI (src/cli/index.ts)                       │
│  --task / --chat / --single-phase / --phase-planning               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────v──────────────────────────────────────────┐
│                    ReActOrchestrator (core/orchestrator.ts)          │
│                                                                     │
│  run() ──► runPhasePlanning() ──► sub-orchestrator per phase        │
│       │                        │                                    │
│       │                        └──► write phase report to file      │
│       │                        └──► write phase report to DB        │
│       │                        └──► update WBS file + DB            │
│       │                                                             │
│       └──► appendTaskHistory() ──► file + DB                        │
│       └──► reportPhaseStats() ──► color-coded CLI output            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────v──────┐ ┌──────v───────┐ ┌──────v──────────┐
│ taskHistory.ts  │ │ planStore.ts │ │ postgresTask    │
│ (file-based)    │ │ (DB-backed)  │ │ History.ts      │
│                 │ │              │ │ (DB-backed)     │
│ .agent/task-    │ │ plans table  │ │ task_history    │
│ history.jsonl   │ │ plan_tasks   │ │ table           │
│                 │ │ table        │ │                 │
└─────────────────┘ └──────────────┘ └─────────────────┘
                           │
┌──────────────────────────v──────────────────────────────────────────┐
│                    API Layer (src/api/)                              │
│                                                                     │
│  routes.ts ──► /api/v1/plans/* (existing)                          │
│  routes.ts ──► /api/v1/task-history (existing)                     │
│  NEW: /api/v1/phase-reports/*                                       │
│  NEW: /api/v1/wbs/*                                                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────v──────────────────────────────────────────┐
│                    UI Layer (ui/src/)                                │
│                                                                     │
│  PlansPage.tsx ──► display plans + tasks + WBS                     │
│  NEW: Phase stats display in chat results                           │
│  NEW: Color-coded token/iteration indicators                        │
└─────────────────────────────────────────────────────────────────────┘
```

## 6. Data Flow

### Task Execution with Phase Planning (Default Flow)

```
User: devnull --task "implement feature X"
  │
  ├─► CLI parses args, creates orchestrator with phasePlanning=true
  │
  ├─► Orchestrator.run()
  │     │
  │     ├─► selectSkills(task) → [programmer, architect]
  │     │
  │     ├─► Plan Mode (if 2+ skills) → generate plan → write tasks/todo.md
  │     │
  │     ├─► runPhasePlanning()
  │     │     │
  │     │     ├─► LLM: generate phases (no tools)
  │     │     │     → returns "### Phase 1: Setup\n...\n### Phase 2: Implement\n..."
  │     │     │
  │     │     ├─► Parse phases from markdown
  │     │     │
  │     │     ├─► Generate WBS → tasks/[name]-wbs.md + DB
  │     │     │
  │     │     ├─► For each phase:
  │     │     │     │
  │     │     │     ├─► Create sub-orchestrator (singlePhase=true)
  │     │     │     ├─► sub.run(phaseTask)
  │     │     │     ├─► Write phase report → tasks/[name]-phase-N.md + DB
  │     │     │     ├─► Update WBS → file + DB
  │     │     │     ├─► Summarize phase → LLM summary call
  │     │     │     └─► Accumulate summary for next phase
  │     │     │
  │     │     └─► Build final result with per-phase stats
  │     │
  │     └─► appendTaskHistory() → file + DB
  │
  └─► CLI: reportPhaseStats() → color-coded output
```

### API Flow (UI-driven)

```
UI: POST /api/v1/chat { task: "...", phasePlanning: true }
  │
  ├─► API routes.ts → create orchestrator with phasePlanning=true
  ├─► orchestrator.run() → same flow as above
  ├─► Response includes:
  │     ├─► result (final text)
  │     ├─► plan (if plan mode)
  │     ├─► usage (cumulative tokens)
  │     ├─► healthScore
  │     └─► limitation (if any)
  │
  └─► UI displays result with color-coded token/iteration stats
```

## 7. Key Design Decisions

### Decision 1: Phase Planning ON by default
- **Choice**: `singlePhase` defaults to `false` (phase planning enabled).
- **Rationale**: The enhancement explicitly requires phase planning as default.
- **Tradeoff**: Adds overhead for simple tasks (extra LLM call for phase generation).
  Mitigated by the fallback: if the LLM returns no parseable phases, the task runs
  as a single phase.

### Decision 2: Dual persistence (file + DB)
- **Choice**: Task history, phase reports, and WBS are written to both filesystem
  and PostgreSQL.
- **Rationale**: Filesystem provides CLI access without DB dependency; DB provides
  structured querying for the UI.
- **Tradeoff**: Write amplification — each phase completion writes 2-3 files + DB rows.
  Acceptable given the infrequency of writes (per phase, not per iteration).

### Decision 3: Sub-orchestrator isolation for phases
- **Choice**: Each phase runs as a fresh `ReActOrchestrator` with `singlePhase=true`.
- **Rationale**: Already implemented and proven. Keeps per-phase context clean.
- **Tradeoff**: Cross-phase context is limited to the accumulated summary. A phase
  cannot reference details from earlier phases without the summary.

### Decision 4: Color-coded stats in CLI via existing `reportPhaseStats()`
- **Choice**: Reuse the existing `reportPhaseStats()` function from `consoleReporter.ts`.
- **Rationale**: Already implemented and tested. No need to reinvent.
- **Tradeoff**: Color coding only works in terminals that support ANSI escape codes.

## 8. Contracts / Interfaces

### OrchestratorOptions (existing, already has the fields)

```typescript
interface OrchestratorOptions {
  singlePhase?: boolean;       // false = phase planning ON (default)
  phasePlanning?: boolean;     // explicit toggle (legacy, use singlePhase)
  // ... existing fields ...
}
```

### Phase Report DB Schema

```sql
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
```

### WBS DB Schema

```sql
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
```

### API Endpoints (new)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/phase-reports?taskId=...` | List phase reports for a task |
| `GET` | `/api/v1/phase-reports/:id` | Get a specific phase report |
| `GET` | `/api/v1/wbs?taskId=...` | Get WBS entries for a task |
| `PUT` | `/api/v1/wbs/:id/status` | Update WBS entry status |

## 9. Sequence Diagram: Phase Planning Flow

```
┌──────┐    ┌──────────────┐    ┌──────────┐    ┌────────┐    ┌────────┐
│ User │    │ Orchestrator │    │   LLM    │    │  File  │    │   DB   │
└──┬───┘    └──────┬───────┘    └────┬─────┘    └───┬────┘    └───┬────┘
   │               │                  │              │             │
   │  run(task)    │                  │              │             │
   │──────────────>│                  │              │             │
   │               │  generate phases │              │             │
   │               │─────────────────>│              │             │
   │               │  phases markdown │              │             │
   │               │<─────────────────│              │             │
   │               │                  │              │             │
   │               │  write WBS       │              │             │
   │               │────────────────────────────────>│             │
   │               │──────────────────────────────────────────────>│
   │               │                  │              │             │
   │               │  ┌─ Phase 1 ─┐   │              │             │
   │               │  │ sub.run() │   │              │             │
   │               │  │──────────>│   │              │             │
   │               │  │ result    │   │              │             │
   │               │  │<──────────│   │              │             │
   │               │  │           │   │              │             │
   │               │  │ write report  │              │             │
   │               │  │──────────────────────────────>│             │
   │               │  │───────────────────────────────────────────>│
   │               │  │           │   │              │             │
   │               │  │ update WBS   │              │             │
   │               │  │──────────────────────────────>│             │
   │               │  │───────────────────────────────────────────>│
   │               │  │           │   │              │             │
   │               │  │ summarize │   │              │             │
   │               │  │──────────>│   │              │             │
   │               │  │ summary   │   │              │             │
   │               │  │<──────────│   │              │             │
   │               │  └───────────┘   │              │             │
   │               │                  │              │             │
   │               │  ┌─ Phase 2 ─┐   │              │             │
   │               │  │ (same flow)   │              │             │
   │               │  └───────────┘   │              │             │
   │               │                  │              │             │
   │               │  append task hist│              │             │
   │               │────────────────────────────────>│             │
   │               │──────────────────────────────────────────────>│
   │               │                  │              │             │
   │  result +     │                  │              │             │
   │  stats        │                  │              │             │
   │<──────────────│                  │              │             │
```

## 10. Tradeoffs and Rejected Alternatives

### Rejected: Single-phase-only mode as default
- **Why rejected**: The enhancement explicitly requires phase planning as default.
  The `--single-phase` flag provides the opt-out.

### Rejected: DB-only persistence (no files)
- **Why rejected**: The CLI must work without a database. File-based persistence
  provides offline capability and simpler debugging.

### Rejected: In-memory phase state only
- **Why rejected**: Phase reports and WBS must survive process restarts for the
  UI to display them.

### Rejected: LLM-generated phase summaries without validation
- **Why rejected**: Phase summaries are critical for cross-phase context. The
  existing summary generation uses a separate LLM call with a focused prompt,
  which is already the right approach.

## 11. Implementation Sequence

1. **Phase 3**: Wire DB persistence into orchestrator — `PostgresTaskHistory.append()`
   called from `run()` and `runPhasePlanning()`; phase report and WBS DB writes.
2. **Phase 4**: Add `--single-phase` CLI flag to `commander` options.
3. **Phase 5**: Add DB schemas for phase reports and WBS entries.
4. **Phase 6**: Add API endpoints for phase reports and WBS.
5. **Phase 7**: UI components for phase stats display.
6. **Phase 8**: Testing — update `testPhasePlanning.ts` and add integration tests.
