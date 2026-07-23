# devnull

**devnull** is a ReAct (Reasoning + Acting) CLI agent with hot-pluggable role skills. It uses a ReAct loop — Search → Action → Validation — to autonomously complete tasks by reasoning, calling tools, and validating results. DeepSeek is the default LLM backend, with support for Anthropic and any OpenAI-compatible provider.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI (commander)                       │
│  src/cli/index.ts — argument parsing, chat loop, deploy      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   ReActOrchestrator                          │
│  src/core/orchestrator.ts — ReAct loop, plan mode, phases   │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Plan Mode  │  │ Phase Plan   │  │  Goal Validator  │   │
│  │  (optional) │──▶ (optional)   │──▶  (independent    │   │
│  │             │  │              │  │   audit)         │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  Tool Layer  │ │ LLM      │ │  Telemetry   │
│  dispatcher  │ │ Client   │ │  & Logging   │
│  + 20+ tools │ │ (multi-  │ │              │
│              │ │ provider)│ │              │
└──────────────┘ └──────────┘ └──────────────┘
        │
        ▼
┌──────────────┐
│  HTTP API    │
│  (Express)   │
│  /api/v1/*   │
└──────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** 20+
- **npm**
- A **DeepSeek API key** (or Anthropic / OpenAI-compatible key)

### Installation

```bash
# Clone the repo
git clone <repo-url> devnull
cd devnull

# Install dependencies
npm run devnull:install

# Build
npm run devnull:build

# Set your API key
export DEEPSEEK_API_KEY="sk-..."
# Or create a .env file:
# DEEPSEEK_API_KEY=sk-...
```

### Run a Task

```bash
# Single task
npx devnull "Find all TypeScript files and count the lines"

# Interactive chat mode
npx devnull --chat

# With plan mode (for complex tasks)
npx devnull --plan "Refactor the authentication module"
```

## CLI Usage

```
devnull [task] [options]

Arguments:
  task                          Task description (equivalent to --task)

Options:
  --chat                        Interactive chat mode
  --task <description>          Execute a single task
  --index                       Index workspace into .agent/index/
  --skills                      List all loaded skills
  --lesson <text>               Record a lesson to tasks/lessons.md
  --plan                        Force Plan Mode ON
  --no-plan                     Force Plan Mode OFF
  --full-context-token          Keep all read_tool history (no compaction)
  --single-phase                Disable phase-based planning
  --auto                        Fully autonomous mode (no prompts)
  --isolated-workspace          Run in ./workspace-agent/ copy
  --audit-react                 Run bug-fixing audit suite
  --audit-out <path>            Audit report output path
  --diagnose-live               Run 7-point diagnostic suite
  --diagnose-out <path>         Diagnostics report output path
  --serve                       Start HTTP API server
  --port <number>               API server port (default: 3001)
  --host <address>              API server host (default: 0.0.0.0)
  --deploy                      Deploy with Docker Compose
  --docker                      Use Docker Compose (implied by --deploy)
  --llm <boolean>               Send deploy task to LLM (default: false)
  --remote <ip>                 Remote host for deployment
  --remote-path <path>          Remote deploy path (default: /opt/devnull)
  -V, --version                 Output version
  -h, --help                    Display help
```

## Core Concepts

### ReAct Loop

The agent follows a three-phase cycle:

1. **Search Phase** — Read files, glob, grep to gather context
2. **Action Phase** — Write files, run commands, SSH, deploy
3. **Validation Phase** — Run tests, verify results

Each iteration: **Thought → Tool Call → Observation → Repeat**

### Plan Mode

For complex tasks (3+ steps or architectural decisions), the agent enters Plan Mode:

1. Generates a plan as a markdown checklist
2. Writes it to `tasks/todo.md`
3. Requires user approval before execution
4. Appends a review section after completion

### Phase Planning

Large tasks are divided into sequential phases, each running as an isolated sub-orchestrator:

- Each phase has its own ReAct memory (reduced token footprint)
- Results are summarized and passed to the next phase
- Per-phase reports are saved to `tasks/<task-name>-phase-<N>.md`
- A WBS (Work Breakdown Structure) file tracks progress

### Skill System

Skills are hot-pluggable role directives loaded from `agent/skills/<name>/SKILL.md`:

| Skill | Role | Triggers |
|-------|------|----------|
| analyst | Data Analyst | analyze, data, report, metrics, statistics |
| architect | Software Architect | architecture, design, structure, component |
| devops | DevOps Engineer | deploy, ci/cd, pipeline, docker, kubernetes |
| docker-expert | Docker Expert | docker, container, compose, image |
| conversation | Conversationalist | (general chat) |
| filesystem-management | File System Manager | files, directories, organize, structure |
| kubernetes-expert | Kubernetes Expert | kubernetes, k8s, pod, service, deployment |
| pentester | Security Penetration Tester | security, vulnerability, pentest, exploit |
| performance-tester | Performance Tester | performance, benchmark, load test, stress |
| programmer | Software Developer | code, implement, refactor, bug, feature |
| playwright-ui-tester | Playwright UI Tester | playwright, ui test, browser, e2e |
| rca | Root Cause Analyst | root cause, incident, outage, failure, postmortem |
| scrum-framework | Scrum Framework | scrum, sprint, agile, backlog, standup |
| scrum-master-agent | Scrum Master | scrum master, facilitation, impediment |
| secops | Security Operations | security, monitoring, incident response |
| tester | Software Tester | test, qa, quality, verification |

Skills are automatically routed based on trigger keywords in the task description. Multiple skills can compose together via `composes_with` in their headers.

### Goal Validator

Before accepting a task as complete, an independent LLM call audits the work:

- Reviews the conversation transcript and claimed completion
- Rejects unsupported claims with specific reasoning
- Up to 2 retries before accepting unverified

### Self-Healing Health Score

Each tool call is scored heuristically (0-100). If the rolling average drops below 40, a nudge is injected asking the agent to reconsider its approach. The health score tracks:

- Tool call success/failure
- Empty vs. meaningful observations
- Self-assessed scores from the LLM's reasoning

### Subagent Strategy

Complex sub-tasks are delegated to fresh orchestrator instances:

- Isolated message history (keeps parent context clean)
- Parallel execution possible
- Iteration limit handling with continuation support
- Partial progress reports when limits are hit

## HTTP API

Start the API server:

```bash
npx devnull --serve --port 3001
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/login` | No | Login with username/password |
| POST | `/api/v1/logout` | No | Revoke token |
| GET | `/api/v1/health` | No | Health check (used by Docker) |
| POST | `/api/v1/register` | No | Register first user (becomes admin) |
| GET | `/api/v1/users/count` | No | Check if users exist |
| POST | `/api/v1/chat` | Yes | Execute a task |
| POST | `/api/v1/chat/plan` | Yes | Generate a plan (no execution) |
| POST | `/api/v1/chat/execute` | Yes | Execute an approved plan |
| GET | `/api/v1/telemetry` | Yes | Read telemetry logs |
| GET | `/api/v1/skills` | Yes | List available skills |
| GET | `/api/v1/users` | Yes | List users |
| POST | `/api/v1/users` | Yes | Create user (admin) |
| PUT | `/api/v1/users/:id` | Yes | Update user |
| DELETE | `/api/v1/users/:id` | Yes | Delete user |
| GET | `/api/v1/plans` | Yes | List plans |
| POST | `/api/v1/plans` | Yes | Create plan |
| GET | `/api/v1/plans/:id` | Yes | Get plan |
| PUT | `/api/v1/plans/:id/status` | Yes | Update plan status |
| PUT | `/api/v1/plans/:planId/tasks/:taskId` | Yes | Update task status |
| POST | `/api/v1/plans/:id/tasks` | Yes | Add task to plan |
| DELETE | `/api/v1/plans/:planId/tasks/:taskId` | Yes | Delete task |
| GET | `/api/v1/task-history` | Yes | List task history |
| POST | `/api/v1/task-history` | Yes | Add task history entry |
| GET | `/api/v1/task-history/:taskId/logs` | Yes | Get telemetry logs for task |
| GET | `/api/v1/phase-reports` | Yes | List phase reports |
| GET | `/api/v1/phase-reports/:id` | Yes | Get phase report |
| GET | `/api/v1/wbs` | Yes | List WBS entries |
| PUT | `/api/v1/wbs/:id/status` | Yes | Update WBS entry status |
| GET | `/api/v1/settings/llm-key` | Yes | Check if API key is set |
| PUT | `/api/v1/settings/llm-key` | Yes | Set API key |
| DELETE | `/api/v1/settings/llm-key` | Yes | Clear API key |

### Chat API Flow

**Single-step execution** (no plan approval needed):
```bash
curl -X POST http://localhost:3001/api/v1/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"task": "Count lines in all TypeScript files"}'
```

**Two-phase approval flow** (plan → approve → execute):
```bash
# Phase 1: Generate plan
curl -X POST http://localhost:3001/api/v1/chat/plan \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"task": "Refactor the auth module"}'
# Returns: { sessionId: "...", plan: "..." }

# Phase 2: Execute approved plan
curl -X POST http://localhost:3001/api/v1/chat/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "<sessionId from phase 1>"}'
```

## Project Structure

```
├── agent/
│   ├── devnull.md              # Engineering protocol (system prompt)
│   └── skills/                 # Hot-pluggable role skills
│       ├── <name>/
│       │   ├── SKILL.md        # YAML frontmatter + markdown body
│       │   └── references/     # Supporting reference docs
│       └── ...
├── src/
│   ├── cli/
│   │   └── index.ts            # CLI entry point (commander)
│   ├── core/
│   │   ├── orchestrator.ts     # ReAct loop engine
│   │   ├── types.ts            # Core type definitions
│   │   ├── protocol.ts         # System prompt builder
│   │   ├── skillRegistry.ts    # Skill loading & routing
│   │   ├── goalValidator.ts    # Independent completion audit
│   │   ├── stepScorer.ts       # Health score calculation
│   │   ├── contextCompaction.ts # Token optimization
│   │   ├── consoleReporter.ts  # CLI output formatting
│   │   ├── taskHistory.ts      # File-based task history
│   │   ├── workspaceManager.ts # Isolated workspace management
│   │   ├── reactAuditor.ts     # Bug-fixing audit suite
│   │   ├── liveDiagnostics.ts  # 7-point diagnostic suite
│   │   └── serverHealthCheck.ts # API health check
│   ├── api/
│   │   ├── server.ts           # Express server setup
│   │   ├── routes.ts           # API route definitions
│   │   ├── auth.ts             # Token-based authentication
│   │   ├── types.ts            # API type definitions
│   │   ├── planStore.ts        # Plan persistence (PostgreSQL)
│   │   ├── planRoutes.ts       # Plan CRUD routes
│   │   ├── projectStore.ts     # Project management
│   │   ├── projectRoutes.ts    # Project CRUD routes
│   │   ├── taskHistoryStore.ts # Task history (PostgreSQL)
│   │   ├── phaseReportStore.ts # Phase report persistence
│   │   ├── wbsStore.ts         # WBS persistence
│   │   └── llmKeyStore.ts      # API key management
│   ├── tools/
│   │   ├── toolSchemas.ts      # Tool definitions for LLM
│   │   ├── toolDispatcher.ts   # Tool call routing
│   │   ├── globTool.ts         # File pattern matching
│   │   ├── grepTool.ts         # Content search
│   │   ├── readTool.ts         # File reading
│   │   ├── writeEditTool.ts    # File writing/editing
│   │   ├── runCommandTool.ts   # Shell command execution
│   │   ├── sshTool.ts          # SSH operations
│   │   ├── sshCopyTool.ts      # SCP file transfer
│   │   ├── sshRunCommand.ts    # Remote command execution
│   │   ├── githubTool.ts       # Git/GitHub operations
│   │   ├── dockerDeploySshTool.ts # Remote Docker deploy
│   │   ├── dockerComposeDeployTool.ts # Local Docker deploy
│   │   ├── playwrightTool.ts   # Playwright test runner
│   │   ├── apiTestTool.ts      # HTTP API testing
│   │   ├── indexingTool.ts     # Workspace indexing
│   │   ├── scheduleTool.ts     # Cron job scheduling
│   │   ├── siteCrawlerTool.ts  # Web crawling
│   │   ├── summarizeUrlTool.ts # URL content summarization
│   │   ├── crawlPlaywrightTool.ts # Playwright test generation
│   │   ├── filePlanStore.ts    # File-based plan persistence
│   │   └── ...
│   ├── llm/
│   │   ├── deepseekClient.ts   # Multi-provider LLM client
│   │   └── mockClient.ts       # Mock client for testing
│   ├── config/
│   │   └── loadConfig.ts       # LLM configuration loading
│   ├── db/
│   │   ├── initialize.ts       # Database table creation
│   │   ├── connection.ts       # Connection management
│   │   ├── postgresClient.ts   # PostgreSQL client
│   │   ├── sqliteClient.ts     # SQLite client
│   │   ├── migrations.ts       # Schema migrations
│   │   └── types.ts            # Database type definitions
│   ├── indexing/
│   │   ├── indexer.ts          # File indexing engine
│   │   └── ignoreRules.ts      # .agentignore parsing
│   ├── remote/
│   │   ├── sshConnection.ts    # SSH connection management
│   │   ├── scpUpload.ts        # SCP file upload
│   │   └── types.ts            # Remote types
│   ├── stores/
│   │   ├── filePhaseReportStore.ts  # File-based phase reports
│   │   ├── fileTaskHistoryStore.ts  # File-based task history
│   │   └── fileWbsStore.ts         # File-based WBS
│   ├── telemetry/
│   │   ├── logger.ts           # File-based telemetry
│   │   └── postgresTelemetry.ts # PostgreSQL telemetry
│   └── test/                   # Integration tests
├── ui/                         # Web UI (React/Vite)
├── scripts/                    # Build & setup scripts
├── tasks/                      # Generated task artifacts
│   ├── todo.md                 # Current plan
│   ├── lessons.md              # Learned patterns
│   └── <task>-*.md             # Phase reports