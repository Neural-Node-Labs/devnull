# Artifact: devnull Enhancement — Deployment File List

## Source Files (Modified)

| File | Change | Description |
|---|---|---|
| `src/core/orchestrator.ts` | Modify | Wire DB persistence into `runPhasePlanning()` and `run()` — call `PostgresTaskHistory.append()` alongside file-based `appendTaskHistory()` |
| `src/cli/index.ts` | Modify | Add `--single-phase` flag to commander options |
| `src/api/routes.ts` | Modify | Add routes for `/api/v1/phase-reports/*` and `/api/v1/wbs/*` |
| `src/api/types.ts` | Modify | Add types for phase report and WBS API responses |

## Source Files (New)

| File | Description |
|---|---|
| `src/api/phaseReportStore.ts` | PostgreSQL-backed store for phase reports (CRUD operations) |
| `src/api/wbsStore.ts` | PostgreSQL-backed store for WBS entries (CRUD operations) |

## Test Files (Modified)

| File | Change | Description |
|---|---|---|
| `src/test/testPhasePlanning.ts` | Modify | Add tests for DB persistence, WBS updates, `--single-phase` flag |

## Documentation Files (New/Modified)

| File | Change | Description |
|---|---|---|
| `blueprint.md` | New | Architectural blueprint for the enhancement |
| `solution-design.md` | New | Detailed solution design with component boundaries, data flow, sequence diagrams |
| `artifact.md` | New | This file — deployment file list and rollback plan |

## Database Schema (Auto-created)

| Table | Description |
|---|---|
| `phase_reports` | Stores phase report content, tokens, iterations per phase |
| `wbs_entries` | Stores WBS entries with status tracking per phase |

## No Changes Needed

The following files require no modifications:

| File | Reason |
|---|---|
| `Dockerfile` | No new dependencies; existing image is sufficient |
| `docker-compose.yml` | PostgreSQL service already exists; new tables auto-created |
| `src/core/taskHistory.ts` | File-based task history unchanged |
| `src/core/postgresTaskHistory.ts` | DB-backed task history unchanged |
| `src/core/consoleReporter.ts` | `reportPhaseStats()` already implemented |
| `src/core/types.ts` | `OrchestratorOptions` already has `singlePhase` field |
| `src/api/planStore.ts` | Plan storage unchanged |
| `src/api/planRoutes.ts` | Plan routes unchanged |
| `src/api/projectStore.ts` | Project storage unchanged |
| `src/api/projectRoutes.ts` | Project routes unchanged |
| `src/api/auth.ts` | Auth unchanged |
| `src/api/server.ts` | Server bootstrap unchanged |
| `src/api/llmKeyStore.ts` | LLM key store unchanged |
| `ui/src/**` | UI changes are additive (new components) |

## Rollback Plan

### Step 1: Revert Source Changes

```bash
# Revert orchestrator changes
git checkout src/core/orchestrator.ts

# Revert CLI changes
git checkout src/cli/index.ts

# Revert API changes
git checkout src/api/routes.ts
git checkout src/api/types.ts

# Remove new files
git rm src/api/phaseReportStore.ts
git rm src/api/wbsStore.ts

# Revert test changes
git checkout src/test/testPhasePlanning.ts
```

### Step 2: Drop Database Tables (if needed)

```sql
DROP TABLE IF EXISTS phase_reports;
DROP TABLE IF EXISTS wbs_entries;
```

### Step 3: Rebuild and Verify

```bash
npm run build
node dist/test/testPhasePlanning.js /tmp/test-workspace
```

### Step 4: Verify No Regression

```bash
node dist/test/testIterationStopping.js /tmp/test-workspace
node dist/test/testGoalValidator.js /tmp/test-workspace
node dist/test/testReactAuditor.js
node dist/test/testLiveDiagnosticsHarness.js
node dist/test/testDeepSeekContract.js
```

## Environment Variables

No new environment variables are needed. The existing `DATABASE_URL` is used for all
PostgreSQL connections.
