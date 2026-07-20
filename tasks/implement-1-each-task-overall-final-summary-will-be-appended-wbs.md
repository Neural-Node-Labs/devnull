# WBS: implement-1. Each task overall final summary will be appended in tasks/task_history.md and database for UI. tasks/task_history.md content [date] [task filename.md] [project short detail] [status]

- [x] Phase 1: Design & Data Model
Design the data model for task history entries, including the schema for `tasks/task_history.md` (markdown format) and the database table (PostgreSQL). Define the interface/type for history entries, the fields to capture (date, task filename, project detail, status, plus any additional metadata like duration, result summary, etc.), and how the UI will consume this data. Produce updated `blueprint.md` and `solution-design.md` sections covering this new feature.
- [x] Phase 2: Task History Markdown Writer
Implement the logic that appends a new entry to `tasks/task_history.md` after each task completes. This includes: creating the file if it doesn't exist (with a header), formatting each entry as a markdown table row, and ensuring the append is atomic (read → append → write). Wire this into the orchestrator's completion path (after `synthesizeReport()` or at the end of `run()`). Add a test that verifies the markdown file is correctly written and formatted.
- [x] Phase 3: Database Persistence Layer
Implement the database store for task history entries. Create a `TaskHistoryStore` class (analogous to `PhaseReportStore`) with `save(entry)` and `list()` methods backed by PostgreSQL. Define the migration SQL to create the `task_history` table. Wire the store into the orchestrator so that on task completion, the entry is also saved to the database. Add unit tests for the store.
- [x] Phase 4: API Endpoints & UI Integration
Add REST API endpoints: `GET /api/v1/task-history` (list all entries) and optionally `POST /api/v1/task-history` (if manual entries are needed). Register these routes in `src/api/routes.ts`. Update the UI to display the task history — either a new page/section or a sidebar widget that fetches and renders the list. Add integration tests for the new endpoints.
- [x] Phase 5: Validation & Documentation
Run the full test suite, verify both persistence paths work end-to-end (markdown file + database), and update documentation (`artifact.md` with any new files, `blueprint.md`/`solution-design.md` with final implementation details). Capture any lessons learned in `tasks/lessons.md`.
