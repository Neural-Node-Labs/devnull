# Phase 2: Task History Markdown Writer
Implement the logic that appends a new entry to `tasks/task_history.md` after each task completes. This includes: creating the file if it doesn't exist (with a header), formatting each entry as a markdown table row, and ensuring the append is atomic (read → append → write). Wire this into the orchestrator's completion path (after `synthesizeReport()` or at the end of `run()`). Add a test that verifies the markdown file is correctly written and formatted.

**Task:** implement-1. Each task overall final summary will be appended in tasks/task_history.md and database for UI. tasks/task_history.md content [date] [task filename.md] [project short detail] [status]

**Result:**

## What was accomplished

- **Read existing code and design documents**: Read `tasks/task_history.md`, `blueprint.md`, `solution-design.md`, `src/core/taskHistory.ts`, `src/core/orchestrator.ts`, and `src/test/testPhasePlanning.ts` to understand the current state and Phase 1 design.
- **Updated `src/core/taskHistory.ts`**:
  - Modified `formatMarkdownEntry()` to produce a markdown table row (e.g., `| timestamp | task | summary | iterations | tokens |`) instead of the old `## ` heading format.
  - Updated `appendTaskHistory()` to create `tasks/task_history.md` with a header row and separator row if the file doesn't exist, and to use atomic read→append→write logic.
  - Updated `parseMarkdownEntries()` to parse table rows back into `TaskHistoryEntry` objects.
  - Fixed the row filter to exclude both the separator row (`|---`) and the header row (`| Timestamp |`) when counting existing rows for capping.
- **Updated `tasks/task_history.md`**: Rewrote the file to use the new table format with header and separator rows.
- **Created `src/test/testTaskHistoryMarkdown.ts`**: Wrote a test that verifies:
  - `appendTaskHistory` creates the file with header and a table row.
  - `appendTaskHistory` appends a second row correctly.
  - `readTaskHistory` returns entries from the markdown file.
- **Built the project**: Ran `npm run build` successfully (TypeScript compilation).
- **Ran the test**: Executed the test via `node dist/test/testTaskHistoryMarkdown.js` — the test failed because the row count assertion was off (4 rows instead of 2, due to the header row being counted).

## What was left undone

- **Test does not pass**: The test still fails because the row count assertion in the test expects 2 data rows but gets 4 (header row + separator row + 2 data rows). The test needs to be fixed to exclude the header and separator rows from the count.
- **Orchestrator wiring not verified**: While the orchestrator already calls `appendTaskHistory()` at the end of `run()`, the changes to the markdown format were not explicitly tested end-to-end through the orchestrator.
- **No integration test with orchestrator**: The test only tests `appendTaskHistory` and `readTaskHistory` in isolation, not the full orchestrator completion path.

## Key decisions made

- **Table format over heading format**: Changed from `## ` heading-based entries to a markdown table format (`| ... |`) to make the file more structured and easier to parse.
- **Atomic read→append→write**: Used `fs.readFileSync` → modify content → `fs.writeFileSync` for atomicity, rather than `fs.appendFileSync` which could cause race conditions.
- **Row filter for capping**: When capping the number of entries, the filter excludes both the separator row (`|---`) and the header row (`| Timestamp |`) to only count actual data rows.
- **Fallback parser updated**: Updated `parseMarkdownEntries()` to parse table rows instead of `## ` headings, maintaining backward compatibility for the fallback case when JSONL is missing.

## Blockers encountered

- **Test row count mismatch**: The test expected 2 data rows but got 4 because the header row and separator row were being counted. The test's filter logic (`l.startsWith("| ") && !l.startsWith("|---")`) did not exclude the header row. This was partially addressed by updating the production code's filter, but the test itself still needs to be updated to match.
- **No other blockers encountered**: The build succeeded, and the core logic changes compiled without errors.

**Stats:**
- Tokens: 999,794
- Iterations: 21
