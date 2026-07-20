# WBS: implement-1. Each task overall final summary will be appended in tasks/task_history.md and database for UI.2.Each Phase report will contain total token (highlighted in red if above 1 million, green above 500m, blue below 500m) and number of iteration (red above 100, green above 50, blue below 20) highlighted in UI and CLI 3. highlight your request to continue yes/no and iteration max yes/no 4. fix this task is stoping without report observe. line:11,text:* (subagent 
file:src/core/orchestrator.ts,line:280,text:finalContent = \(subagent hit iteration limit without completing)"

- [x] Phase 1: Root Cause Analysis & Architecture Design
Analyze the orchestrator's iteration-limit handling, report generation, and token/iteration tracking. Produce updated `blueprint.md` and `solution-design.md` covering:
- The three broken paths in `orchestrator.ts` (subagent iteration limit, top-level iteration limit, missing partial success)
- Token/iteration tracking schema for DB and CLI/UI display
- Task history persistence model (DB + `tasks/task_history.md`)
- Continue/iteration-max highlight mechanism
- [x] Phase 2: Fix Subagent & Top-Level Iteration Limit Reports
Implement the core fix for the "stops without report" bug:
- Replace the hardcoded `"(subagent hit iteration limit without completing)"` string with an LLM-based `synthesizeReport()` call that extracts meaningful partial progress
- Ensure `synthesizeReport()` calls the LLM to generate a coherent summary (not just concatenated tool names)
- Add `partialSuccess` tracking to `lastOutcome` enum
- Wire `continueOnLimit` to auto-continue subagents when appropriate
- Update `onIterationLimitReached` in API routes to support graceful partial-completion reports
- [x] Phase 3: Token & Iteration Tracking Infrastructure
Add token counting and iteration tracking to the orchestrator and phase reports:
- Track total tokens consumed per task/phase (sum of all LLM calls)
- Track iteration count per phase
- Add token/iteration fields to `PhaseReport` and `TaskHistory` types
- Implement DB schema migration for new fields
- Add CLI output formatting with color highlighting (red >1M tokens, green >500K, blue <500K; red >100 iterations, green >50, blue <20)
- [x] Phase 4: Task History Persistence (DB + File)
Implement dual persistence for task history:
- Create `TaskHistoryStore` class (analogous to `PhaseReportStore`) with `save()`, `list()`, `getById()` methods
- Append final summary to `tasks/task_history.md` on task completion
- Wire orchestrator to call `TaskHistoryStore.save()` after `synthesizeReport()`
- Add API endpoints: `GET /api/v1/task-history`, `GET /api/v1/task-history/:id`
- Add UI components to display task history list and detail view
- [x] Phase 5: Continue/Iteration-Max Highlight & UI Polish
Add the highlight mechanism and polish the UI:
- Add `continueRequested` and `iterationMaxReached` boolean fields to `ChatMessage` type
- Highlight "Continue" button in red when the server explicitly requests user input to continue
- Highlight "Iteration Max" warning in red when iteration limit is reached
- Add token/iteration badges to phase report cards in UI (red/green/blue coloring)
- End-to-end validation: run a test task that hits iteration limit, verify partial report is generated, verify token/iteration counts are displayed correctly, verify task history is persisted
