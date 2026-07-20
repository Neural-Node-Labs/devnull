# WBS: the Health or score can you include in the react memory so LLM can improve the score, include directive to improve score although out the react iteration

- [x] Phase 1: Define Score/Health Types and Memory Schema
Define a `ScoreEntry` type (e.g., `{ timestamp, score: number, reason: string }`) and a `HealthScore` type (e.g., `{ current: number, history: ScoreEntry[], trend: 'up' | 'down' | 'stable' }`). Add a `healthScore` field to the `ReActMemory` interface in `src/core/types.ts`. Update the memory initialization to include a default health score (e.g., `{ current: 0.5, history: [], trend: 'stable' }`).
- [x] Phase 2: Add Score-Improvement Directive to System Prompt
In `src/core/orchestrator.ts`, inject a directive into the system prompt (the `buildSystemPrompt()` or equivalent method) that instructs the LLM to: "At each ReAct iteration, evaluate your progress toward the goal. If your current health score is below 1.0, propose actions that would increase it. After each tool call, update the health score based on whether the action moved you closer to completion." This ensures the LLM is constantly aware of and acting on the score.
- [x] Phase 3: Implement Score Update Logic in the ReAct Loop
In the main ReAct loop (likely `src/core/orchestrator.ts` or `src/core/reactLoop.ts`), after each tool call and observation, call a new `updateHealthScore()` method. This method:
- Parses the LLM's reasoning for a self-assessed score (e.g., from a `score: 0.7` token in the response).
- Falls back to a heuristic: if the last tool call succeeded and produced a non-empty observation, increment by 0.1 (capped at 1.0); if it failed or errored, decrement by 0.2 (floored at 0.0).
- Appends a `ScoreEntry` to `memory.healthScore.history`.
- Recalculates `memory.healthScore.trend` based on the last 3 entries.
- [x] Phase 4: Wire Score into Iteration-Limit and Summary Logic
Modify `synthesizeReport()` and the iteration-limit handler to include the final health score and trend in the summary text (e.g., "Health score: 0.8 (trending up) — 80% of goal achieved"). In the iteration-limit handler, if the score is above a threshold (e.g., 0.7), treat it as a "partial success" and include the score in the fallback message instead of the generic "(subagent hit iteration limit without completing)". This gives the parent orchestrator meaningful partial-completion data.
