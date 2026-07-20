# Phase 1: Investigate and Map the Type Contract
Read `src/api/routes.ts` around line 335 to see how `phasePlanning` is being used, read `src/core/orchestrator.ts` to confirm the `OrchestratorOptions` type and its `singlePhase` property, and read `src/api/types.ts` to see the `ChatRequest`/`PlanRequest` types. This establishes the exact mapping needed.

**Task:** fix src/api/routes.ts:335:37 - error TS2339: Property 'phasePlanning' does not exist on type 'OrchestratorOptions'.

**Result:**

There it is — the bug. Let me compile the full type contract mapping.

---

## Phase 1 Complete: Type Contract Investigation

Here's the exact mapping I've found across the three files:

### 1. `src/api/types.ts` — API Request Types

Both `ChatRequest` and `PlanRequest` define:
```ts
phasePlanning?: boolean;  // true = enable phase planning
```
The JSDoc says: *"When true, the task is divided into multiple phases each with isolated ReAct memory to reduce token footprint. Default: false."*

### 2. `src/core/orchestrator.ts` — `OrchestratorOptions`

```ts
interface OrchestratorOptions {
  singlePhase?: boolean;  // true = DISABLE phase planning (default: false = phase planning ON)
  // ... no `phasePlanning` property exists on this type
}
```
The JSDoc says: *"When true, disables phase-based planning and runs as a single ReAct loop instead. Default: false (phase planning is ON)."*

So the semantics are **inverted**:
- API: `phasePlanning: true` → **enable** phase planning
- Orchestrator: `singlePhase: true` → **disable** phase planning (i.e., `singlePhase: false` = enable)

### 3. `src/api/routes.ts` — The Three Mapping Sites

| Route | Code | Mapping |
|---|---|---|
| **POST /chat** (line ~335) | `if (phasePlanning === false) opts.singlePhase = true;` | ✅ Correct — `false` (API) → `true` (orchestrator) |
| **POST /chat/plan** (line ~400) | `if (phasePlanning === false) opts.singlePhase = true;` | ✅ Correct — same pattern |
| **POST /chat/execute** (line ~435) | `if (session.phasePlanning) opts.phasePlanning = true;` | ❌ **BUG** — two problems: (1) assigns to `opts.phasePlanning` which **doesn't exist** on `OrchestratorOptions`, and (2) the logic is inverted — `true` should map to `singlePhase: false`, not set a non-existent property |

### 4. `src/test/testPhasePlanning.ts` — Tests

The tests pass `phasePlanning: true` directly to `OrchestratorOptions`:
```ts
const orchestrator = new ReActOrchestrator(mock, telemetry, {
  cwd,
  maxIterations: 10,
  planMode: "never",
  interactive: false,
  phasePlanning: true,  // ❌ This property doesn't exist on OrchestratorOptions
});
```

This would cause a **TypeScript compilation error** — `phasePlanning` is not a property of `OrchestratorOptions`.

### Summary of Issues Found

| Location | Issue |
|---|---|
| `routes.ts` line 335 (`/chat`) | `if (phasePlanning === false) opts.singlePhase = true;` — ✅ Correct |
| `routes.ts` line 400 (`/chat/plan`) | `if (phasePlanning === false) opts.singlePhase = true;` — ✅ Correct |
| `routes.ts` line 435 (`/chat/execute`) | `if (session.phasePlanning) opts.phasePlanning = true;` — ❌ **Wrong property name + inverted logic** |
| `testPhasePlanning.ts` lines 98, 136, 175 | `phasePlanning: true` passed to `OrchestratorOptions` — ❌ **Property doesn't exist on the type** |

The `/chat/execute` route should be:
```ts
if (session.phasePlanning === false) opts.singlePhase = true;
```
(or equivalently: `if (!session.phasePlanning) opts.singlePhase = true;`)

And the tests should use `singlePhase: false` instead of `phasePlanning: true`, or `OrchestratorOptions` needs a `phasePlanning` property added.

**Stats:**
- Tokens: 179,356
- Iterations: 7
