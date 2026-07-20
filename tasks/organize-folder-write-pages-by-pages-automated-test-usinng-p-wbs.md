# WBS: organize folder, write pages by pages automated test usinng paywright 1 test file per page test all scenario, update README, SOLUTION DESIGN

- [x] Phase 1: Folder Organization & Architecture Audit
Analyze the current folder structure, identify the page hierarchy, and document the architecture. Produce an updated `blueprint.md` and `solution-design.md` reflecting the actual page layout and component tree. This phase is pure analysis — no code changes.
- [x] Phase 2: Page Inventory & Test Scaffold
Create a page inventory document (`tasks/page-inventory.md`) listing every page/route, its URL pattern, key interactive elements, and expected states (loading, empty, error, populated). Generate the Playwright test scaffold: one test file per page (`tests/pages/<page-name>.spec.ts`) with empty `describe` blocks for each scenario identified in the inventory.
- [x] Phase 3: Implement Page Tests (Batch 1 — Core Pages)
Write Playwright tests for the core pages (e.g., login, dashboard, main chat). Each test file covers: navigation to the page, rendering of expected elements, interaction with primary controls, and error/empty states. Run the tests against the running dev server to validate they pass or produce meaningful failures.
- [x] Phase 4: Implement Page Tests (Batch 2 — Admin & Secondary Pages)
Write Playwright tests for admin, settings, and any secondary pages. Follow the same pattern as Phase 3. Run full test suite to confirm all tests execute without infrastructure errors (timeouts, missing selectors, etc.).
- [x] Phase 5: Documentation Update & Final Validation
Update `README.md` with test coverage table (page → test file → scenarios covered), test run instructions, and CI integration notes. Update `solution-design.md` with the test architecture (Playwright config, page object pattern if used, test data strategy). Run the full test suite one final time and record results in `tasks/todo.md`.
