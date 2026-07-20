# RCA Postmortem: Orchestrator Iteration-Limit Summary Report Loss

**Date:** 2026-07-20
**Author:** devnull (automated RCA)
**Severity:** P0 — Tasks crash/stop without a meaningful summary report when the iteration limit is hit, leaving users with empty or generic messages instead of actionable partial-progress information.

---

## Timeline

| Time | Event |
|------|-------|
| Phase 1 (original) | `ReActOrchestrator` implemented with a hardcoded fallback string `"(subagent hit iteration limit without completing)"` for subagents hitting the iteration limit. |
| Phase 2 | `synthesizeReport()` method added to produce a mechanical reconstruction of tool calls and observations from message history. |
| Phase 2 | Subagent path updated to call `synthesizeReport()` instead of returning the hardcoded string. |
| Phase 2 | `runPhasePlanning()` implemented with per-phase sub-orchestrators, inheriting the subagent iteration-limit path. |
| Phase 2 | API routes configured with `onIterationLimitReached: async () => false` — always stop on iteration limit. |
| Current | Three distinct code paths exist for iteration-limit handling, each with different quality of output. The `synthesizeReport()` method is purely mechanical (no LLM call to generate a coherent summary). |

---

## Root Cause

**The orchestrator has no mechanism to produce a coherent, LLM-generated summary of partial progress when the iteration limit is hit.** The `synthesizeReport()` method (line 625) is purely mechanical — it concatenates raw tool call names and truncated observations from the message history. It never calls the LLM to synthesize what was accomplished vs. what was left undone. Compare this to `runPhasePlanning()` (line 610), which DOES call the LLM to summarize each phase's result via a `summaryPrompt`. The main loop and subagent paths lack this summarization step entirely.

---

## Contributing Factors

### CF1: `synthesizeReport()` is purely mechanical — no LLM call for coherent summarization
**File:** `src/core/orchestrator.ts`, lines 625–685
**Evidence:**
```typescript
private synthesizeReport(
  taskDescription: string,
  messages: LlmMessage[],
  currentFinalContent: string,
  maxIterations: number,
  restartCount: number
): string {
    // ... purely mechanical extraction of tool call names and observations ...
    // No LLM call to synthesize a coherent summary
    const parts: string[] = [];
    parts.push(`Task stopped: hit the ${maxIterations}-iteration limit...`);
    if (toolActions.length > 0) {
      parts.push(`\n## What was done\n\n...${toolActions.map(...)}`);
    }
    // ...
}
```
The method reconstructs tool call names and raw observation snippets but never asks the LLM "what was accomplished?" This produces a mechanical laundry list rather than a meaningful summary. Compare with `runPhasePlanning()` at line 610 which DOES use an LLM summary prompt.

### CF2: Subagent iteration-limit path (line 310–330) returns synthesized report but parent treats it as a normal completion
**File:** `src/core/orchestrator.ts`, lines 310–330
**Evidence:**
```typescript
if (runOpts.isSubagent) {
  this.lastOutcome = "partial_success";
  finalContent = await this.synthesizeReport(
    taskDescription, messages, finalContent, maxIterations, restartCount
  );
  break;
}
```
When a subagent (including phase-planning phases) hits the iteration limit, `synthesizeReport()` is called and `lastOutcome` is set to `"partial_success"`. However, the parent orchestrator's `runSubagent()` method (line 700) checks `subOutcome === "partial_success"` and returns a `SubagentResult` with `status: "iteration_limit"`. This is correct — the parent gets the synthesized report. **But** the parent's main loop (line 460–500) then asks the user whether to continue the subagent. If declined, it calls `synthesizeSubagentPartialReport()` (line 510) which is ALSO purely mechanical — same problem as CF1.

### CF3: API routes hardcode `onIterationLimitReached: async () => false` — no graceful degradation
**File:** `src/api/routes.ts`, lines 163 and 339
**Evidence:**
```typescript
const opts: OrchestratorOptions = {
  cwd,
  interactive: false,
  onIterationLimitReached: async () => false,
};
```
The API always stops on iteration limit. There's no graceful degradation — the API never auto-continues or synthesizes a partial-completion report. The `continueOnLimit` option exists but is only used when the UI explicitly sends it. When the limit is hit, the API returns `data.limitation = "The task did not finish within the iteration limit."` regardless of what `synthesizeReport()` produced. The synthesized report IS in `data.result`, but the API's response structure doesn't distinguish between a "completed" result and a "partial progress" result in a way that the UI can easily surface.

### CF4: Phase planning amplifies the iteration-limit problem — each phase runs as a subagent with the weakest summarization
**File:** `src/core/orchestrator.ts`, lines 555–600
**Evidence:**
```typescript
const sub = new ReActOrchestrator(this.llm, this.telemetry, {
  ...this.opts,
  cwd: this.cwd,
  projectRoot: this.projectRoot,
  consoleIndent: (this.opts.consoleIndent ?? 0) + 1,
  singlePhase: true,
});
const phaseResult = await sub.run(phaseTask, { ...runOpts, isSubagent: true });
```
Each phase runs as a sub-orchestrator with `isSubagent: true`. If a phase hits the iteration limit, the subagent path (CF2) produces a mechanical `synthesizeReport()`. This mechanical report is then:
1. Written to the phase report file (line 570)
2. Passed to the LLM summarizer (line 610) — this IS an LLM call, but it's summarizing a mechanical report, not the actual phase work
3. Passed to the next phase as context (line 620)

So a single phase hitting the limit produces a weak summary that propagates to all subsequent phases.

### CF5: `lastOutcome` only tracks coarse states — no "partial success with details"
**File:** `src/core/orchestrator.ts`, line 130
**Evidence:**
```typescript
private lastOutcome: "completed" | "iteration_limit" | "plan_rejected" | "partial_success" = "completed";
```
The `lastOutcome` type has no way to say "80% done, here's what was accomplished." When the iteration limit is hit, all context about what was actually done (files edited, tests run, configs changed) is discarded in favor of a generic fallback message. The `"partial_success"` value exists but is only set in the subagent path — the API routes check for `"iteration_limit"` and `"plan_rejected"` but not `"partial_success"`.

---

## Causal Chain

```
TRIGGER: Task exceeds maxIterations (model keeps making tool calls without producing a final answer)
    │
    ▼
Orchestrator main loop detects iteration > maxIterations (line 305)
    │
    ├── isSubagent === true (line 310)
    │   │
    │   ▼
    │   Calls synthesizeReport() — purely mechanical, no LLM call (line 325)
    │   │
    │   ▼
    │   Returns concatenated tool call names + raw observation snippets
    │   │
    │   ▼
    │   Parent receives SubagentResult with status: "iteration_limit" (line 740)
    │   │
    │   ├── Parent asks user "continue?" (line 470)
    │   │   │
    │   │   ├── YES → re-invokes subagent with continuation context (line 480)
    │   │   │
    │   │   └── NO → calls synthesizeSubagentPartialReport() — ALSO mechanical (line 510)
    │   │
    │   └── Result: mechanical summary, no coherent "what was accomplished"
    │
    └── isSubagent === false (line 335)
        │
        ▼
        Calls onIterationLimitReached → API returns false (line 338)
        │
        ▼
        Calls synthesizeReport() — purely mechanical (line 354)
        │
        ▼
        Returns concatenated tool call names + raw observation snippets
        │
        ▼
        API returns data.result = mechanical summary, data.limitation = generic message
        │
        ▼
        ROOT CAUSE: No LLM call to synthesize a coherent summary of partial progress
```

---

## Corrective Actions

### P0: Add LLM-based summarization to `synthesizeReport()`
- **What:** Replace the purely mechanical `synthesizeReport()` with a method that calls the LLM to generate a coherent summary of what was accomplished, what was left undone, and what state the workspace is in.
- **File:** `src/core/orchestrator.ts`, method `synthesizeReport()` (line 625)
- **How:** Extract the last N tool calls and observations from message history, pass them to the LLM with a prompt like "Summarize what was accomplished in these ReAct steps. Focus on files changed, tests run, and any partial results. Be concise (2-4 sentences)."
- **Verification:** Run `testReproduceCrashStop.ts` — the result should contain a coherent summary (not just a list of tool call names) when the iteration limit is hit.

### P0: Add LLM-based summarization to `synthesizeSubagentPartialReport()`
- **What:** Same fix as above but for the subagent partial report path.
- **File:** `src/core/orchestrator.ts`, method `synthesizeSubagentPartialReport()` (line 780)
- **How:** Same approach — call the LLM to summarize the subagent's accumulated tool calls and observations.
- **Verification:** Run `testRcaIterationLimit.ts` — the subagent partial report should contain a coherent summary.

### P1: Add `"partial_success"` handling to API routes
- **What:** The API routes check for `"iteration_limit"` and `"plan_rejected"` outcomes but not `"partial_success"`. When the outcome is `"partial_success"`, the API should still return the synthesized report as `data.result` but with a different `data.limitation` message that indicates partial progress was made.
- **File:** `src/api/routes.ts`, lines 180–190 and 350–360
- **How:** Add `outcome === "partial_success"` to the limitation check, with a message like "The task was stopped due to the iteration limit, but partial progress was made."
- **Verification:** Hit `/api/v1/chat` with a task that exceeds maxIterations — the response should include `data.limitation` with a partial-progress message.

### P1: Add `"partial_success"` to `lastOutcome` type documentation and API response
- **What:** The `lastOutcome` type already includes `"partial_success"` but it's only set in the subagent path. Document that the API should handle it, and ensure the API response includes it.
- **File:** `src/core/orchestrator.ts` line 130 (type definition), `src/api/routes.ts` (response handling)
- **Verification:** The API response should include `data.outcome` field so the UI can distinguish "completed" from "partial_success".

### P2: Add iteration-limit telemetry to `synthesizeReport()` output
- **What:** Include the iteration count, restart count, and token usage in the synthesized report so users know how much work was done.
- **File:** `src/core/orchestrator.ts`, method `synthesizeReport()` (line 625)
- **How:** Add `iterationCount` and `restartCount` parameters to `synthesizeReport()` and include them in the output.
- **Verification:** The synthesized report should include "X iterations completed across Y restarts" in its output.

---

## Verification Plan

1. **Run `testReproduceCrashStop.ts`** — all three scenarios should pass with coherent summaries, not mechanical tool-call lists.
2. **Run `testRcaIterationLimit.ts`** — all three tests should pass with meaningful fallback messages.
3. **Manual API test:** Send a task that exceeds maxIterations to `/api/v1/chat` — the response should include a coherent summary in `data.result` and an appropriate `data.limitation` message.
4. **Manual phase planning test:** Run a multi-phase task where one phase hits the iteration limit — the phase report should contain a coherent summary, not a mechanical tool-call list.
