# RCA Postmortem: System Stops Without Summary Report

**Date:** 2026-07-20
**Incident:** Tasks crash/stop without producing a meaningful summary report to console or task history
**Severity:** P0 — Blocks reliable operation; users cannot determine what was accomplished

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 2026-07-20 ~04:30 | User reports tasks stopping without summary output |
| 2026-07-20 ~04:32 | Previous RCA initiated (`task_1784524924561_nxbi0a`) — investigates "tasks crash/stop without summary report to console" |
| 2026-07-20 ~05:22 | Previous RCA completes 4 phases, produces postmortem with 5 corrective actions |
| 2026-07-20 ~06:43 | "fix subagent iteration limit" task initiated — adds continue/retry logic for subagents |
| 2026-07-20 ~07:22 | "implement task history" task initiated — adds markdown + DB persistence |
| 2026-07-20 ~07:47 | "health score in ReAct memory" task initiated — adds health score tracking |
| 2026-07-20 ~08:00+ | **Current RCA** — re-examines the issue after corrective actions were partially implemented |

---

## Root Cause

**The orchestrator's iteration-limit handler produces a mechanical, low-quality summary that lacks meaningful information about what was accomplished, and the subagent path can return a hardcoded fallback string instead of a synthesized report.**

The root cause is a **structural design gap**: when the ReAct loop hits `maxIterations` while the model is still making tool calls (no final answer), the orchestrator has no mechanism to produce a useful summary of partial progress. The `synthesizeReport()` method exists but produces a mechanical reconstruction of tool call names and truncated observations — it does NOT call the LLM to generate a coherent summary of what was accomplished vs. left undone.

### Causal Chain

```
TRIGGER: Task exceeds maxIterations (default 20)
    │
    ▼
Model is mid-execution (making tool calls, no final answer)
    │
    ▼
Orchestrator enters iteration-limit handler
    │
    ├──→ Subagent path (isSubagent=true): returns hardcoded string
    │    "(subagent hit iteration limit without completing)"
    │    └──→ Parent receives garbage → writes to phase reports → passes to next phase
    │
    └──→ Top-level path: calls synthesizeReport()
         │
         ├──→ synthesizeReport() checks if currentFinalContent is "meaningful"
         │    (length > 30, doesn't end with "..." or "thinking...")
         │    └──→ Usually false — model was mid-tool-call, content is brief
         │
         ├──→ Falls through to mechanical reconstruction:
         │    - Extracts tool call names (not results)
         │    - Extracts truncated observations (first 200 chars)
         │    - Concatenates them with no LLM synthesis
         │    └──→ Result is a list of tool names, not a meaningful summary
         │
         └──→ Tries callLlmForSummary() — BUT this is inside a try/catch
              and if it fails (or returns empty), falls back to mechanical
              └──→ LLM call may succeed, but the prompt is verbose and
                   the result quality depends on the model's ability to
                   reconstruct context from truncated data
    │
    ▼
OUTCOME: Summary is written to task history and console as:
  "Task stopped: hit the 20-iteration limit without reaching a final answer.
   Health score: 0.5 (trending stable) — 50% of goal achieved.
   What was done: run_command_tool(command=echo step1), run_command_tool(command=echo step2)..."
    │
    ▼
USER SEES: No meaningful summary of what was accomplished
```

---

## Contributing Factors

### CF1 (P0): `synthesizeReport()` does NOT call the LLM as its primary path — it's a mechanical fallback

**Evidence:** `src/core/orchestrator.ts`, lines ~580-650 (`synthesizeReport()` method).

The method first checks if `currentFinalContent` is "meaningful" (length > 30, doesn't end with `...`). If the model was mid-tool-call, this is almost always false. It then falls through to a mechanical reconstruction that concatenates tool call names and truncated observations. The LLM summary call (`callLlmForSummary()`) is wrapped in a try/catch and only used as a secondary fallback — and even when it succeeds, the prompt passes truncated data (first 200 chars of observations, first 300 chars of messages), losing the rich context needed for a good summary.

```typescript
// Line ~580: Mechanical fallback — no LLM call
const parts: string[] = [];
parts.push(`Task stopped: hit the ${maxIterations}-iteration limit...`);
parts.push(`\n${healthLine}.`);
if (toolActions.length > 0) {
  parts.push(`\n## What was done\n\n${toolActions.map((a) => `- ${a}`).join("\n")}`);
}
// ...
return parts.join("\n");
```

### CF2 (P0): Subagent iteration-limit handler returns a hardcoded string with no synthesis

**Evidence:** `src/core/orchestrator.ts`, lines ~170-175 (inside the `while(true)` loop, `isSubagent` branch).

When a subagent hits the iteration limit, the code at line ~172-175 calls `synthesizeReport()` — but this was changed from the original hardcoded string. However, the `synthesizeReport()` method itself has the mechanical fallback problem described in CF1. The subagent path was improved from the original `"(subagent hit iteration limit without completing)"` but still produces low-quality output.

```typescript
// Line ~170-175 (current code):
if (runOpts.isSubagent) {
  this.lastOutcome = "partial_success";
  finalContent = await this.synthesizeReport(
    taskDescription, messages, finalContent, maxIterations, restartCount
  );
  break;
}
```

### CF3 (P1): Phase planning amplifies the problem — each phase runs as a subagent

**Evidence:** `src/core/orchestrator.ts`, lines ~800-900 (`runPhasePlanning()` method).

Phase planning divides the task into 2-5 phases, each running as a sub-orchestrator with `isSubagent: true`. When a phase hits the iteration limit, the subagent returns a low-quality synthesized report. This garbage output gets:
1. Written to the phase report file (`tasks/[task]-phase-[N].md`)
2. Passed to the LLM summarizer for the next phase's context
3. Written to the WBS file
4. Persisted to PostgreSQL (best-effort)

The result is a cascade of low-quality summaries that compound across phases.

### CF4 (P1): `callLlmForSummary()` passes truncated data, losing context

**Evidence:** `src/core/orchestrator.ts`, lines ~660-740 (`callLlmForSummary()` method).

The method truncates observations to 200 characters and messages to 300 characters. For a complex task with file reads, edits, and test runs, 200 characters is barely enough to capture a single observation, let alone the full context needed for a meaningful summary.

```typescript
// Line ~690: Truncation that loses context
transcriptParts.push(`  [Observation] ${obs.slice(0, 200)}`);
```

### CF5 (P2): No integration test validates summary quality

**Evidence:** `src/test/testReproduceCrashStop.ts` — the test exists but only checks that the result is non-empty and contains certain keywords. It does NOT validate that the summary is actually meaningful or useful.

```typescript
// Line ~80: Weak assertion — just checks for keywords
const hasUsefulContent =
  result.includes("iteration limit") ||
  result.includes("Task stopped") ||
  result.includes("maxIterations") ||
  result.includes("tool call") ||
  result.includes("What was done");
```

---

## Corrective Actions

### P0 — Fix Immediately

| # | Action | File(s) | Description | Verification |
|---|--------|---------|-------------|--------------|
| CA1 | **Make `callLlmForSummary()` the primary path in `synthesizeReport()`** | `src/core/orchestrator.ts` | Restructure `synthesizeReport()` so the LLM summary call is attempted FIRST (not as a try/catch fallback). Only fall back to mechanical reconstruction if the LLM call fails or returns empty. Pass the FULL message history (not truncated) to the LLM for maximum context. | Run `testReproduceCrashStop.ts` — the main loop scenario should produce a coherent LLM-generated summary, not a mechanical tool-call list. |
| CA2 | **Remove the "meaningful content" heuristic gate** | `src/core/orchestrator.ts` (lines ~585-595 in `synthesizeReport()`) | The check `if (currentFinalContent && currentFinalContent.length > 30)` gates the entire synthesis path. When the model is mid-tool-call, `currentFinalContent` is always short (e.g., "Reading file..."). Remove this gate so the LLM summary path is always attempted on iteration limit. | The same test — the summary should no longer be gated by `currentFinalContent` length. |

### P1 — Fix Soon

| # | Action | File(s) | Description | Verification |
|---|--------|---------|-------------|--------------|
| CA3 | **Pass full (untruncated) message history to `callLlmForSummary()`** | `src/core/orchestrator.ts` (lines ~680-700 in `callLlmForSummary()`) | Remove the 200-char truncation on observations and 300-char truncation on messages. The LLM summary call is cheap relative to the main ReAct loop — let it see the full context. If token limits are a concern, use a smarter truncation strategy (e.g., keep the last N complete tool-call cycles rather than hard-truncating each message). | The LLM-generated summary should reference specific file paths, tool results, and observations that were previously lost in truncation. |
| CA4 | **Add a `synthesizePhaseReport()` method for phase planning** | `src/core/orchestrator.ts` (in `runPhasePlanning()`) | When a phase completes (whether normally or via iteration limit), call a dedicated method that produces a structured phase report with: what was accomplished, files changed, tests run, blockers encountered. This is separate from the per-phase summary that gets passed to the next phase. | Phase reports in `tasks/[task]-phase-[N].md` should contain structured sections, not just the raw subagent output. |

### P2 — Nice to Have

| # | Action | File(s) | Description | Verification |
|---|--------|---------|-------------|--------------|
| CA5 | **Add integration test for summary quality** | `src/test/testReproduceCrashStop.ts` | Add assertions that validate the summary contains specific information about what was accomplished (e.g., "files modified: X, Y, Z", "commands run: A, B, C") rather than just checking for keyword presence. Use a mock LLM that returns a known summary to make the test deterministic. | The test should fail if the summary is just a mechanical tool-call list, and pass when it contains structured accomplishment information. |

---

## Lessons Learned

1. **Mechanical fallbacks are not summaries.** Concatenating tool call names is not a summary — it's a log. A real summary requires understanding what the tool calls accomplished, not just that they were made.

2. **LLM calls for summarization should be the primary path, not a fallback.** The cost of one extra LLM call at the end of a task is negligible compared to the cost of the main ReAct loop. Don't gate it behind heuristics or try/catch.

3. **Truncation before summarization loses context.** Truncating observations to 200 characters before passing them to the LLM for summarization defeats the purpose — the LLM needs the full context to produce a useful summary.

4. **Phase planning compounds low-quality output.** When each phase produces a low-quality summary, the next phase builds on garbage, and the final result is a cascade of meaningless text. Fix the summary quality at the subagent level first.

5. **Test assertions must validate quality, not just existence.** Checking that a result is non-empty or contains certain keywords is not sufficient to catch summary-quality regressions.
