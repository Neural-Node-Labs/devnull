# Phase 2: Fix the Type Mismatch in routes.ts
Update the code in `src/api/routes.ts` to map `phasePlanning` from the request to `singlePhase` on `OrchestratorOptions` (where `phasePlanning === false` → `singlePhase: true`, and `phasePlanning !== false` → `singlePhase: false`). Also fix any related test files that pass `phasePlanning` directly to `OrchestratorOptions`.

**Task:** fix src/api/routes.ts:335:37 - error TS2339: Property 'phasePlanning' does not exist on type 'OrchestratorOptions'.

**Result:**

All changes are verified. Here's a summary of what was done:

## Phase 2 Complete: Fix Type Mismatch in routes.ts

### Changes Made

**1. `src/api/routes.ts` — 3 occurrences fixed**

All three routes (`/chat`, `/chat/plan`, `/chat/execute`) had the same bug: they were assigning to a non-existent `opts.phasePlanning` property on `OrchestratorOptions`. Fixed by mapping the API's `phasePlanning` boolean (where `true` = enable phase planning) to the orchestrator's `singlePhase` boolean (where `false` = enable phase planning):

- **Line 165** (`/chat` route): `if (phasePlanning === false) opts.singlePhase = true;`
- **Line 265** (`/chat/plan` route): `if (phasePlanning === false) opts.singlePhase = true;`
- **Line 336** (`/chat/execute` route): `if (session.phasePlanning === false) opts.singlePhase = true;`

The `PlanSession` interface and session store entries still use `phasePlanning` as a storage field — that's correct because it's the API-level concept, not the orchestrator-level option.

**2. `src/test/testPhasePlanning.ts` — 3 occurrences fixed**

All three test cases were passing `phasePlanning: true` directly to `OrchestratorOptions`, which doesn't have that property. Changed to `singlePhase: false` (the correct way to enable phase planning on the orchestrator).

### Verification
- `npx tsc --noEmit` passes with **zero errors**

**Stats:**
- Tokens: 471,049
- Iterations: 18
