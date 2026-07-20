# Phase 5: Continue/Iteration-Max Highlight & UI Polish
Add the highlight mechanism and polish the UI:
- Add `continueRequested` and `iterationMaxReached` boolean fields to `ChatMessage` type
- Highlight "Continue" button in red when the server explicitly requests user input to continue
- Highlight "Iteration Max" warning in red when iteration limit is reached
- Add token/iteration badges to phase report cards in UI (red/green/blue coloring)
- End-to-end validation: run a test task that hits iteration limit, verify partial report is generated, verify token/iteration counts are displayed correctly, verify task history is persisted

**Task:** implement-1. Each task overall final summary will be appended in tasks/task_history.md and database for UI.2.Each Phase report will contain total token (highlighted in red if above 1 million, green above 500m, blue below 500m) and number of iteration (red above 100, green above 50, blue below 20) highlighted in UI and CLI 3. highlight your request to continue yes/no and iteration max yes/no 4. fix this task is stoping without report observe. line:11,text:* (subagent 
file:src/core/orchestrator.ts,line:280,text:finalContent = \(subagent hit iteration limit without completing)"

**Result:**

(subagent hit iteration limit without completing)

**Stats:**
- Tokens: 1,024,176
- Iterations: 21
