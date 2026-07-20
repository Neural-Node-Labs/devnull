# devnull Test Suite — README_TEST.md

Comprehensive catalog of all tests in the devnull project, organized by category, with instructions for executing each type.

---

## Table of Contents

1. [Test Organization Overview](#test-organization-overview)
2. [Unit Tests (Vitest)](#1-unit-tests-vitest)
3. [Playwright UI Tests](#2-playwright-ui-tests)
4. [Playwright API / E2E Tests](#3-playwright-api--e2e-tests)
5. [Source-Level Smoke / Integration Tests](#4-source-level-smoke--integration-tests)
6. [Test Fixtures & Helpers](#5-test-fixtures--helpers)
7. [How to Execute Tests](#6-how-to-execute-tests)
8. [Test Configuration Files](#7-test-configuration-files)

---

## Test Organization Overview

```
tests/                          # Primary test directory (Vitest + Playwright page tests)
├── vitest.config.ts            # Vitest configuration
├── fixtures/                   # Shared test helpers & mocks
│   ├── mockLlm.ts              # Mock LLM client for orchestrator tests
│   └── testServer.ts           # Test API server helper
├── unit/                       # Unit tests (Vitest, no external deps)
│   ├── auth.test.ts
│   ├── config.test.ts
│   ├── contextCompaction.test.ts
│   ├── duplicateActionDetector.test.ts
│   ├── goalValidator.test.ts
│   ├── ignoreRules.test.ts
│   ├── llmKeyStore.test.ts
│   ├── projectStore.test.ts
│   ├── protocol.test.ts
│   ├── skillRegistry.test.ts
│   ├── stepScorer.test.ts
│   ├── taskHistory.test.ts
│   └── workspaceManager.test.ts
├── pages/                      # Playwright page-level UI tests
│   ├── helpers.ts              # Shared Playwright helpers (login, navigate)
│   ├── admin-page.spec.ts
│   ├── chat-page.spec.ts
│   ├── diagnostics-page.spec.ts
│   ├── home-page.spec.ts
│   ├── login-page.spec.ts
│   ├── plan-detail-page.spec.ts
│   ├── plans-page.spec.ts
│   ├── projects-page.spec.ts
│   ├── settings-page.spec.ts
│   ├── task-history-page.spec.ts
│   └── telemetry-page.spec.ts

e2e/                            # Playwright E2E tests (API + UI)
├── playwright.config.ts        # Playwright config (API tests)
├── deploy-test.spec.ts         # Docker deployment smoke tests
└── plans-ui-test.spec.ts       # Plans page UI tests

ui-test-suited/                 # Back-to-back UI test suite (Playwright)
├── playwright.config.ts        # Playwright config (UI tests, baseURL=localhost:8080)
├── admin.spec.ts
├── api-user-management.spec.ts
├── chat-flow.spec.ts
├── diagnostic.spec.ts
├── health.spec.ts
├── homepage.spec.ts
├── project-management.spec.ts
├── settings.spec.ts
└── telemetry.spec.ts

ui/tests/                       # Additional UI tests
└── plans-page.spec.ts

src/
├── tools/__tests__/            # Tool-level unit tests
│   └── dockerDeploySshTool.test.ts
└── test/                       # Source-level smoke/integration tests (run via ts-node)
    ├── liveSmokeTest.ts
    ├── testApiEndpoints.ts     # (placeholder)
    ├── testApiServer.ts
    ├── testApiTool.ts
    ├── testDeepSeekContract.ts
    ├── testEnhancementSmoke.ts
    ├── testFallbackError.ts
    ├── testGoalValidator.ts
    ├── testIterationStopping.ts
    ├── testLiveDiagnosticsHarness.ts
    ├── testLiveDiagnosticsNegative.ts
    ├── testPhasePlanning.ts
    ├── testRcaIterationLimit.ts
    ├── testReactAuditor.ts
    ├── testReproduceCrashStop.ts
    ├── testTaskHistoryMarkdown.ts
    └── testToolLoop.ts
```

---

## 1. Unit Tests (Vitest)

Pure unit tests with no external dependencies. Located in `tests/unit/` and `src/tools/__tests__/`.

### 1.1 `tests/unit/auth.test.ts`
**Module:** `src/api/auth.ts`
**Tests:** Password hashing/verification, token generation/validation/revocation, login verification, user store management.
- `hashPassword()` — produces salt:hash format, different hashes for same password
- `verifyPassword()` — validates correct, rejects wrong, malformed, empty
- `generateToken()` — UUID format, default user role, admin role, uniqueness
- `validateToken()` — valid token, invalid token, empty string
- `revokeToken()` — removes token, non-existent token
- `verifyLogin()` — success, wrong password, unknown user, case-sensitivity
- `getUserStore / setUserStore` — get/set store

### 1.2 `tests/unit/config.test.ts`
**Module:** `src/config/loadConfig.ts`
**Tests:** YAML config loading, defaults, skill-specific model overrides.
- `loadLlmConfig()` — defaults, reads YAML, overrides
- `resolveModelForSkill()` — base config, skill override, undefined skill, undefined overrides, partial override

### 1.3 `tests/unit/contextCompaction.test.ts`
**Module:** `src/core/contextCompaction.ts`
**Tests:** Context window compaction — collapsing stale `read_tool` observations.
- Collapses earlier read_tool for same file path
- Does not collapse different file paths
- Does not collapse non-read_tool messages
- write_edit_tool triggers stale read collapse
- Collapses all stale reads, not just most recent
- Handles non-JSON content gracefully
- Does not collapse current tool call's observation
- Does not re-collapse already-collapsed messages

### 1.4 `tests/unit/duplicateActionDetector.test.ts`
**Module:** `src/core/duplicateActionDetector.ts`
**Tests:** Detecting repeated tool calls with identical arguments and observations.
- `findDuplicateActions()` — empty for unique calls, flags identical, different observations, triple duplicate, empty list, single call, flags only duplicates
- `stableStringify()` — nested objects, arrays, null/primitives

### 1.5 `tests/unit/goalValidator.test.ts`
**Module:** `src/core/goalValidator.ts`
**Tests:** Building observation transcripts and validating task completion claims.
- `buildObservationTranscript()` — extracts tool messages, empty for no tools, empty array, double newlines
- `validateGoal()` — LLM confirms claim, LLM rejects claim, strips markdown fences, fail-open on unparseable, passes task+observations to LLM

### 1.6 `tests/unit/ignoreRules.test.ts`
**Module:** `src/indexing/ignoreRules.ts`
**Tests:** Loading ignore patterns from `.agentignore`, `.gitignore`, `.dockerignore`.
- `loadIgnoreRules()` — always-ignore patterns, reads from all ignore files, ignores comments/empty lines, deduplicates
- `normalizePattern()` — directory patterns, bare names, files with dots, glob characters, path separators, `**/` prefix, comments

### 1.7 `tests/unit/llmKeyStore.test.ts`
**Module:** `src/api/llmKeyStore.ts`
**Tests:** Storing/reading/clearing LLM API keys in `~/.devnull/llm-key.json`.
- `getStoredApiKey()` — no file, file exists, corrupt JSON, non-string value
- `setStoredApiKey()` — writes file, creates directory, overwrites
- `clearStoredApiKey()` — removes file, no-throw on missing
- `hasStoredApiKey()` — false/true/after-clear

### 1.8 `tests/unit/projectStore.test.ts`
**Module:** `src/api/projectStore.ts`
**Tests:** Project CRUD, active project management, slug generation.
- `addProject()` — creates with slug, rejects duplicate names (case-insensitive), rejects empty, creates workspace dir, unique slugs
- `listProjects()` — all projects, empty array
- `getProject()` — by ID, unknown ID
- `updateProject()` — rename, empty name, duplicate name, unknown project, includeInLlm
- `setActiveProject()` — set active, unknown project
- `deleteProject()` — removes, unknown, promotes another on active delete
- `slugify()` — special chars, spaces/hyphens, all-symbol fallback

### 1.9 `tests/unit/protocol.test.ts`
**Module:** `src/core/protocol.ts`
**Tests:** Loading engineering protocol, lessons, building protocol prompt.
- `loadProtocol()` — no file, reads file, trims whitespace, DEVNULL_HOME fallback
- `loadLessons()` — no file, reads file, no tasks dir
- `recordLesson()` — appends, creates tasks dir, multiple lessons
- `buildProtocolPrompt()` — empty, protocol XML tags, lessons XML tags, both

### 1.10 `tests/unit/skillRegistry.test.ts`
**Module:** `src/core/skillRegistry.ts`
**Tests:** Loading skill headers, full skill content, routing by trigger keywords.
- `loadHeaders()` — no skill dir, parses frontmatter, skips non-SKILL.md, no frontmatter
- `loadSkill()` — full skill, unknown name, not loaded yet
- `route()` — matches triggers, no match, case-insensitive
- `list()` — all headers, empty
- DEVNULL_HOME fallback

### 1.11 `tests/unit/stepScorer.test.ts`
**Module:** `src/core/stepScorer.ts`
**Tests:** Scoring individual tool calls and computing rolling health average.
- `scoreStep()` — baseline 70, error penalty (-45), duplicate penalty (-35), same tool+diff obs, write_edit bonus (+10), run_command bonus (+10), no bonus for other tools, clamped 0-100
- `rollingHealth()` — empty state (100), averages last N, default window 5, only last N, rounds to integer

### 1.12 `tests/unit/taskHistory.test.ts`
**Module:** `src/core/taskHistory.ts`
**Tests:** Appending/reading/searching task history with JSONL and Markdown.
- `appendTaskHistory()` — writes JSONL+MD, creates dirs, appends multiple
- `readTaskHistory()` — reads back, empty, limit, corrupt lines
- `searchTaskHistory()` — keyword in description, in summary, no match, case-insensitive, limit
- MAX_ENTRIES cap at 200

### 1.13 `tests/unit/workspaceManager.test.ts`
**Module:** `src/core/workspaceManager.ts`
**Tests:** Preparing workspace-agent directories with file copying and exclusion.
- `prepareWorkspace()` — creates dir, copies files, excludes EXCLUDED dirs, excludes workspace-agent itself, nested dirs, idempotent
- EXCLUDED set — contains expected paths, does not exclude src or tests

### 1.14 `src/tools/__tests__/dockerDeploySshTool.test.ts`
**Module:** `src/tools/dockerDeploySshTool.ts`
**Tests:** Pure functions of the Docker deploy SSH tool.
- `buildDockerCommand()` — defaults, custom command, pullFromRegistry, composeFile, combinations
- `buildRollbackSnapshotCommand()` — correct snapshot command
- `buildRollbackRestoreCommand()` — correct restore command
- `buildHealthCheckCommand()` — with/without composeFile
- `buildPreCheckCommand()` — correct pre-check command
- `parseServiceStatuses()` — all healthy, one unhealthy, empty, malformed lines
- `allServicesHealthy()` — all healthy, one unhealthy, empty

---

## 2. Playwright UI Tests

Page-level UI tests using Playwright. Located in `tests/pages/`, `ui-test-suited/`, and `ui/tests/`.

### 2.1 `tests/pages/` — Comprehensive Page Tests

These are detailed Playwright tests for each UI page, covering rendering, interactions, error states, and accessibility.

#### `tests/pages/admin-page.spec.ts`
**Page:** `/admin`
**Tests:** Admin panel — user management, add/edit/delete users, role selector, inline edit, success/error messages, non-admin access restriction, console errors.
- 17 tests covering: rendering, user management section, Add User button, form open/close/cancel, role selector options, user table columns, user display, Edit/Delete buttons, inline edit mode, cancel edit, success message, empty username error, non-admin restriction, no console errors

#### `tests/pages/chat-page.spec.ts`
**Page:** `/chat`
**Tests:** Chat interface — message input, send button, plan mode selector, voice/upload/options buttons, advanced settings toggle, new chat button, accessibility, message sending, thinking indicator, cancel request, Enter/Shift+Enter behavior.
- 20 tests covering: rendering, empty state, input field, send button, typing enables send, plan mode selector, all three plan options, voice/upload/options buttons, advanced settings toggle (show/hide), new chat button, accessibility role='log', sending messages, thinking indicator, cancel abort, Enter sends, Shift+Enter newline

#### `tests/pages/diagnostics-page.spec.ts`
**Page:** `/diagnostics`
**Tests:** Diagnostics page — auto-run tests on mount, pass/fail indicators, skills section, directives section, re-run tests, skill role badges, console errors.
- 12 tests covering: rendering, Run tests button, test results section, auto-run on mount, pass/fail status, loaded skills section, skills list/empty state, directives section, directives loaded status, re-run tests, skill role badges, no console errors

#### `tests/pages/home-page.spec.ts`
**Page:** `/`
**Tests:** Dashboard — welcome message, navigation cards, card link routes, click navigation, health info badges, uptime, console errors, navbar, username.
- 9 tests covering: welcome message, navigation cards, correct routes, click navigation, health badges, uptime badge, no console errors, navbar, username

#### `tests/pages/login-page.spec.ts`
**Page:** `/login`
**Tests:** Login/register — form rendering, loading state, empty field errors, short password validation, redirect if authenticated, invalid credentials, accessible labels, autocomplete, auto-focus.
- 9 tests covering: rendering, loading state, empty username/password error, short password (register), redirect if authenticated, invalid credentials error, accessible form labels, autocomplete attribute, auto-focus

#### `tests/pages/plan-detail-page.spec.ts`
**Page:** `/plans/:id`
**Tests:** Plan detail — loading state, error state, Back button, plan content, tasks section, empty tasks, add task input, console errors.
- 9 tests covering: loading state (valid ID), error state (invalid ID), Back button, Back navigation, plan content section, tasks section, empty tasks state, add task input, no console errors

#### `tests/pages/plans-page.spec.ts`
**Page:** `/plans`
**Tests:** Plans list — rendering, loading state, empty state, Refresh button, click-to-reload, error state, console errors.
- 7 tests covering: rendering, loading state, empty state, Refresh button, click reloads, error state, no console errors

#### `tests/pages/projects-page.spec.ts`
**Page:** `/projects`
**Tests:** Project management — rendering, loading state, empty state with CTA, New project button, add form (slug preview, validation, create), workspace file browser, active indicator, error state.
- 9+ tests covering: rendering, loading state, empty state, New project button, add form, slug preview, validation, create, workspace browser, active indicator, error state

#### `tests/pages/settings-page.spec.ts`
**Page:** `/settings`
**Tests:** Settings — theme selector, user management, add/edit/delete users, change password, LLM key management.
- 12+ tests covering: title, theme selector, user management section, add user button, add user flow, update user, delete user, change password section, password fields, LLM key section, LLM key input, theme selection

#### `tests/pages/task-history-page.spec.ts`
**Page:** `/task-history`
**Tests:** Task history — rendering, loading state, empty state, task list, search/filter, task details, error state, console errors.
- 8+ tests covering: rendering, loading state, empty state, task list display, search/filter, task details, error state, no console errors

#### `tests/pages/telemetry-page.spec.ts`
**Page:** `/telemetry`
**Tests:** Telemetry — log viewer, search input, task ID filter, ReAct trace, command execution, token usage, log type selector, refresh button, empty state.
- 11+ tests covering: title, search input, task ID filter, ReAct entries, command execution, token usage, search filter, log type selector, refresh button, description, empty state

### 2.2 `ui-test-suited/` — Back-to-Back UI Test Suite

A comprehensive Playwright test suite that runs against `http://localhost:8080`.

#### `ui-test-suited/admin.spec.ts`
**Tests:** Admin panel — page accessibility, user management, add/edit/delete users, user table, description.
- 8 tests

#### `ui-test-suited/api-user-management.spec.ts`
**Tests:** API user management endpoints — CRUD, duplicate rejection, missing field validation, role updates, last-admin protection.
- 7 tests

#### `ui-test-suited/chat-flow.spec.ts`
**Tests:** Chat flow — message input, send button, voice/upload buttons, chat history, plan mode selector, options toggle, new chat button, empty state.
- 10 tests

#### `ui-test-suited/diagnostic.spec.ts`
**Tests:** Diagnostics page — title, test results/skills/directives sections, run tests button, pass/fail indicators, description, directives loaded status.
- 9 tests

#### `ui-test-suited/health.spec.ts`
**Tests:** API health & skills — health endpoint, skills count, chat validation, telemetry endpoints, 404 handling.
- 7 tests

#### `ui-test-suited/homepage.spec.ts`
**Tests:** Homepage — title, root div, JS/CSS assets, navbar, console errors, welcome message, navigation cards, API health info.
- 8 tests

#### `ui-test-suited/project-management.spec.ts`
**Tests:** Project management — title, description, new project button, create project, select active, workspace browser, file download, delete, rename, empty state.
- 11 tests

#### `ui-test-suited/settings.spec.ts`
**Tests:** Settings — title, theme selector, user management, add/edit/delete users, change password, LLM key management.
- 12 tests

#### `ui-test-suited/telemetry.spec.ts`
**Tests:** Telemetry — title, search input, task ID filter, ReAct trace, command execution, token usage, log type selector, refresh button, description, empty state.
- 11 tests

### 2.3 `ui/tests/plans-page.spec.ts`
**Tests:** Plans page UI — rendering, empty state, error state, layout elements, navbar navigation, API endpoint validation.
- 6 tests

### 2.4 `tests/pages/helpers.ts`
**Shared Playwright helpers:**
- `loginAsAdmin(page)` — logs in via UI form
- `navigateTo(page, path)` — navigates and waits for network idle
- `registerFirstUser(page)` — registers first admin user if none exist

---

## 3. Playwright API / E2E Tests

End-to-end tests that validate the full stack (API + UI) running in Docker. Located in `e2e/`.

### 3.1 `e2e/deploy-test.spec.ts`
**Config:** `e2e/playwright.config.ts` (baseURL: `http://localhost:3001`)
**Tests:** Docker deployment smoke tests — API health, skills, chat validation, telemetry, 404 handling, UI loading.
- **API tests (project: "api"):**
  - `GET /api/v1/health` returns 200 with status ok
  - `GET /api/v1/skills` returns 13 skills
  - `POST /api/v1/chat` with empty task returns 400
  - `POST /api/v1/chat` with missing task returns 400
  - `GET /api/v1/telemetry` returns empty entries
  - `GET /api/v1/telemetry` with invalid log param returns 400
  - `GET unknown route` returns 404
- **UI tests:**
  - UI homepage loads and contains expected title
  - UI page has a root div for React mount
  - UI loads JS and CSS assets

### 3.2 `e2e/plans-ui-test.spec.ts`
**Config:** `e2e/playwright.config.ts`
**Tests:** Plans page UI — login via API, empty state, error state, layout elements, navbar navigation, API endpoint validation.
- Plans page loads and shows empty state
- Plans page shows error state when API fails
- Plans page has correct layout elements
- Can navigate to plans page via navbar
- API `/api/v1/plans` endpoint returns valid response
- API `/api/v1/plans` endpoint works without auth (public route)

---

## 4. Source-Level Smoke / Integration Tests

Located in `src/test/`. These are standalone TypeScript files that test specific subsystems or integration scenarios. They are **not** part of the Vitest or Playwright test runner — they are executed directly via `ts-node` or `npx tsx`.

### 4.1 `src/test/liveSmokeTest.ts`
**Tests:** Live smoke test against the real DeepSeek API. Tests basic completion, tool calling, and the full orchestrator loop (including goal validator) against a live API key.
**Run:** `npx tsx src/test/liveSmokeTest.ts`

### 4.2 `src/test/testApiEndpoints.ts`
**Status:** Placeholder (contains only `// placeholder`)

### 4.3 `src/test/testApiServer.ts`
**Tests:** API server endpoints — health, chat, telemetry, skills, 404, register, login, auth, user count. Starts a real Express server on a fixed port.
**Test functions:** `testHealthEndpoint`, `testChatEndpointValidation`, `testTelemetryEndpoint`, `testSkillsEndpoint`, `test404`, `testRegisterEndpoint`, `testLoginEndpoint`, `testAuth`, `testUserCountEndpoint`
**Run:** `npx tsx src/test/testApiServer.ts`

### 4.4 `src/test/testApiTool.ts`
**Tests:** Quick smoke test for the `apiTestTool`. Starts a local Express server and tests GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, custom headers, `expectStatus`/`expectBodyContains` assertions, and error endpoints.
**Run:** `npx tsx src/test/testApiTool.ts`

### 4.5 `src/test/testDeepSeekContract.ts`
**Tests:** DeepSeek request-body contract — non-thinking mode sends `thinking:disabled` + temperature, thinking mode omits temperature/top_p and sends `reasoning_effort`, `response_format` passthrough for JSON mode, `reasoning_content` preservation across messages.
**Test functions:** `testNonThinkingModeSendsTemperatureAndExplicitDisabled`, `testThinkingModeOmitsTemperatureAndSendsReasoningEffort`, `testResponseFormatPassthroughForJsonMode`, `testReasoningContentIsPreservedAcrossMessages`
**Run:** `npx tsx src/test/testDeepSeekContract.ts`

### 4.6 `src/test/testEnhancementSmoke.ts`
**Tests:** Smoke test for the `requirement_001.md` enhancement. Verifies that all new modules (FileTelemetry log rotation, PostgresTelemetry, PostgresTaskHistory, PostgresProjectStore, PlanStore) load, instantiate, and handle errors gracefully without PostgreSQL. Also verifies tool schemas, tool dispatcher handlers, API routes, and UI components exist.
**Run:** `npx tsx src/test/testEnhancementSmoke.ts`

### 4.7 `src/test/testFallbackError.ts`
**Tests:** Verifies that the fallback error message surfaces the actual (primary) failure reason first (e.g., "Primary LLM call failed: missing DEEPSEEK_API_KEY") rather than burying it behind "Fallback provider X missing Y".
**Run:** `npx tsx src/test/testFallbackError.ts`

### 4.8 `src/test/testGoalValidator.ts`
**Tests:** Independent goal validator — catches unsupported claims, accepts genuinely supported claims, exhausts retries on persistent hallucination. Uses a mock with real (not scripted) skepticism logic.
**Test functions:** `testCatchesUnsupportedClaim`, `testAcceptsSupportedClaim`, `testExhaustsRetriesAndSurfacesGiveUp`
**Run:** `npx tsx src/test/testGoalValidator.ts`

### 4.9 `src/test/testIterationStopping.ts`
**Tests:** Orchestrator iteration-stopping behavior — stops immediately with no tool calls, stops exactly when `toolCalls.length === 0`, does NOT stop prematurely on tool success, iteration maxout is bounded, subagents stop without prompting.
**Test functions:** `testStopsImmediatelyWithNoToolCalls`, `testStopsExactlyWhenObjectiveAchieved`, `testDoesNotStopPrematurelyOnToolSuccess`, `testIterationMaxoutIsBounded`, `testSubagentStopsWithoutPrompting`
**Run:** `npx tsx src/test/testIterationStopping.ts`

### 4.10 `src/test/testLiveDiagnosticsHarness.ts`
**Tests:** Full live-diagnostics harness against a well-behaved (scripted) mock agent. Tests all 7 diagnostic scenarios (iteration-stop, restart-approval, no wasteful duplicates, tools+skills used, ground-up deployable app, bug-fixing, full SDLC) and asserts all pass.
**Run:** `npx tsx src/test/testLiveDiagnosticsHarness.ts`

### 4.11 `src/test/testLiveDiagnosticsNegative.ts`
**Tests:** Negative test for the live-diagnostics harness. Uses a mixed mock that is well-behaved for diagnostics 1, 2, 4, 6, 7 but deliberately bad for diagnostics 3 (wasteful duplicate command) and 5 (broken server). Asserts that 3 and 5 correctly FAIL while 1 and 2 still PASS.
**Run:** `npx tsx src/test/testLiveDiagnosticsNegative.ts`

### 4.12 `src/test/testPhasePlanning.ts`
**Tests:** Phase planning feature — off by default, generates phases when enabled, falls back to single phase when no parseable phases are returned, auto-approves phases in non-interactive mode.
**Test functions:** `testPhasePlanningOffByDefault`, `testPhasePlanningOnGeneratesPhases`, `testPhasePlanningFallbackSinglePhase`, `testPhasePlanningNonInteractiveAutoApproves`
**Run:** `npx tsx src/test/testPhasePlanning.ts`

### 4.13 `src/test/testRcaIterationLimit.ts`
**Tests:** Orchestrator behavior on iteration limit — API default returns fallback message, `continueOnLimit=true` allows completion past the limit, partial results preserved on limit.
**Test functions:** `testApiDefaultReturnsFallbackMessage`, `testContinueOnLimitAllowsCompletion`, `testPartialResultPreservedOnLimit`
**Run:** `npx tsx src/test/testRcaIterationLimit.ts`

### 4.14 `src/test/testReactAuditor.ts`
**Tests:** ReAct loop auditor — well-behaved agent passes all 4 scenarios with 0 invariant violations; poorly-behaved agent catches NO_SEARCH_BEFORE_EDIT, skipped validation, and genuinely wrong fix.
**Run:** `npx tsx src/test/testReactAuditor.ts`

### 4.15 `src/test/testReproduceCrashStop.ts`
**Tests:** Reproduction test for orchestrator stopping without a summary report — main loop iteration limit with `synthesizeReport()`, phase planning fallback, subagent iteration limit.
**Test functions:** `testMainLoopSynthesizesReport`, `testPhasePlanningFallbackNoReport`, `testSubagentIterationLimit`
**Run:** `npx tsx src/test/testReproduceCrashStop.ts`

### 4.16 `src/test/testTaskHistoryMarkdown.ts`
**Tests:** Markdown-based task history — creates file with header, prepends multiple entries (newest first), caps at 50 entries, escapes pipe characters, shows "-" for missing tokens, reads back from markdown, atomic write integrity.
**Test functions:** `testCreatesFileWithHeader`, `testMultipleEntriesPrepend`, `testCapsAtMaxEntries`, `testEscapesPipeCharacters`, `testNoTokensShowsDash`, `testReadTaskHistoryFromMarkdown`, `testAtomicWrite`
**Run:** `npx tsx src/test/testTaskHistoryMarkdown.ts`

### 4.17 `src/test/testToolLoop.ts`
**Tests:** Simulates a realistic multi-turn tool-calling session (glob → read → write_edit → run_command → final text). Verifies the edit was applied, all 4 tool calls logged to `thinking.log`, and correct number of LLM calls.
**Run:** `npx tsx src/test/testToolLoop.ts`

---

## 5. Test Fixtures & Helpers

Shared utilities used by the test suites.

### 5.1 `tests/fixtures/mockLlm.ts`
**Used by:** Unit tests in `tests/unit/`
**Provides:**
- `MockLlmClient` — scripted mock LLM that returns pre-programmed responses, tracks all messages seen
- `WorkerAndRealValidatorMock` — mock LLM that applies real (not scripted) validation logic for goal validator testing
- `MockTelemetry` — mock telemetry implementation for testing
- Helper functions: `toolCall()`, `mockUsage()`

### 5.2 `tests/fixtures/testServer.ts`
**Used by:** Unit tests in `tests/unit/`
**Provides:**
- `startTestServer(port)` — starts a real Express server on a specified port (default 18991)
- `fetchJson(url, opts)` — makes HTTP requests and returns parsed responses
- `registerTestUser(baseUrl, username, password)` — registers a test user and returns auth token

### 5.3 `tests/pages/helpers.ts`
**Used by:** Playwright page tests in `tests/pages/`
**Provides:**
- `loginAsAdmin(page)` — logs in via UI form
- `navigateTo(page, path)` — navigates and waits for network idle
- `registerFirstUser(page)` — registers first admin user if none exist
