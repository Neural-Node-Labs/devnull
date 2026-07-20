# Phase 2: Add Score-Improvement Directive to System Prompt
In `src/core/orchestrator.ts`, inject a directive into the system prompt (the `buildSystemPrompt()` or equivalent method) that instructs the LLM to: "At each ReAct iteration, evaluate your progress toward the goal. If your current health score is below 1.0, propose actions that would increase it. After each tool call, update the health score based on whether the action moved you closer to completion." This ensures the LLM is constantly aware of and acting on the score.

**Task:** the Health or score can you include in the react memory so LLM can improve the score, include directive to improve score although out the react iteration

**Result:**

The test failures are all pre-existing issues unrelated to my change:
- `contextCompaction.test.ts` — 3 failures about stale read markers (pre-existing)
- `ignoreRules.test.ts` — 2 failures about pattern matching (pre-existing)
- `protocol.test.ts` — 1 failure about lesson timestamp format (pre-existing)
- `skillRegistry.test.ts` — 1 failure about path format on Windows (pre-existing)
- `taskHistory.test.ts` — 3 failures about iteration/token formatting (pre-existing)
- All the Playwright/e2e failures are pre-existing (missing `@playwright/test` package, version conflicts)

The unit tests that are relevant to my change (`stepScorer.test.ts` — all 18 pass) confirm nothing is broken.

## Summary

**Phase 2 complete.** I added a **"Health Score Awareness"** directive to the `buildSystemPrompt()` function in `src/core/orchestrator.ts`. The directive:

1. **Informs the LLM** that its execution is tracked with a rolling health score (0-100)
2. **Instructs it to evaluate progress** at each ReAct iteration
3. **Tells it to propose corrective actions** when the health score drops below 40 (the threshold used by the existing self-healing nudge at line 618)
4. **Explains the scoring mechanism** — the system automatically scores each tool call based on whether it moved closer to completion
5. **Encourages strategy adjustment** when the score indicates the agent is stuck

The directive is injected into the system prompt alongside the base ReAct agent description, before the skill blocks. TypeScript compilation passes cleanly (`npx tsc --noEmit` exits 0).

**Stats:**
- Tokens: 660,248
- Iterations: 19
