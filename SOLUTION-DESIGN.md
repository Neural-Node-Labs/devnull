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

## 5. Sequence: `devnull --task "fix the bug in X"`

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

## 6. Naming & Coding Conventions

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

## 7. Deployment (Docker)

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

## 8. Known Gaps / Honest Limitations

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
