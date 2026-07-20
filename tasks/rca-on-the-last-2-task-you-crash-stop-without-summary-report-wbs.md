# WBS: RCA on the last 2 task you crash/stop without summary report to console

- [x] Phase 1: Establish Timeline & Gather Evidence
- **Goal:** Identify the exact last 2 tasks that failed, locate all relevant logs, error outputs, and context from those sessions. Establish a precise timeline of events leading to the crash/stop.
- **Key Actions:** Search for `.log` files, session artifacts, and any error output. Correlate the timing of the crash with any recent changes (deploys, config changes, code merges).
- [x] Phase 2: Reproduce & Isolate the Failure
- **Goal:** Attempt to reproduce the crash/stop condition in a controlled manner. If reproducible, isolate the exact code path, function, or condition that triggers the failure.
- **Key Actions:** Run the failing tasks or a minimal reproduction script. Use debug logging or step-through to pinpoint the exact line or state where execution halts.
- [x] Phase 3: Iterative "Why" Analysis & Hypothesis Verification
- **Goal:** Apply the 5 Whys to the isolated failure point. Distinguish the root cause (structural/systemic gap) from the trigger (what set it off) and contributing factors.
- **Key Actions:** For each "why" answer, verify with evidence (logs, code review, config check). Produce a clear causal chain.
- [x] Phase 4: Document Findings & Corrective Actions
- **Goal:** Produce the RCA output artifacts: timeline, root cause, contributing factors, and specific corrective actions (with priority). Update `tasks/lessons.md` with the new pattern to prevent recurrence.
- **Key Actions:** Write the postmortem. Define actionable fixes (code change, config update, monitoring addition). Assign priority to each corrective action.
</planning>
