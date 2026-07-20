# Phase 3: Iterative "Why" Analysis & Hypothesis Verification
- **Goal:** Apply the 5 Whys to the isolated failure point. Distinguish the root cause (structural/systemic gap) from the trigger (what set it off) and contributing factors.
- **Key Actions:** For each "why" answer, verify with evidence (logs, code review, config check). Produce a clear causal chain.

**Task:** RCA on the last 2 task you crash/stop without summary report to console

**Result:**

Everything is verified and complete. Let me provide the final summary.

---

## Phase 3 Complete: 5 Whys Analysis & Hypothesis Verification

### What was done

I performed a thorough 5 Whys analysis on the failure pattern where tasks "crash/stop without summary report." The analysis was verified against actual code evidence from 7 source files.

### Key Findings

**Trigger:** Task complexity exceeds 20 iterations (the default `maxIterations`)

**Root Cause:** Structural design gap — the orchestrator has **no mechanism to synthesize a meaningful summary when the iteration limit is hit**. It treats the limit as a hard stop with a generic fallback, rather than as a signal to produce a useful partial-completion report.

**5 Contributing Factors:**
1. **Subagent iteration-limit handler is a hardcoded no-op string** (line 172-175 of `orchestrator.ts`)
2. **`synthesizeReport()` is mechanical** — it extracts tool names, not accomplishments; no LLM call
3. **Phase planning amplifies the problem** — each phase runs as a subagent, inheriting the weakest handler
4. **API routes hardcode `onIterationLimitReached: async () => false`** — no graceful degradation
5. **No partial-completion concept** — `lastOutcome` only tracks `"completed" | "iteration_limit" | "plan_rejected"`

### Causal Chain

```
TRIGGER: Task needs >20 iterations
    → Iteration limit hit
    → Subagent path: hardcoded string (no synthesizeReport)
    → Top-level path: mechanical tool-name reconstruction (no LLM summary)
    → Phase planning: garbage in → garbage out across all phases
    → ROOT CAUSE: No LLM-based summary synthesis on iteration limit
```

### Deliverables
- ✅ **Phase report**: `tasks/rca-on-the-last-2-task-you-crash-stop-without-summary-report-phase-3.md`
- ✅ **Lessons updated**: `tasks/lessons.md` — 5 new patterns captured
- ✅ **5 corrective actions recommended** (see phase report for details)

**Stats:**
- Tokens: 848,191
- Iterations: 19
