# Phase 1: Define Score/Health Types and Memory Schema
Define a `ScoreEntry` type (e.g., `{ timestamp, score: number, reason: string }`) and a `HealthScore` type (e.g., `{ current: number, history: ScoreEntry[], trend: 'up' | 'down' | 'stable' }`). Add a `healthScore` field to the `ReActMemory` interface in `src/core/types.ts`. Update the memory initialization to include a default health score (e.g., `{ current: 0.5, history: [], trend: 'stable' }`).

**Task:** the Health or score can you include in the react memory so LLM can improve the score, include directive to improve score although out the react iteration

**Result:**

All existing imports are unaffected — the new types are additive and don't change any existing exports.

Here's a summary of what was done for **Phase 1**:

### Changes Made

**File: `src/core/types.ts`**

Added three new types and one constant:

1. **`ScoreEntry`** — A single health score entry with:
   - `timestamp: string` (ISO 8601)
   - `score: number` (0-100)
   - `reason: string` (human-readable explanation)

2. **`HealthScore`** — Aggregated health score with:
   - `current: number` (rolling average, 0-100)
   - `history: ScoreEntry[]` (ordered history, oldest first)
   - `trend: 'up' | 'down' | 'stable'` (direction based on recent changes)

3. **`ReActMemory`** — Persistent memory state for a ReAct agent run with:
   - `healthScore: HealthScore` field

4. **`DEFAULT_HEALTH_SCORE`** — Default initialization value:
   - `{ current: 0.5, history: [], trend: 'stable' }`

**Verification:** `npx tsc --noEmit` passes with zero errors.

**Stats:**
- Tokens: 609,189
- Iterations: 20
