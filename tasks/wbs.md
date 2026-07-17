# WBS: Fix Plan Mode Integration in API

## Problem
When the UI calls `POST /api/v1/chat` with `planMode: "always"`, the orchestrator's `runPlanMode()` tries to read from stdin (`readline.createInterface`), which hangs forever in an API context (no TTY). The API never responds.

## Root Cause
The `ReActOrchestrator.runPlanMode()` method uses interactive stdin prompts (`readline.question`) for plan approval. This works in CLI mode but blocks indefinitely when called from the HTTP API.

## Tasks

### ✅ Task 1: Add `interactive` option to OrchestratorOptions
- **Skill:** programmer
- **Done:** Added `interactive?: boolean` to `OrchestratorOptions` (defaults to `true`)
- **Files:** `src/core/orchestrator.ts`

### ✅ Task 2: Modify `runPlanMode` to skip interactive prompt in API context
- **Skill:** programmer
- **Done:** When `interactive: false`, `runPlanMode` auto-approves the plan (generates it, writes todo.md, returns true) instead of hanging on stdin
- **Files:** `src/core/orchestrator.ts`

### ✅ Task 3: Modify `askContinue` to skip interactive prompt in API context
- **Skill:** programmer
- **Done:** When `interactive: false`, `askContinue` auto-continues instead of prompting stdin
- **Files:** `src/core/orchestrator.ts`

### ✅ Task 4: Modify `/chat` endpoint to pass `interactive: false` and return plan info
- **Skill:** programmer
- **Done:** `/chat` endpoint passes `interactive: false` to orchestrator. When plan mode triggers, generates the plan upfront, stores it in a session, and returns `plan` + `sessionId` in the response alongside the execution result.
- **Files:** `src/api/routes.ts`

### ✅ Task 5: Update ChatResponse type to include optional plan/sessionId
- **Skill:** programmer
- **Done:** `ChatResponse` interface has optional `plan` and `sessionId` fields
- **Files:** `src/api/types.ts`

### ✅ Task 6: Verify build and existing tests
- **Skill:** programmer
- **Done:** TypeScript compiles cleanly. All existing unit tests pass (iteration stopping 5/5, goal validator 3/3).

## Review

### Root Cause
The `ReActOrchestrator.runPlanMode()` and `askContinue()` methods use `readline.createInterface` for interactive stdin prompts. When called from the HTTP API (`POST /api/v1/chat`), there is no TTY available, so these calls hang indefinitely — the API never responds.

### Fix
1. Added `interactive?: boolean` to `OrchestratorOptions` (defaults to `true` for backward compatibility)
2. `runPlanMode()` checks `interactive` flag: if `false`, auto-approves the plan instead of prompting stdin
3. `askContinue()` checks `interactive` flag: if `false`, auto-continues instead of prompting stdin
4. `/chat` endpoint passes `interactive: false` to the orchestrator
5. When plan mode triggers in `/chat`, the plan is generated upfront and returned in the response (`plan` + `sessionId` fields) so the UI can display it
6. The two-phase flow (`/chat/plan` + `/chat/execute`) remains the recommended approach for UI plan approval

### Files Changed
- `src/core/orchestrator.ts` — Added `interactive` option, modified `runPlanMode()` and `askContinue()`
- `src/api/routes.ts` — Modified `/chat` endpoint to pass `interactive: false` and return plan info
- `src/api/types.ts` — Added optional `plan` and `sessionId` to `ChatResponse`
