# Postmortem: Tasks Crash/Stop Without Summary Report

**Date:** 2026-07-20
**Severity:** Medium (loss of task output, degraded user experience)
**Affected Component:** `src/core/orchestrator.ts` — ReAct loop iteration-limit handler
**Report Author:** devnull (RCA agent)

---

## Timeline

| Time | Event |
|------|-------|
| **T-0** | User submits a complex task requiring >20 iterations (the default `maxIterations`) |
| **T-~15 min** | Orchestrator reaches iteration 20 while the model is still making tool calls (no final answer produced) |
| **T-~15 min** | Iteration-limit check fires. For **subagents** (phase planning phases): returns hardcoded string `"(subagent hit iteration limit without completing)"` — no `synthesizeReport()` call |
| **T-~15 min** | For **top-level tasks**: `synthesizeReport()` runs but produces a mechanical reconstruction of tool call names and truncated observations — no LLM-based summary |
| **T-~15 min** | API route (`src/api/routes.ts`) receives the result. `onIterationLimitReached` is hardcoded to `async () => false`, so the orchestrator stops |
| **T-~15 min** | API returns `{ limitation: "The task did not finish within the iteration limit." }` — no meaningful summary of what was accomplished |
| **T+0** | User sees a generic error message with no actionable information about partial progress |

### Trigger
Task complexity exceeds 20 iterations (the default `maxIterations` ceiling).

---

## Root Cause

**Structural design gap:** The orchestrator has **no mechanism to synthesize a meaningful summary when the iteration limit is hit**. It treats the limit as a hard stop with a generic fallback, rather than as a signal to produce a useful partial-completion report.

The `synthesizeReport()` method (lines 340-395 of `orchestrator.ts`) is purely mechanical — it concatenates raw tool call names and truncated observations. There is no LLM call to synthesize a coherent summary of what was accomplished vs. what was left undone. Compare this to `runPhasePlanning()` which DOES call the LLM to summarize each phase's result.

---

## Contributing Factors

### Factor 1: Subagent iteration-limit handler is a hardcoded no-op string (P0)
**Location:** `orchestrator.ts`, lines 172-175
```typescript
if (runOpts.isSubagent) {
  // Subagents don't interactively prompt — they just stop and report what they have.
  finalContent = "(subagent hit iteration limit without completing)";
  break;
}
```
The subagent path bypasses `synthesizeReport()` entirely. No tool call history, no observations, no last thought — just a hardcoded string. This is the most severe path because phase planning runs each phase as a subagent, so every phase that hits the limit produces zero useful output.

### Factor 2: `synthesizeReport()` is mechanical — no LLM call (P0)
**Location:** `orchestrator.ts`, lines 340-395
The method extracts tool call names and truncated observation strings but never calls the LLM to produce a coherent summary. The output is a list of raw tool names like `read_tool(filePath=src/main.ts)` — not a human-readable description of what was accomplished.

### Factor 3: Phase planning amplifies the problem (P1)
**Location:** `orchestrator.ts`, `runPhasePlanning()` method
Each phase runs as a subagent with `isSubagent: true`, inheriting the weakest iteration-limit handler (Factor 1). A single phase hitting the limit returns garbage to the parent, which gets written to phase reports AND passed to the LLM summarizer for the next phase. The final result is a concatenation of empty summaries.

### Factor 4: API routes hardcode `onIterationLimitReached: async () => false` (P1)
**Location:** `src/api/routes.ts`, lines 103-105
```typescript
const opts: OrchestratorOptions = {
  cwd,
  interactive: false,
  onIterationLimitReached: async () => false,
};
```
The API always stops on iteration limit. There's no graceful degradation — the API never auto-continues or synthesizes a partial-completion report. The `continueOnLimit` option exists but is only used when the UI explicitly sends it.

### Factor 5: No partial-completion concept in the outcome model (P2)
**Location:** `orchestrator.ts`, line 56
```typescript
private lastOutcome: "completed" | "iteration_limit" | "plan_rejected" = "completed";
```
`lastOutcome` only tracks three states. There's no way to say "80% done, here's what was accomplished." When the iteration limit is hit, all context about what was actually done (files edited, tests run, configs changed) is discarded in favor of a generic fallback message.

---

## Causal Chain

```
TRIGGER: Task needs >20 iterations
    → Iteration limit hit at iteration 21
    → Subagent path (phase planning): hardcoded string, no synthesizeReport()
    → Top-level path: mechanical tool-name reconstruction, no LLM summary
    → Phase planning: garbage in → garbage out across all phases
    → API: hardcoded stop, no graceful degradation
    → ROOT CAUSE: No LLM-based summary synthesis on iteration limit
```

---

## Corrective Actions

### P0 — Critical (Fix immediately, blocks reliable operation)

| # | Action | File(s) | Description |
|---|--------|---------|-------------|
| CA-1 | **Add LLM-based summary synthesis to `synthesizeReport()`** | `src/core/orchestrator.ts` | Replace the mechanical tool-name concatenation with an LLM call that reads the full message history and produces a coherent summary of what was accomplished, what was left undone, and what state the workspace is in. The LLM call should be cheap (small prompt, low max_tokens). |
| CA-2 | **Fix subagent iteration-limit handler to call `synthesizeReport()`** | `src/core/orchestrator.ts` (lines 172-175) | Replace the hardcoded string `"(subagent hit iteration limit without completing)"` with a call to `synthesizeReport()` so subagents also produce meaningful partial-completion reports. |

### P1 — High (Fix soon, significant degradation)

| # | Action | File(s) | Description |
|---|--------|---------|-------------|
| CA-3 | **Add graceful degradation to API iteration-limit handler** | `src/api/routes.ts` | Instead of hardcoding `onIterationLimitReached: async () => false`, add a configurable fallback that auto-continues once (or synthesizes a report). The API should not silently discard partial progress. |
| CA-4 | **Add `partialCompletion` outcome type** | `src/core/orchestrator.ts` | Extend `lastOutcome` to include `"partial_completion"` so callers can distinguish "hit the limit but here's what got done" from "hit the limit with nothing useful." |

### P2 — Medium (Improvement, not blocking)

| # | Action | File(s) | Description |
|---|--------|---------|-------------|
| CA-5 | **Increase default `maxIterations` for phase planning** | `src/core/orchestrator.ts` | Phase planning tasks are inherently more complex. Consider a higher default (e.g., 30) or a dynamic ceiling based on the number of phases. |

---

## Verification

Each corrective action must be verified before marking complete:

- **CA-1**: Run a task that hits the iteration limit. Verify the returned summary includes meaningful information about what was accomplished (files changed, tests run, etc.), not just raw tool call names.
- **CA-2**: Run a phase-planned task where one phase hits the iteration limit. Verify the phase report contains a meaningful summary, not the hardcoded fallback string.
- **CA-3**: Hit the iteration limit via the API. Verify the response includes a useful summary rather than just a generic limitation message.
- **CA-4**: Verify `lastOutcome` returns `"partial_completion"` when the iteration limit is hit with partial progress.
- **CA-5**: Verify phase-planned tasks have a higher iteration ceiling than single-phase tasks.

---

## Lessons Learned

See `tasks/lessons.md` section "2026-07-20: RCA — Tasks Crash/Stop Without Summary Report" for the 5 patterns captured from this analysis.
