# Phase 3: Token & Iteration Tracking Infrastructure
Add token counting and iteration tracking to the orchestrator and phase reports:
- Track total tokens consumed per task/phase (sum of all LLM calls)
- Track iteration count per phase
- Add token/iteration fields to `PhaseReport` and `TaskHistory` types
- Implement DB schema migration for new fields
- Add CLI output formatting with color highlighting (red >1M tokens, green >500K, blue <500K; red >100 iterations, green >50, blue <20)

**Task:** implement-1. Each task overall final summary will be appended in tasks/task_history.md and database for UI.2.Each Phase report will contain total token (highlighted in red if above 1 million, green above 500m, blue below 500m) and number of iteration (red above 100, green above 50, blue below 20) highlighted in UI and CLI 3. highlight your request to continue yes/no and iteration max yes/no 4. fix this task is stoping without report observe. line:11,text:* (subagent 
file:src/core/orchestrator.ts,line:280,text:finalContent = \(subagent hit iteration limit without completing)"

**Result:**

(subagent hit iteration limit without completing)

**Stats:**
- Tokens: 818,341
- Iterations: 21
