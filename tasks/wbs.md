# WBS: Phase Planning Enhancement — Task History & Reporting

## Context Discovery Summary

### Enhancement Request (from `enhancement/planning.md`)
The enhancement asks for:
1. **Task history persistence** — each task report summary stored in `tasks/task_history.md` AND database (both UI and CLI)
2. **Phase reports** — each phase report stored in `tasks/[task_name]-phase-[N].md`, used by the next phase to continue work
3. **Token/iteration stats** — each phase report contains total tokens (color-coded: red >1M, green >500K, blue <500K) and iteration count (red >100, green >50, blue <20), highlighted in both UI and CLI
4. **Phase planning as default** — `--single-phase` as optional, phase-planning ON by default
5. **WBS file per task** — create `tasks/[task_name]-wbs.md` on each task, updated as phases complete, with same storage in database for UI

### Current State Analysis

#### What Already Exists
- **Phase planning** (`src/core/orchestrator.ts` `runPhasePlanning()`): Already implemented. Divides tasks into phases, executes them as sub-orchestrators, generates WBS files, writes phase reports, tracks token/iteration stats, and color-codes CLI output via `reportPhaseStats()`.
- **Task history (file-based)**: `src/core/taskHistory.ts` — `appendTaskHistory()`, `readTaskHistory()`, `searchTaskHistory()` writing to `.agent/task-history.jsonl`.
- **Task history (PostgreSQL)**: `src/core/postgresTaskHistory.ts` — `PostgresTaskHistory` class with `append()`, `read()`, `search()`.
- **Plan store (PostgreSQL)**: `src/api/planStore.ts` — `PlanStore` with `savePlan()`, `getPlan()`, `listPlans()`, `updateTaskStatus()`, `addTask()`, `deleteTask()`.
- **Plan API routes**: `src/api/planRoutes.ts` — CRUD endpoints for plans and tasks.
- **Plan tools**: `save_plan_tool`, `update_task_status_tool`, `add_plan_task_tool`, `delete_plan_task_tool` registered in `toolSchemas.ts` and dispatched in `toolDispatcher.ts`.
- **CLI `--single-phase` flag**: Already exists in `src/cli/index.ts` (line 216).
- **Phase stats reporting**: `reportPhaseStats()` in `src/core/consoleReporter.ts` already color-codes tokens and iterations.
- **Phase report files**: Already written to `tasks/[sanitizedTaskName]-phase-[N].md`.
- **WBS files**: Already written to `tasks/[sanitizedTaskName]-wbs.md` and updated as phases complete.

#### What's Missing / Needs Fixing
1. **`tasks/task_history.md` file**: The orchestrator writes to `.agent/task-history.jsonl` (via `appendTaskHistory()`) but NOT to `tasks/task_history.md`. Need a new function to write a human-readable markdown summary.
2. **Database persistence for phase reports**: Phase reports are written to files but NOT saved to the PostgreSQL database. Need to extend `PlanStore` or create a new store for phase reports.
3. **Database persistence for WBS**: WBS files are written to disk but NOT saved to the database. Need to extend `PlanStore` or create a new store.
4. **Bug: `phasePlanning` vs `singlePhase` mismatch**: The API routes (`src/api/routes.ts`) pass `opts.phasePlanning = true` but `OrchestratorOptions` uses `singlePhase` (inverted logic). `phasePlanning: true` should map to `singlePhase: false`. This is silently ignored by TypeScript.
5. **Phase planning is already default ON**: `singlePhase` defaults to `false` (undefined), and the check is `if (!this.opts.singlePhase && !runOpts.isSubagent)` — so phase planning IS already the default. The `--single-phase` flag correctly disables it.
6. **Task history from both CLI and UI**: The orchestrator's `run()` method already calls `appendTaskHistory()` for non-subagent runs. But the phase planning path also calls it at the end. Need to ensure both paths write to `tasks/task_history.md` as well.
7. **Phase report content**: Currently includes result text and stats. Need to ensure it also includes token count with color coding info for the UI.

### Key Files to Modify
| File | Purpose |
|---|---|
| `src/core/orchestrator.ts` | Phase planning logic, task history writing |
| `src/core/taskHistory.ts` | Add `appendTaskHistoryMd()` for `tasks/task_history.md` |
| `src/api/planStore.ts` | Add phase report and WBS storage |
| `src/api/planRoutes.ts` | Add endpoints for phase reports and WBS |
| `src/api/routes.ts` | Fix `phasePlanning` → `singlePhase` mapping |
| `src/api/types.ts` | Add types for phase report and WBS API |
| `src/core/consoleReporter.ts` | Already has `reportPhaseStats()` — verify coverage |
| `src/tools/toolSchemas.ts` | May need new tools for phase report/WBS queries |
| `src/tools/toolDispatcher.ts` | May need new handlers |

---

## Task-to-Skill Routing Map

| Task | Skill | Rationale |
|---|---|---|
| 1. Fix `phasePlanning` → `singlePhase` bug in API routes | programmer | Single-file bug fix, minimal change |
| 2. Add `tasks/task_history.md` writer | programmer | New function in existing module |
| 3. Wire task_history.md into orchestrator's phase planning | programmer | Integrate new function into existing flow |
| 4. Add phase report + WBS database storage to PlanStore | programmer | Extend existing PlanStore class |
| 5. Add API endpoints for phase reports and WBS | programmer | New routes in existing planRoutes.ts |
| 6. Add API types for phase report/WBS | programmer | Type definitions |
| 7. Add LLM tools for querying phase reports/WBS | programmer | New tool schemas + dispatcher handlers |
| 8. Verify phase planning is default ON (already is) | tester | Confirm no regression |
| 9. Run existing test suite | tester | Verify nothing breaks |
| 10. Update SOLUTION_DESIGN.md and README.md | architect | Document new capabilities |

## Atomic Tasks

### Task 1: Fix `phasePlanning` → `singlePhase` bug in API routes
- **Done when**: `opts.phasePlanning = true` in `src/api/routes.ts` correctly maps to `singlePhase: false` on `OrchestratorOptions`
- **Files**: `src/api/routes.ts` (3 occurrences: /chat, /chat/plan, /chat/execute)
- **Change**: Replace `if (phasePlanning) opts.phasePlanning = true;` with `if (phasePlanning) opts.singlePhase = false;` (or equivalent logic since `singlePhase` defaults to undefined/false)

### Task 2: Add `tasks/task_history.md` writer to taskHistory.ts
- **Done when**: `appendTaskHistoryMd()` function exists that writes a human-readable markdown entry to `tasks/task_history.md`
- **Files**: `src/core/taskHistory.ts`
- **Details**: Format should include task description, timestamp, summary, iterations, token count. Append to file, cap at N entries.

### Task 3: Wire task_history.md into orchestrator's phase planning
- **Done when**: Both the single-phase path and phase-planning path in `orchestrator.ts` write to `tasks/task_history.md` in addition to `.agent/task-history.jsonl`
- **Files**: `src/core/orchestrator.ts`
- **Details**: Call `appendTaskHistoryMd()` alongside existing `appendTaskHistory()` calls

### Task 4: Add phase report + WBS database storage to PlanStore
- **Done when**: `PlanStore` has methods to save/retrieve phase reports and WBS entries
- **Files**: `src/api/planStore.ts`
- **Details**: New tables `phase_reports` and `wbs_entries` with appropriate schema

### Task 5: Add API endpoints for phase reports and WBS
- **Done when**: GET/POST endpoints exist for phase reports and WBS entries
- **Files**: `src/api/planRoutes.ts`, `src/api/types.ts`
- **Details**: List/get/save phase reports, list/get/update WBS entries

### Task 6: Add API types for phase report/WBS
- **Done when**: TypeScript interfaces defined for phase report and WBS API responses
- **Files**: `src/api/types.ts`

### Task 7: Add LLM tools for querying phase reports/WBS
- **Done when**: New tool schemas and dispatcher handlers exist for querying phase reports and WBS
- **Files**: `src/tools/toolSchemas.ts`, `src/tools/toolDispatcher.ts`

### Task 8: Verify phase planning is default ON
- **Done when**: Confirmed that `singlePhase` defaults to undefined/false and the check `if (!this.opts.singlePhase && !runOpts.isSubagent)` correctly enables phase planning
- **Files**: `src/core/orchestrator.ts` (inspection only)

### Task 9: Run existing test suite
- **Done when**: `npm run build` succeeds and existing tests pass (especially `testPhasePlanning.ts` and `testEnhancementSmoke.ts`)
- **Command**: `npm run build && node dist/test/testPhasePlanning.js /tmp/test-workspace && node dist/test/testEnhancementSmoke.js`

### Task 10: Update documentation
- **Done when**: `SOLUTION_DESIGN.md` and `README.md` reflect the new task_history.md, phase report DB storage, and WBS DB storage capabilities
- **Files**: `SOLUTION_DESIGN.md`, `README.md`

---

## Dependencies

```
Task 1 (bug fix) → no deps
Task 2 (task_history.md writer) → no deps
Task 3 (wire into orchestrator) → depends on Task 2
Task 4 (PlanStore phase reports) → no deps
Task 5 (API endpoints) → depends on Task 4
Task 6 (API types) → depends on Task 5
Task 7 (LLM tools) → depends on Task 5
Task 8 (verify default) → no deps
Task 9 (test suite) → depends on Tasks 1-8
Task 10 (docs) → depends on Tasks 1-8
```

## Sequencing

```
Phase 1 (this phase): Context Discovery & Requirements Analysis → DONE
Phase 2: Core Implementation (Tasks 1, 2, 3, 8)
Phase 3: Database & API (Tasks 4, 5, 6)
Phase 4: LLM Tools & Testing (Tasks 7, 9)
Phase 5: Documentation (Task 10)
```
