# Plan: Phase 4: Wire the UI "Continue" Button for Subagent Limits
Extend the existing UI "▶ Continue" button (currently only shown on top-level limitation messages) to also appear when a subagent hits its iteration limit. Ensure the re-send payload includes the necessary flags (`continueOnLimit: true`) and the preserved subagent context so the server can resume the subagent without losing progress. Test the full flow end-to-end.

### Phase 4: Wire the UI "Continue" Button for Subagent Limits
Extend the existing UI "▶ Continue" button (currently only shown on top-level limitation messages) to also appear when a subagent hits its iteration limit. Ensure the re-send payload includes the necessary flags (`continueOnLimit: true`) and the preserved subagent context so the server can resume the subagent without losing progress. Test the full flow end-to-end.

Context from previous phases:

### Phase 1: Diagnose the Subagent Iteration-Limit Behavior
Read the orchestrator source (`src/core/orchestrator.ts`) and the subagent tool implementation to understand exactly how iteration limits propagate. Identify the code path where a subagent hitting `maxIterations` causes the entire process to stop rather than returning control to the parent. Document the current flow and the specific lines that need to change.
In Phase 1, the orchestrator source (`src/core/orchestrator.ts`) and subagent tool implementation were analyzed to trace how iteration limits propagate. The key finding is that when a subagent hits `maxIterations`, the orchestrator's `runSubagent` method returns a `lastOutcome` of `iteration_limit` which causes the entire process to stop rather than returning control to the parent agent. No files were changed; this was purely a diagnostic phase that identified the specific code paths needing modification in subsequent phases.

_Phase report: tasks/fix-subagent-it-might-be-the-tool-it-stop-the-entire-process-phase-1.md_

### Phase 2: Refactor Subagent Iteration-Limit Handling
Modify the subagent execution path so that when a subagent hits the iteration limit, it does not terminate the parent orchestrator. Instead, return a structured result (e.g., `{ status: "iteration_limit", partialOutput, iterationCount }`) to the parent, allowing the parent to decide whether to continue, retry, or synthesize a partial report. Ensure the subagent's accumulated context (tool calls, observations) is preserved in the returned result.
Based on the phase result, the refactoring of subagent iteration-limit handling was partially completed. The key changes were made to `src/core/types.ts` and `src/core/orchestrator.ts`, including adding a `lastOutcome` property and `lastMessages` field to preserve subagent context. However, the implementation was not finished—the final step of saving messages to `lastMessages` before the `return finalContent;` line in the `run()` method was identified but not executed. The next phase needs to complete this final edit and verify the full iteration-limit result flow works correctly.

_Phase report: tasks/fix-subagent-it-might-be-the-tool-it-stop-the-entire-process-phase-2.md_

### Phase 3: Add "Continue" Prompt to Parent Orchestrator
Update the parent orchestrator's logic after receiving an iteration-limited subagent result to emit a user-facing prompt (e.g., via the existing `onIterationLimitReached` callback or a new `onSubagentLimitReached` callback) asking whether to continue. When the user responds "yes", reset the subagent's iteration counter and re-invoke it with the preserved context. When "no", synthesize a partial-completion report from the subagent's accumulated work.
In Phase 3, the parent orchestrator was updated to prompt the user when a subagent hits its iteration limit, asking whether to continue. The key file changed was `src/core/orchestrator.ts`, where logic was added to reset the subagent's iteration counter and re-invoke it with preserved context on a "yes" response, or synthesize a partial-completion report on "no". The next phase should note that the `askContinue` method and related callback integration are in place, but the `lastMessages` state may still need to be saved before the `return finalContent;` line in the `run()` method.

_Phase report: tasks/fix-subagent-it-might-be-the-tool-it-stop-the-entire-process-phase-3.md_


Complete this phase. Do not work on future phases — focus only on what this phase requires.

## Plan: Wire UI "Continue" Button for Subagent Limits

- [ ] **Read current UI chat component** — Read `ui/src/components/Chat.svelte` (or equivalent) to understand the existing "▶ Continue" button implementation for top-level limitation messages. Identify the message type/field detection logic and the `handleContinue` function.

- [ ] **Read orchestrator's subagent limit response format** — Read `src/core/orchestrator.ts` to confirm the exact structure returned when a subagent hits its iteration limit (the `lastOutcome`, `lastMessages`, and any `limitation` field in the response). Verify what the API sends to the UI for subagent limits vs. top-level limits.

- [ ] **Read API route handler** — Read `src/api/routes.ts` to see how the orchestrator's subagent limit result is serialized into the SSE/WebSocket response. Confirm whether subagent limits produce a `limitation` message type in the UI stream.

- [ ] **Extend UI "Continue" button to subagent limits** — Modify the chat component to detect subagent limitation messages (same `limitation` field or a new indicator) and show the "▶ Continue" button. Ensure the re-send payload includes `continueOnLimit: true` AND the preserved subagent context (e.g., `lastMessages` or a continuation token).

- [ ] **Verify API accepts subagent continuation payload** — Read `src/api/routes.ts` to confirm the `/api/v1/chat/execute` endpoint correctly handles `continueOnLimit: true` with subagent context. If missing, add the necessary logic to pass the preserved context to the orchestrator's `continueSubagent()` or equivalent method.

- [ ] **Test end-to-end flow** — Run the application (or relevant unit/integration tests) to verify: (1) subagent hits iteration limit, (2) UI shows "▶ Continue" button, (3) clicking it re-sends with correct payload, (4) server resumes subagent with preserved context, (5) subagent completes successfully.
