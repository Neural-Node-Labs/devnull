# devnull — Solution Design

## 1. Purpose

devnull is a ReAct CLI agent with hot-pluggable role skills (Programmer, Architect, Tester,
DevOps, SecOps, Kubernetes Expert, Docker Expert, Performance Tester, Pentester, RCA, Analyst,
Filesystem Management, Playwright UI Tester). It runs against DeepSeek by default, executes
real tools against the local workspace and remote systems (SSH, GitHub, Docker deploy,
Playwright), and operates under a standing engineering protocol (`agent/devnull.md`) covering
plan mode, subagent delegation, self-improvement, and verification-before-done.

## 2. Business Logic / Core Loop

devnull implements ReAct (Reason + Act) in three phases:

```
Search      Thought -> Action(glob/grep/read)              -> Observation
Action      Thought -> Action(write/edit/ssh/deploy/...)    -> Observation
Validation  Thought -> Action(run_command/playwright_run)   -> Observation -> decide
```

On top of the base loop:

- **Plan Mode** — triggers when 2+ skills route to a task; writes `tasks/todo.md`, requires
  explicit user confirmation before any tool call fires.
- **Goal Validator** — before accepting a "done" turn (zero tool calls), an independent
  second LLM call audits the claim against the actual recorded observations. Rejected claims
  loop back with the reason; persistent failures surface honestly rather than looping forever
  or faking success.
- **Subagent delegation** — `subagent_tool` spins a fresh, isolated orchestrator instance;
  only its final summary crosses back into the parent's context.
- **Iteration maxout** — on hitting the iteration ceiling, asks whether to continue (resets
  the counter if approved); the approval hook is injectable (`onIterationLimitReached`) so
  automation/diagnostics can drive it without a TTY.

## 3. Technology Stack

| Concern | Choice | Why |
|---|---|---|
| Language/runtime | TypeScript on Node.js 20 | Single language across CLI, tools, and orchestration; ESM throughout |
| CLI framework | `commander` | Minimal, standard argument parsing |
| LLM backend | DeepSeek (`deepseek-v4-flash`/`deepseek-v4-pro`), OpenAI-compatible function calling | Default per project requirement; thinking mode + `reasoning_effort` for deep-reasoning skills |
| LLM fallback | Anthropic (`claude-sonnet-5`) | Used only if DeepSeek is unreachable/unset |
| File search | `fast-glob` | Glob/grep primitives respecting `.agentignore`/`.gitignore`/`.dockerignore` |
| YAML/HTML parsing | `js-yaml`, `cheerio` | Skill frontmatter parsing; URL-crawl-to-Playwright-spec generation |
| Container | Docker (multi-stage, `node:20-alpine`) | Minimal runtime image, non-root user |

## 4. Component Architecture

```
                        +----------------------+
                        |   CLI (src/cli)      |  --task / --chat / --index / --skills /
                        |                      |  --lesson / --audit-react / --diagnose-live
                        +----------+-----------+
                                   |
                        +----------v-----------+
                        |  ReActOrchestrator    |<---- agent/devnull.md (protocol, XML-tagged)
                        |  (core/orchestrator)  |<---- tasks/lessons.md (self-improvement loop)
                        +--+--------+--------+--+
                           |        |        |
              +------------v+ +-----v----+ +-v-------------+
              | SkillRegistry| |GoalValid | | Subagent       |
              | (hot-plug,   | |ator      | | (fresh         |
              | DEVNULL_HOME | |(2nd LLM  | | orchestrator,  |
              | fallback)    | | call)    | | isolated ctx)  |
              +------+-------+ +----------+ +----------------+
                     |
        +------------v----------------------------------+
        |      12 tool schemas -> toolDispatcher          |
        |  glob/grep/read/write_edit/run_command/ssh/     |
        |  schedule_task/playwright_run/crawl_and_        |
        |  generate_playwright_test/github/docker_deploy_ |
        |  ssh/subagent                                   |
        +------------+-------------------------------------+
                     |
        +------------v----------------------------------+
        |  LlmClient (DeepSeekClient, real function       |
        |  calling, thinking-mode-aware) -> FileTelemetry  |
        |  (.log/thinking.log, llm.log, sys.log)           |
        +--------------------------------------------------+
```

## 5. CLI Layer

The CLI entry point is `src/cli/index.ts`, built with `commander`. It provides the following
commands and options:

| Option | Description |
|---|---|
| `--task <description>` | Execute a single task through the ReAct orchestrator |
| `--chat` | Enter interactive chat mode (workspace = current folder) |
| `--index` | Index the current workspace into `.agent/index/` |
| `--skills` | List all loaded skills and their trigger keywords |
| `--lesson <text>` | Record a lesson to `tasks/lessons.md` (self-improvement loop) |
| `--plan` / `--no-plan` | Force Plan Mode on/off, overriding the task-complexity heuristic |
| `--audit-react` | Run the built-in bug-fixing scenario battery through the real orchestrator |
| `--audit-out <path>` | Custom output path for the audit report (default: `reports/react-audit-<timestamp>.md`) |
| `--diagnose-live` | Run the 7-point ReAct diagnostic suite against the real configured LLM |
| `--diagnose-out <path>` | Custom output path for the diagnostics report (default: `reports/live-diagnostics-<timestamp>.md`) |
| `--serve` | Start the devnull HTTP API server |
| `--port <number>` | Port for the API server (default: 3001) |
| `--host <address>` | Host for the API server (default: 0.0.0.0) |

The CLI instantiates `DeepSeekClient`, `FileTelemetry`, and `ReActOrchestrator` for task
execution, or delegates to specialized handlers for `--audit-react`, `--diagnose-live`,
`--serve`, and other modes.

## 6. Core Components

Beyond the base ReAct loop, the core module (`src/core/`) contains several specialized
components:

| Component | File | Purpose |
|---|---|---|
| `ReActOrchestrator` | `src/core/orchestrator.ts` | Three-phase loop: Search → Action → Validation; manages plan mode, subagent delegation, iteration ceiling, and goal validation |
| `SkillRegistry` | `src/core/skillRegistry.ts` | Hot-plug skill loader; scans `agent/skills/` for `SKILL.md` files, parses YAML frontmatter, routes by trigger keywords; falls back to `DEVNULL_HOME` |
| `Protocol` | `src/core/protocol.ts` | Loads `agent/devnull.md` (engineering protocol) and `tasks/lessons.md` (self-improvement) into the system prompt wrapped in XML tags |
| `GoalValidator` | `src/core/goalValidator.ts` | Independent second-LLM-call audit that checks whether a "done" claim is actually supported by recorded observations; rejects unsupported claims back into the loop |
| `DuplicateActionDetector` | `src/core/duplicateActionDetector.ts` | Flags wasteful exact-repeat tool calls that produce identical observations (does not flag legitimate re-runs after edits) |
| `ReactAuditor` | `src/core/reactAuditor.ts` | Runs a battery of bug-fixing scenarios through the real orchestrator and reports pass/fail + invariant violations |
| `LiveDiagnostics` | `src/core/liveDiagnostics.ts` | 7-point diagnostic suite: iteration stopping, restart-approval, duplicate-action avoidance, tool/skill usage, ground-up deployable app, bug fixing, full SDLC |
| `ServerHealthCheck` | `src/core/serverHealthCheck.ts` | Helper that starts a server process, polls a health endpoint, and reports whether it genuinely responds |
| `Types` | `src/core/types.ts` | Shared TypeScript types: `SkillHeader`, `ReActStep`, `LlmClient`, `OrchestratorOptions`, etc. |

### 6.1 Skill Routing

Each `SKILL.md` has a YAML frontmatter header with `triggers` (keywords) and `composes_with`
(other skills it pairs with). `SkillRegistry.route()` scores every skill by trigger-keyword
match against the task text, then the orchestrator loads the top skill **plus** everything in
its `composes_with` list — so "deploy this to kubernetes with helm and set up ci/cd" loads
both `devops` and `kubernetes-expert` automatically.

### 6.2 Goal Validator

The goal validator is a real runtime guard, not just a test fixture. Whenever the ReAct loop
is about to accept a "done" turn (zero tool calls), a **second, independent LLM call** — no
tools, no shared conversation history, only the task + the raw recorded tool observations +
the claimed answer — audits whether the claim is actually supported. If not, the claim is
rejected back into the loop with the reason, and the agent gets up to `maxValidatorRetries`
(default 2) chances before the run gives up and surfaces the unresolved discrepancy in
`sys.log` rather than silently accepting it or looping forever.

### 6.3 Duplicate Action Detection

`DuplicateActionDetector` analyzes the full tool-call trace for any exact `(tool, arguments)`
pair that was called more than once **and** produced an identical observation every time.
It deliberately does **not** flag a legitimate re-run (e.g. re-running tests after a real
edit, where the observation genuinely changes) — only flags a repeat that gained zero new
information.

## 7. Tools

The tool system (`src/tools/`) provides 12 tool schemas that are sent to the LLM via
OpenAI-compatible function calling. Each tool is implemented in its own file and dispatched
by `ToolDispatcher`.

| Tool | File | Purpose |
|---|---|---|
| `glob_tool` | `src/tools/globTool.ts` | Find files matching a glob pattern, respecting ignore rules |
| `grep_tool` | `src/tools/grepTool.ts` | Search file contents by regex across the workspace |
| `read_tool` | `src/tools/readTool.ts` | Read the full contents of a file |
| `write_edit_tool` | `src/tools/writeEditTool.ts` | Write a new file or perform an exact-match string replace |
| `run_command_tool` | `src/tools/runCommandTool.ts` | Execute a shell command (tests, linter, kubectl, docker build, repro steps) |
| `ssh_tool` | `src/tools/sshTool.ts` | Run a command on a remote host, or upload/download via scp |
| `schedule_task_tool` | `src/tools/scheduleTool.ts` | Recurring (OS cron) or one-off (delayed, detached) task scheduling |
| `playwright_run_tool` | `src/tools/playwrightTool.ts` | Run a Playwright spec via `npx playwright test`, returns pass/fail summary |
| `crawl_and_generate_playwright_test_tool` | `src/tools/crawlPlaywrightTool.ts` | Fetch a URL, extract links/buttons/forms, write a Playwright test skeleton |
| `github_tool` | `src/tools/githubTool.ts` | clone/fetch/pull/status/commit/push, using `GITHUB_TOKEN` for HTTPS auth |
| `docker_deploy_ssh_tool` | `src/tools/dockerDeploySshTool.ts` | Enhanced remote Docker deploy: pre-deploy validation (docker version, disk space), rollback snapshot/restore, health verification (polls until all services healthy), compose file selection, registry pull mode, env file shipping, detailed deploy report with per-service status |
| `subagent_tool` | `src/tools/subagentTool.ts` | Delegate a focused task to a fresh, isolated sub-orchestrator; only its final summary returns |

Tool schema names use `snake_case` with a `_tool` suffix to match OpenAI/DeepSeek function-
calling convention and stay visually distinct from internal TS function names.

## 8. LLM Client & Telemetry

### 8.1 DeepSeek Client

`src/llm/deepseekClient.ts` implements the `LlmClient` interface with OpenAI-compatible
function calling, optimized for DeepSeek's documented behavior:

- **Thinking mode** — `temperature`/`top_p` are omitted when thinking is enabled (DeepSeek
  docs state they have no effect in thinking mode). The `thinking` field is always sent
  explicitly (`{"type": "enabled"}` or `{"type": "disabled"}`).
- **`reasoning_effort`** — wired in as the actual lever for thinking-mode depth. RCA and
  Architect get `"high"`; Pentester gets `"max"` for security-critical reasoning.
- **Default temperature** — set to `0.0`, matching DeepSeek's published guidance for
  code/math tasks.
- **Goal validator** — uses `response_format: {"type": "json_object"}` for structured JSON
  output.
- **`reasoning_content` continuity** — correctly carried on all prior assistant messages
  still in history, as required by DeepSeek's docs once tool calls have occurred.

### 8.2 Mock Client

`src/llm/mockClient.ts` provides scripted responses for testing without an API key. Used by
all unit test suites to verify orchestrator behavior deterministically.

### 8.3 Configuration

`src/config/loadConfig.ts` loads `agent/config/llm.yaml` (model selection, per-skill
reasoning overrides, Anthropic fallback) and merges with `.env` environment variables.
Falls back to `DEVNULL_HOME` when the workspace doesn't have its own `agent/` directory.

### 8.4 Telemetry

`src/telemetry/logger.ts` implements `FileTelemetry`, which writes three log files to
`.log/` in the workspace:

| Log File | Contents |
|---|---|
| `.log/thinking.log` | Every Thought/Action/Observation from the ReAct loop |
| `.log/llm.log` | Raw LLM request/response pairs |
| `.log/sys.log` | System-level events (errors, warnings, goal validator verdicts) |

## 9. Indexing

`src/indexing/` provides workspace indexing for the LLM to reference:

| Component | File | Purpose |
|---|---|---|
| `Indexer` | `src/indexing/indexer.ts` | Builds `.agent/index/index.json` with file metadata and chunked content dumps |
| `IgnoreRules` | `src/indexing/ignoreRules.ts` | Merges `.agentignore`, `.gitignore`, and `.dockerignore` rules for consistent file filtering |

## 10. UI Layer

The UI is defined in `ui.md` and is designed as a React/TypeScript frontend that consumes
the devnull HTTP API. The `docker-compose.yml` includes a `ui` service that builds from
`./ui/Dockerfile` and serves on port 8080.

### 10.1 UI Pages

| Page | Features |
|---|---|
| **Chat** | Voice input/listen, file upload to current project workspace, message history |
| **Project Selection** | Project CRUD (add/update/delete/select active), workspace browser (list/delete/download zip), LLM context toggle per project |
| **Settings** | User CRUD (add/update/delete), password change, LLM API key management |
| **Telemetry** | Searchable logs, reason-action-observation display, command execution history, token usage |
| **Admin** | Admin user created at first login, user management for admin role, admin-only visibility |
| **Diagnostic** | Testing ReAct loop, testing tools/skills/directives, run test button, pass/fail results |

### 10.2 UI Service (Docker)

```yaml
ui:
  build:
    context: ./ui
    dockerfile: Dockerfile
  image: devnull-ui:latest
  ports:
    - "8080:80"
  environment:
    - API_HOST=api
    - API_PORT=3001
  depends_on:
    api:
      condition: service_healthy
```

The UI service depends on the API service being healthy, uses the `serve` profile, and has
resource limits configured (0.5 CPU, 256MB memory limit).

## 11. Sequence: `devnull --task "fix the bug in X"`

```
User -> CLI: --task "fix the bug in X"
CLI -> Orchestrator: run(task)
Orchestrator -> SkillRegistry: route(task)          # e.g. [programmer]
alt 2+ skills routed
  Orchestrator -> LLM: plan (no tools)
  Orchestrator -> User: show plan, confirm?
  User -> Orchestrator: yes/no
end
loop until done or iteration ceiling
  Orchestrator -> LLM: messages + tool schemas
  LLM -> Orchestrator: tool_calls[] | final content
  alt tool_calls present
    Orchestrator -> ToolDispatcher: execute each call
    ToolDispatcher -> Orchestrator: real Observation
    Orchestrator -> Telemetry: log Thought/Action/Observation
  else zero tool_calls (candidate completion)
    Orchestrator -> GoalValidator: audit claim vs observations
    alt validator rejects
      Orchestrator -> LLM: "VALIDATION FAILED: <reason>" (loop continues)
    else validator accepts (or retries exhausted)
      Orchestrator -> User: final result
    end
  end
end
```

## 12. Naming & Coding Conventions

- Files: `camelCase.ts` for modules, `PascalCase` for classes, one primary export concept per
  tool file (`sshTool.ts`, `githubTool.ts`, etc).
- Tool schema names: `snake_case` with a `_tool` suffix (`run_command_tool`, `ssh_tool`) to
  match OpenAI/DeepSeek function-calling convention and stay visually distinct from internal
  TS function names.
- Skills: directory name = frontmatter `name` field = lowercase-hyphenated (`docker-expert`,
  `playwright-ui-tester`).
- Every skill file: YAML frontmatter (`name`, `role`, `description`, `triggers`,
  `requires_tools`, `composes_with`) + fixed section order (Process, Strategies, Planning
  Approach, Instructions, Experience, Output Artifacts) -- enforced by convention, not schema
  validation (see Section 8, known gaps).
- Tests: `src/test/test<Subject>.ts`, always runnable standalone via
  `node dist/test/test<Subject>.js [args]`, always printing explicit `PASS:`/`FAIL` lines.

## 13. Deployment (Docker)

Multi-stage build: `builder` stage (`node:20-alpine` + full devDependencies) compiles
TypeScript; `runtime` stage (`node:20-alpine`, production deps only via `npm ci --omit=dev`,
non-root `devnull` user) runs the compiled CLI. `git`/`openssh-client`/`bash`/`dcron` are
installed in the runtime image since `githubTool`, `sshTool`, and `scheduleTool` shell out to
those system binaries directly rather than reimplementing protocols in JS.

`DEVNULL_HOME=/opt/devnull` is set in the image so `SkillRegistry`, `loadProtocol`, and
`loadLlmConfig` all fall back to the image's built-in `agent/` directory when the *mounted
workspace* doesn't have its own -- verified: a completely empty workspace still resolves all
13 skills via this fallback. A project can still override any of it by shipping its own
`agent/skills/`, `agent/devnull.md`, or `agent/config/llm.yaml`, which always take precedence.

```bash
docker build -t devnull:latest .
docker run --rm -it -v "$PWD":/workspace --env-file .env devnull:latest --task "..."
# or: docker compose run --rm devnull --task "..."
```

## 14. API Layer (HTTP)

devnull exposes an HTTP API for programmatic access, enabling a future React/TypeScript UI
(see `ui.md`). The API is served via Express on a configurable port.

### 14.1 Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/login` | Login with admin credentials, returns Bearer token | None |
| `GET` | `/api/v1/health` | Health check (status, version, uptime) | Bearer token |
| `POST` | `/api/v1/chat` | Execute a task through the ReAct orchestrator | Bearer token |
| `GET` | `/api/v1/telemetry` | Retrieve telemetry logs (thinking/llm/sys) | Bearer token |
| `GET` | `/api/v1/skills` | List all loaded skills with triggers | Bearer token |

### 14.2 Authentication

The API uses a **login-based token authentication** system:

1. **Login mode (default):** When `ADMIN_PASSWORD` is set, clients must call
   `POST /api/v1/login` with the admin credentials to receive a Bearer token.
   That token is then used for all subsequent API calls via the
   `Authorization: Bearer <token>` header.

2. **Open-access mode (legacy):** If `ADMIN_PASSWORD` is not set, the API runs
   **without authentication** and logs a warning — this allows local development
   without configuration.

The default admin credentials are configured via environment variables:
- `ADMIN_USERNAME` (default: "admin")
- `ADMIN_PASSWORD` (default: "admin" — only used if explicitly set)

On startup, a default admin user is created and a token is pre-generated so the
admin can immediately use the API after login.

```
POST /api/v1/login  {"username": "admin", "password": "..."}  →  {"token": "..."}
GET /api/v1/health  Authorization: Bearer <token>              →  200 OK
```

### 14.3 Configuration

| Env Variable | Default | Description |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Admin username for login-based auth |
| `ADMIN_PASSWORD` | (unset) | Admin password. If set, API requires login; if unset, API runs open-access |
| `DEVNULL_API_PORT` | `3001` | Port the API server listens on |
| `DEVNULL_API_HOST` | `0.0.0.0` | Host the API server binds to |

### 14.4 Usage

```bash
# Start the API server
devnull --serve

# With custom port
devnull --serve --port 8080

# Via Docker
docker compose up -d devnull --serve

# Login to get a token
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-admin-password"}' | \
  node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.token))")

# Call the API with the token
curl -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"task": "list files in the workspace"}' \
     http://localhost:3001/api/v1/chat
```

### 14.5 Component Architecture (API)

```
src/api/
├── types.ts       # API-specific type definitions
├── auth.ts        # Login-based token authentication (token store, login verify, middleware)
├── routes.ts      # Express router with all endpoint handlers (including /login)
└── server.ts      # Express server bootstrap (start/stop, admin init)
```

The API reuses the same `ReActOrchestrator`, `DeepSeekClient`, and `FileTelemetry` classes
that the CLI uses — there is no separate execution path. The `POST /api/v1/chat` endpoint
creates a fresh orchestrator instance per request, runs the task, and returns the result.

### 14.6 Future: React UI

The API is designed to be consumed by a React/TypeScript frontend (see `ui.md`). The
`/api/v1/chat` endpoint supports the chat interface, `/api/v1/telemetry` powers the
telemetry viewer, and `/api/v1/skills` provides skill discovery for the UI.

## 15. Testing

devnull includes multiple test suites covering unit tests, integration tests, E2E deployment
tests, and comprehensive UI tests.

### 15.1 Unit Tests (src/test/)

Standalone test suites, each runnable via `node dist/test/test<Subject>.js [args]`, always
printing explicit `PASS:`/`FAIL` lines:

| Test Suite | File | Status | Description |
|---|---|---|---|
| Iteration Stopping | `src/test/testIterationStopping.ts` | 5/5 passing | Verifies the ReAct loop stops correctly: on turn 1 if no tools needed, on the exact turn the model returns zero tool calls, mid-task tool calls don't prematurely end the loop, iteration count matches actual work, subagents stop correctly |
| Goal Validator | `src/test/testGoalValidator.ts` | 3/3 passing | Verifies the independent second-LLM-call audit: catches unsupported completion claims, catches claims after real tool failures, accepts genuinely backed claims, surfaces persistent hallucination in sys.log |
| ReAct Auditor | `src/test/testReactAuditor.ts` | Scenario battery | Runs bug-fixing scenarios through the orchestrator, reports pass/fail + invariant violations (NO_SEARCH_BEFORE_EDIT, NO_VALIDATION_BEFORE_DONE, VALIDATION_RETRIES_EXHAUSTED) |
| Live Diagnostics Harness | `src/test/testLiveDiagnosticsHarness.ts` | 7/7 passing | Scripted well-behaved agent that does real, working code — real server, real Dockerfile, real Todo API with real child-process test run |
| Live Diagnostics Negative | `src/test/testLiveDiagnosticsNegative.ts` | Mixed mock | Deliberately bad agent at specific diagnostics — confirms those genuinely fail with specific evidence while others pass |
| Tool Loop | `src/test/testToolLoop.ts` | End-to-end | Verifies the full tool-calling pipeline with a scripted MockLlmClient: search → action → validation trace, off-by-one bug actually fixed |
| DeepSeek Contract | `src/test/testDeepSeekContract.ts` | 4/4 passing | Intercepts `global.fetch` and inspects the actual JSON body DeepSeekClient constructs: temperature omitted in thinking mode, thinking field always explicit, reasoning_effort wired, reasoning_content continuity |
| API Server | `src/test/testApiServer.ts` | API tests | Tests the Express API server endpoints |
| Live Smoke Test | `src/test/liveSmokeTest.ts` | Live API | Hits the real DeepSeek API (requires `DEEPSEEK_API_KEY`); refuses to run when key is unset |

**Running unit tests:**

```bash
npm run build
node dist/test/testIterationStopping.js /tmp/test-workspace
node dist/test/testGoalValidator.js /tmp/test-workspace
node dist/test/testReactAuditor.js
node dist/test/testLiveDiagnosticsHarness.js
node dist/test/testLiveDiagnosticsNegative.js
node dist/test/testToolLoop.js /tmp/demo
node dist/test/testDeepSeekContract.js
```

### 15.2 E2E Deployment Tests (e2e/)

The `e2e/` directory contains Playwright-based deployment tests that verify the API and UI
are running correctly in a Docker deployment.

| Spec File | Coverage |
|---|---|
| `deploy-test.spec.ts` | API health check (`GET /api/v1/health`), skills listing (13 skills), chat endpoint validation (empty/missing task → 400), telemetry endpoints, 404 handling, UI homepage loading, React mount point, JS/CSS asset loading |

**Configuration** (`e2e/playwright.config.ts`):
- `baseURL`: `http://localhost:3001` (API)
- Timeout: 30s per test, 10s per assertion
- Project: `api` matching `**/deploy-test.spec.ts`

**Running E2E tests:**

```bash
# Ensure the API and UI are running first
docker compose --profile serve up -d

# Run the tests
cd e2e
npm ci
npx playwright install chromium
npx playwright test
```

### 15.3 UI Tests (ui-test-suited/)

The `ui-test-suited/` directory contains a comprehensive Playwright UI test suite covering
the full feature surface defined in `ui.md`.

| Spec File | Coverage |
|---|---|
| `health.spec.ts` | API health check, skills listing, error handling (400/404), telemetry endpoints |
| `homepage.spec.ts` | UI loads, title, root mount point, JS/CSS assets, navigation, console errors |
| `chat-flow.spec.ts` | Message input, send button, voice/listen, file upload, chat history |
| `project-management.spec.ts` | Project CRUD, active project selection, workspace browser, download/delete, LLM context toggle |
| `settings.spec.ts` | User CRUD, password change, LLM key management |
| `telemetry.spec.ts` | Searchable logs, reason-action-observation, command execution, token usage, log type selector |
| `admin.spec.ts` | Admin user creation, user management, role editing, user deletion, admin-only visibility |
| `diagnostic.spec.ts` | React testing, tools/skills/directives testing, run test button, pass/fail results |

**Configuration** (`ui-test-suited/playwright.config.ts`):
- `baseURL`: `http://localhost:8080` (UI)
- Timeout: 30s per test, 10s per assertion
- Screenshots: On failure only
- Trace: Retained on failure
- Reporter: List (console) + HTML report

**Running UI tests:**

```bash
# Ensure the API and UI are running first
docker compose --profile serve up -d

# Setup and run
cd ui-test-suited
npm install
npx playwright install chromium
npm test

# Other run modes
npm run test:headed      # See the browser
npm run test:debug       # Playwright debugger
npm run test:report      # Generate HTML report
npm run show-report      # View HTML report
```

## 16. Setup & Execution Guide

### 16.1 Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** (ships with Node.js)
- **Docker** (optional, for containerized deployment)
- **DeepSeek API key** (optional for mock-based testing; required for live LLM usage)

### 16.2 Local Development Setup

```bash
# Clone and install
git clone <repo-url>
cd devnull
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your DEEPSEEK_API_KEY

# Build TypeScript
npm run build
```

### 16.3 CLI Usage

```bash
# List all loaded skills
node dist/cli/index.js --skills

# Index the current workspace
node dist/cli/index.js --index

# Execute a task
node dist/cli/index.js --task "design and implement a rate limiter, then load test it"

# Interactive chat mode
node dist/cli/index.js --chat

# Record a lesson (self-improvement loop)
node dist/cli/index.js --lesson "Always check for edge cases in input validation"

# Run ReAct audit
node dist/cli/index.js --audit-react

# Run live diagnostics (requires real LLM connection)
node dist/cli/index.js --diagnose-live
```

### 16.4 API Server

```bash
# Start the API server (default port 3001)
node dist/cli/index.js --serve

# With custom port and host
node dist/cli/index.js --serve --port 8080 --host 127.0.0.1

# Test the API
curl -H "Authorization: Bearer my-secret-key" \
     -H "Content-Type: application/json" \
     -d '{"task": "list files in the workspace"}' \
     http://localhost:3001/api/v1/chat
```

### 16.5 Docker Deployment

```bash
# Build the Docker image
docker build -t devnull:latest .

# CLI mode (interactive)
docker run --rm -it -v "$PWD":/workspace --env-file .env devnull:latest --task "fix the bug"

# CLI mode via docker compose
docker compose run --rm api --task "fix the bug"
docker compose run --rm api --chat

# API + UI mode (detached)
docker compose --profile serve up -d

# View logs
docker compose logs -f api
docker compose logs -f ui

# Stop services
docker compose --profile serve down
```

### 16.6 Running Tests

```bash
# 1. Build the project first
npm run build

# 2. Unit tests (no external dependencies)
node dist/test/testIterationStopping.js /tmp/test-workspace
node dist/test/testGoalValidator.js /tmp/test-workspace
node dist/test/testReactAuditor.js
node dist/test/testLiveDiagnosticsHarness.js
node dist/test/testLiveDiagnosticsNegative.js
node dist/test/testToolLoop.js /tmp/demo
node dist/test/testDeepSeekContract.js

# 3. E2E deployment tests (requires API running)
docker compose --profile serve up -d
cd e2e
npm ci
npx playwright install chromium
npx playwright test
cd ..

# 4. UI tests (requires API + UI running)
cd ui-test-suited
npm install
npx playwright install chromium
npm test
cd ..
```

### 16.7 CI Integration

Example GitHub Actions workflow for UI tests:

```yaml
name: UI Tests
on: [push, pull_request]
jobs:
  ui-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Start services
        run: docker compose --profile serve up -d
      - name: Install Playwright
        working-directory: ui-test-suited
        run: |
          npm ci
          npx playwright install chromium
      - name: Run tests
        working-directory: ui-test-suited
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: ui-test-suited/playwright-report/
```

## 17. Known Gaps / Honest Limitations

- **Docker image build was not fully verified end-to-end in the environment this was built
  in** -- that sandbox's network egress doesn't reach Docker Hub, so `FROM node:20-alpine`
  can't be pulled there. What *was* verified there: Docker itself runs correctly, the
  Dockerfile parses and lints clean (`hadolint`, one documented exception), and both build
  stages' actual commands (`npm ci`, `npm run build`, `npm ci --omit=dev`) were run for real
  outside the container with the exact same inputs, producing a working CLI on production-only
  dependencies. Run `docker build -t devnull .` yourself to confirm the full image.
- Skill frontmatter (`requires_tools`, `composes_with`, section order) is convention-enforced,
  not schema-validated -- a malformed `SKILL.md` fails silently (skipped by the frontmatter
  regex) rather than erroring loudly.
- The orchestrator doesn't yet parse a structured "give up honestly" signal distinct from a
  normal completion -- a model that runs out of ideas mid-task reports through the same
  `finalContent` path as genuine success (mitigated, not eliminated, by the goal validator).
- `docker_deploy_ssh_tool` and `schedule_task_tool`'s cron mode depend on the *remote* /
  *container* host having `docker`/`crontab` installed respectively -- not something devnull
  can install on your behalf.

