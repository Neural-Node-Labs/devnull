# WBS: fix src/api/routes.ts:335:37 - error TS2339: Property 'phasePlanning' does not exist on type 'OrchestratorOptions'.

- [x] Phase 1: Investigate and Map the Type Contract
Read `src/api/routes.ts` around line 335 to see how `phasePlanning` is being used, read `src/core/orchestrator.ts` to confirm the `OrchestratorOptions` type and its `singlePhase` property, and read `src/api/types.ts` to see the `ChatRequest`/`PlanRequest` types. This establishes the exact mapping needed.
- [x] Phase 2: Fix the Type Mismatch in routes.ts
Update the code in `src/api/routes.ts` to map `phasePlanning` from the request to `singlePhase` on `OrchestratorOptions` (where `phasePlanning === false` → `singlePhase: true`, and `phasePlanning !== false` → `singlePhase: false`). Also fix any related test files that pass `phasePlanning` directly to `OrchestratorOptions`.
- [x] Phase 3: Verify Compilation
Run `npx tsc --noEmit` to confirm the TypeScript error is resolved. If there are additional type errors in related files, fix them as well.
