# Phase 2: Fix Subagent & Top-Level Iteration Limit Reports
Implement the core fix for the "stops without report" bug:
- Replace the hardcoded `"(subagent hit iteration limit without completing)"` string with an LLM-based `synthesizeReport()` call that extracts meaningful partial progress
- Ensure `synthesizeReport()` calls the LLM to generate a coherent summary (not just concatenated tool names)
- Add `partialSuccess` tracking to `lastOutcome` enum
- Wire `continueOnLimit` to auto-continue subagents when appropriate
- Update `onIterationLimitReached` in API routes to support graceful partial-completion reports

**Task:** implement-1. Each task overall final summary will be appended in tasks/task_history.md and database for UI.2.Each Phase report will contain total token (highlighted in red if above 1 million, green above 500m, blue below 500m) and number of iteration (red above 100, green above 50, blue below 20) highlighted in UI and CLI 3. highlight your request to continue yes/no and iteration max yes/no 4. fix this task is stoping without report observe. line:11,text:* (subagent 
file:src/core/orchestrator.ts,line:280,text:finalContent = \(subagent hit iteration limit without completing)"

**Result:**

(subagent hit iteration limit without completing)

**Stats:**
- Tokens: 1,138,970
- Iterations: 21
