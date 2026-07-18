# devnull

A ReAct CLI agent with hot-pluggable role skills. DeepSeek is the default LLM backend.

## What's here

```
devnull/
├── agent/
│   ├── devnull.md               # standing engineering protocol (plan mode, subagents, ...)
│   ├── config/llm.yaml          # DeepSeek default + per-skill reasoning overrides + Anthropic fallback
│   └── skills/                  # 13 hot-plug skills, each a SKILL.md (YAML header + body)
│       ├── programmer/  architect/  tester/  devops/  secops/
│       ├── kubernetes-expert/  docker-expert/  performance-tester/
│       ├── pentester/  rca/  analyst/  filesystem-management/
│       └── playwright-ui-tester/
├── src/
│   ├── cli/index.ts             # --chat/--task/--index/--skills/--lesson/--audit-react/--diagnose-live
│   ├── core/
│   │   ├── types.ts             # shared types (SkillHeader, ReActStep, LlmClient, ...)
│   │   ├── skillRegistry.ts     # hot-plug loader + routing (falls back to DEVNULL_HOME)
│   │   ├── orchestrator.ts      # ReAct loop, plan mode, subagents, goal validator
│   │   ├── protocol.ts          # loads devnull.md + tasks/lessons.md into the system prompt
│   │   ├── goalValidator.ts     # independent second-LLM-call completion audit
│   │   ├── duplicateActionDetector.ts  # flags wasteful exact-repeat tool calls
│   │   ├── reactAuditor.ts      # devnull --audit-react scenario battery
│   │   └── liveDiagnostics.ts   # devnull --diagnose-live 7-point suite
│   ├── tools/                   # glob, grep, read, write/edit, run_command, ssh, schedule,
│   │                             # playwright_run, crawl_and_generate_playwright_test, github,
│   │                             # docker_deploy_ssh, subagent
│   ├── indexing/                # .agentignore/.gitignore/.dockerignore merge + index.json + chunked dumps
│   ├── llm/deepseekClient.ts    # DeepSeek client (thinking-mode-aware), Anthropic fallback
│   ├── telemetry/logger.ts      # .log/thinking.log, llm.log, sys.log (stub-by-default)
│   ├── config/loadConfig.ts     # loads agent/config/llm.yaml + .env (falls back to DEVNULL_HOME)
│   └── test/                    # standalone test suites, each runnable via `node dist/test/...`
├── Dockerfile                    # multi-stage, non-root runtime, DEVNULL_HOME baked in
├── docker-compose.yml
├── .dockerignore
├── solution-design.md
├── .agent/.agentignore
├── .env.example
├── package.json
└── tsconfig.json
```

## Docker

```bash
docker build -t devnull:latest .
docker run --rm -it -v "$PWD":/workspace --env-file .env devnull:latest --task "..."
# equivalently:
docker compose run --rm devnull --task "..."
```

The image sets `DEVNULL_HOME=/opt/devnull`, so `SkillRegistry`, the `devnull.md` protocol, and
`llm.yaml` all fall back to what's baked into the image when the workspace you mount doesn't
have its own `agent/` directory — verified: a completely empty mounted workspace still
resolves all 13 built-in skills. Ship your own `agent/skills/`, `agent/devnull.md`, or
`agent/config/llm.yaml` in your project to override any of it; those always take precedence
over the image's fallback.

**Honest limitation**: the actual `docker build` was written and statically verified
(`hadolint`-clean, both build stages' real commands independently confirmed to work end-to-end
producing a working CLI on production-only deps) but not run to completion in the environment
this was built in, since that sandbox's network egress doesn't reach Docker Hub to pull
`node:20-alpine`. Run `docker build -t devnull .` yourself to confirm the full image — see
`solution-design.md` §8 for the full detail on what was and wasn't verified.

## Quick start

```bash

npm install
cp .env.example .env        # add DEEPSEEK_API_KEY
npm run build

node dist/cli/index.js --skills          # list all loaded skills
node dist/cli/index.js --index           # index the current workspace
node dist/cli/index.js --task "design and implement a rate limiter, then load test it"
node dist/cli/index.js --chat            # interactive chat mode (quit/exit/bye to leave)
```

## How skill routing works

Each `SKILL.md` has a YAML frontmatter header with `triggers` (keywords) and `composes_with`
(other skills it pairs with). `SkillRegistry.route()` scores every skill by trigger-keyword
match against the task text, then the orchestrator loads the top skill **plus** everything in
its `composes_with` list — so "deploy this to kubernetes with helm and set up ci/cd" loads
both `devops` and `kubernetes-expert` automatically, each contributing its Process/Strategies/
Instructions/Planning/Experience sections to the system prompt.

## ReAct loop

`ReActOrchestrator.run()` implements the three phases:

- **Search** — Thought → Action (glob/grep/read) → Observation
- **Action** — Thought → Action (write/edit) → Observation
- **Validation** — Thought → Action (run_command: tests/linter/kubectl/docker build) →
  Observation → decide: done, or loop back

If the loop hits its iteration ceiling without completing, it drops into chat mode and asks
whether to continue (resets the counter) or stop — the "iteration maxout" behavior.

## Testing ReAct: does it stop correctly, and does it hallucinate?

Two dedicated test suites, plus a real second-agent hallucination check built into the
orchestrator itself (not just a test — an actual runtime guard).

**Does it stop once the objective is achieved?** — `src/test/testIterationStopping.ts`
(`node dist/test/testIterationStopping.js <workspace-dir>`), 5/5 passing:
- Stops on turn 1 if no tools are needed (exactly 1 LLM call, not more)
- Stops on the exact turn the model returns zero tool calls — not one early, not one late
- A successful tool call mid-task does NOT prematurely end the loop; only an explicit
  zero-tool-call turn does
- Iteration count matches actual work needed under the ceiling — no wasted/dropped turns
- Subagents stop the same way and never interactively prompt past their own limit

**Is it hallucinating completion?** — `src/core/goalValidator.ts` adds a real runtime guard:
whenever the ReAct loop is about to accept a "done" turn (zero tool calls), a **second,
independent LLM call** — no tools, no shared conversation history, only the task + the raw
recorded tool observations + the claimed answer — audits whether the claim is actually
supported. If not, the claim is rejected back into the loop with the reason, and the agent
gets up to `maxValidatorRetries` (default 2) chances to either actually do the work or correct
its claim, before the run gives up and surfaces the unresolved discrepancy in `sys.log` rather
than silently accepting it or looping forever. Configurable via `validateGoal`/`maxValidatorRetries`
on `OrchestratorOptions`.

`src/test/testGoalValidator.ts` (`node dist/test/testGoalValidator.js <workspace-dir>`), 3/3
passing — and the validator logic in this test is a **real skepticism rule reading real
observations**, not a scripted yes/no:
- A completion claim with zero supporting observations gets caught and rejected
- Confirmed the validator also catches a *second, more plausible-sounding* claim after a real
  `run_command_tool` call genuinely failed (non-zero exit) in the workspace — it's reading
  actual tool output, not just checking whether a tool was called at all
- A claim genuinely backed by a passing observation is accepted on the first check, no wasted
  retries
- Persistent hallucination past the retry ceiling is surfaced in `sys.log`, and the agent's
  honest fallback answer is accepted rather than a forced false "success"

## Trigger it yourself: `devnull --diagnose-live` (real API connection, all 7 points)

A broader diagnostic than `--audit-react` — runs against a **real LLM connection** (whatever's
configured in `agent/config/llm.yaml`) and checks 7 specific things:

```bash
devnull --diagnose-live                              # writes reports/live-diagnostics-<timestamp>.md
devnull --diagnose-live --diagnose-out my-report.md
```

1. **ReAct iteration ends when the task is successful** — confirms the loop terminates
   naturally (before the iteration ceiling), not that it got truncated.
2. **Restart-approval flow** — deliberately sets a tight `maxIterations` on a multi-step task,
   confirms the "need more iterations?" callback actually fires, and that approving it
   genuinely resumes the loop past the original ceiling (not just re-asks and gives up).
3. **No wasteful duplicate reasoning/action** — analyzes the full tool-call trace for any
   exact `(tool, arguments)` pair that was called more than once *and* produced an identical
   observation every time (`src/core/duplicateActionDetector.ts`). Deliberately does **not**
   flag a legitimate re-run (e.g. re-running tests after a real edit, where the observation
   genuinely changes) — only flags a repeat that gained zero new information.
4. **Tools and skills are effectively used** — confirms skill routing actually fired for the
   task and that real tool calls were dispatched and succeeded, not just discussed.
5. **Build a deployable application from the ground up** — asks for a minimal Node HTTP server
   + Dockerfile, then **independently starts the real server process and does a real HTTP GET**
   against it (not trusting the agent's claim), plus a structural Dockerfile check, plus an
   actual `docker build` if Docker is available on the machine running the diagnostic.
6. **Bug fixing** — reuses the same independently-verified scenario battery from
   `devnull --audit-react` (`auditReactLoop`/`defaultScenarios`).
7. **Full SDLC: design → develop → test → fix → production-ready** — a small in-memory Todo
   REST API, with the agent expected to write it, write a real test script, run it, fix
   failures, and add a Dockerfile. The diagnostic **independently re-runs the agent's own test
   file as a separate process** and only passes if that independent run exits 0.

### What's actually verified here (not just described)

This needs a real DeepSeek connection I can't make from this sandbox, so I built and verified
every mechanism I *could* test without one:

- **The restart-approval plumbing is real**, not just interactive-only: `OrchestratorOptions.onIterationLimitReached`
  is now injectable (defaults to the stdin yes/no prompt for normal CLI use). Verified with a
  scripted mock: `maxIterations: 2` on a 6-step task triggered the callback 3 times, and 7 total
  LLM calls happened — proving the counter genuinely reset each time rather than just stopping.
- **Found and fixed a real hang bug** while building this: diagnostic 7 originally used
  `planMode: "auto"`, which triggers Plan Mode's interactive stdin confirmation — that would
  have hung forever in any automated run (including a real `--diagnose-live` execution, with
  no one there to type "yes"). All 7 diagnostics now explicitly force `planMode: "never"`.
- **The duplicate-action detector is real** and distinguishes correctly: a scripted exact
  repeat with an identical observation both times is flagged; a scripted re-run of the same
  command after a genuine edit (different observation) is not.
- **The independent verification functions are real code**, not mocked: `verifyHttpServer`
  actually spawns `node server.js` and does a real `fetch()` against `/health`; the SDLC
  diagnostic actually `spawnSync`s the agent's own `test.js` as a fresh process.
- **Full suite tested both ways**: `testLiveDiagnosticsHarness.ts` (7/7 pass with a scripted
  well-behaved agent that does real, working code — real server, real Dockerfile, real Todo
  API with a real child-process test run making real HTTP requests) and
  `testLiveDiagnosticsNegative.ts` (a mixed mock deliberately bad at #3 and #5 — confirms those
  two genuinely fail with specific evidence naming the exact duplicated call and the exact
  failed health check, while #1/#2/#4 correctly still pass on their well-behaved parts of the
  same run).

Run them yourself: `node dist/test/testLiveDiagnosticsHarness.js` and
`node dist/test/testLiveDiagnosticsNegative.js`.

## Trigger it yourself: `devnull --audit-react`

A standing, triggerable diagnostic — not a one-off test script. Run it any time you want a
report on how the ReAct loop is actually performing on bug-fixing tasks, against whatever
model is configured in `agent/config/llm.yaml`:

```bash
devnull --audit-react                          # writes reports/react-audit-<timestamp>.md
devnull --audit-react --audit-out my-report.md  # custom output path
```

It runs 4 built-in bug-fixing scenarios (increasing difficulty: single-file bug, cross-file
root cause, a naive-fix trap that should fail validation and force a real retry, and a
task worded to tempt skipping verification) through the **real orchestrator** — same code
path as `devnull --task`, including the real goal validator. For each scenario the report
shows:

- **Independently verified fix** — actually re-runs the code and checks the real output;
  never trusts the agent's own claim (same principle as the goal validator, applied to the
  audit itself)
- The full tool-call sequence with phase labels
- Every goal-validator verdict (accepted/rejected + reason)
- **Invariant violations**: edited without searching first (`NO_SEARCH_BEFORE_EDIT`),
  declared done with no validation-phase tool call anywhere in the trace
  (`NO_VALIDATION_BEFORE_DONE`), or accepted an unverified claim after validator retries were
  exhausted (`VALIDATION_RETRIES_EXHAUSTED`)
- LLM call count and duration

Crucially, "passed" (bug actually fixed) and "clean process" (no invariant violations) are
reported **separately** — a lucky-but-unverified fix shows as passed with a flagged violation,
not a false clean bill of health. Verified this distinction is real: in `testReactAuditor.ts`,
a scripted "bad agent" that skips reading before editing gets flagged
(`NO_SEARCH_BEFORE_EDIT`) even though its fix happened to be correct, and a scripted agent that
skips verification when the task tempts it to ("don't worry about testing") gets flagged
(`NO_VALIDATION_BEFORE_DONE`) even though its fix also happened to be correct — while a
genuinely wrong fix (`wrong-first-attempt`) is correctly caught by the goal validator, rejected
twice with real reasons, and reported as failed once retries are exhausted. A separately
scripted well-behaved agent scores 4/4 passed with 0 violations, confirming the checks don't
false-positive on good behavior. Run it yourself: `node dist/test/testReactAuditor.js`.

The scenario battery and report format are exported (`auditReactLoop`, `defaultScenarios` from
`src/core/reactAuditor.ts`) if you want to add your own scenarios or call it programmatically.

## Live-API test (run locally — your key never leaves your machine)

`src/test/liveSmokeTest.ts` hits the real DeepSeek API: basic completion, tool calling, and
the full orchestrator loop (including a real second-call goal-validator audit) against a
genuine off-by-one bug fixture. It reads `DEEPSEEK_API_KEY` from your own `.env`/shell env and
sends it only to `https://api.deepseek.com` — nothing else touches it.

```bash
cp .env.example .env   # fill in your real DEEPSEEK_API_KEY
npm run build
node dist/test/liveSmokeTest.js
```

Confirmed locally (no key) that it refuses to run and makes zero network calls when
`DEEPSEEK_API_KEY` is unset, rather than failing open.

## Engineering protocol (devnull.md)

`agent/devnull.md` is devnull's standing engineering protocol — Plan Mode, Subagent Strategy,
Self-Improvement Loop, Verification Before Done, Demand Elegance, Autonomous Bug Fixing, Task
Management, and Core Principles. It's loaded every session and sent to the model wrapped in
the `<system_directive>` / `<engineering_protocol>` XML tags DeepSeek's docs recommend for
segmenting a large instruction payload inside one message (see `src/core/protocol.ts`).

**Plan Mode** — triggers automatically when 2+ skills route to a task (the "3+ steps or
architectural decisions" heuristic), or force it with `--plan` / suppress with `--no-plan`.
The orchestrator calls the LLM once with no tools to produce a checklist, writes it to
`tasks/todo.md`, prints it, and **requires an explicit yes/no confirmation on stdin before
any tool-calling turn happens** — rejecting the plan stops the run before a single tool call.
After the loop finishes, a Review section is appended to `tasks/todo.md`.

**Subagent Strategy** — the LLM can call `subagent_tool` to delegate a focused task to a
*fresh* `ReActOrchestrator` instance with its own isolated message history. Only the
sub-agent's final text summary crosses back into the parent's context — its tool calls, raw
file reads, and intermediate reasoning never do. Verified: a parent that delegates a file-read
to a subagent ends up with exactly 4 messages (system/user/assistant/tool-result) in its own
history, containing only `{"summary": "..."}`, never the subagent's `read_tool` call or the
raw file content.

**Self-Improvement Loop** — `devnull --lesson "<text>"` appends a timestamped entry to
`tasks/lessons.md`; every future session automatically loads that file into the prompt inside
a `<lessons_learned>` tag, so corrections compound across sessions instead of resetting.

## Extending with a new skill

Drop a new `agent/skills/<name>/SKILL.md` following the same frontmatter shape used by the
existing 13 skills — no code changes needed. `SkillRegistry` picks it up automatically on the
next `loadHeaders()` call (e.g. via `devnull --skills` or `devnull --index`).

## Tool calling

DeepSeek (and the Anthropic fallback, for plain-text completions) is wired with real
OpenAI-compatible function calling — see `src/tools/toolSchemas.ts` for the tool schemas
sent to the model, and `src/tools/toolDispatcher.ts` for how a returned `tool_call` is
executed against the actual tool implementations. The orchestrator loops: send messages + tools → model returns
`tool_calls` → dispatch each → push the real Observation back as a `tool`-role message →
repeat until the model stops calling tools.

This is verified end-to-end with a scripted `MockLlmClient` (no API key needed):

```bash
npm run build
mkdir -p /tmp/demo && echo 'function add(a,b){return a+b+1;} console.log(add(2,3));' > /tmp/demo/buggy.js
node dist/test/testToolLoop.js /tmp/demo
cat /tmp/demo/buggy.js        # off-by-one bug is actually fixed
cat /tmp/demo/.log/thinking.log  # full search -> action -> validation trace
```

## Optimized for DeepSeek's actual documented behavior

Verified against DeepSeek's current Thinking Mode docs (not assumed) and fixed accordingly:

- **`temperature`/`top_p` have no effect in thinking mode** (DeepSeek's own docs: setting them
  "will not trigger an error but will also have no effect"). `DeepSeekClient` now **omits them
  entirely** when thinking is enabled instead of sending dead parameters — verified via a test
  that intercepts `fetch` and asserts `"temperature" in body === false` for a thinking-mode call.
- **The `thinking` field is always sent explicitly** (`{"type": "enabled"}` or
  `{"type": "disabled"}`), never omitted — relying on a model's own default is fragile across
  tiers/versions; explicit is correct regardless of what DeepSeek defaults to.
- **`reasoning_effort` (`"high"`/`"max"`) is now wired in** as the actual lever for thinking-mode
  depth, replacing the old (no-op) approach of trying to tune thinking output via temperature.
  RCA and Architect get `high`; Pentester gets `max` for its security-critical reasoning.
- **Default temperature set to `0.0`**, matching DeepSeek's own published guidance for code/math
  tasks — this is fundamentally a coding agent.
- **The goal validator now uses `response_format: {"type": "json_object"}`**, DeepSeek's
  structured-output mode, for its pass/fail JSON verdict — more reliable than hoping a plain
  completion returns clean JSON. Its system prompt already contains the literal word "json" per
  DeepSeek's reliability guidance for this mode.
- **`reasoning_content` continuity confirmed**, not just for the immediate next turn but
  correctly present on every prior assistant message still in history — DeepSeek's docs require
  it be carried on *all* subsequent requests once tool calls have occurred, not just the one
  right after. Verified with a test that constructs a message history and confirms
  `reasoning_content` survives being echoed back in the outgoing request body.

`src/test/testDeepSeekContract.ts` (`node dist/test/testDeepSeekContract.js`) — 4/4 passing —
intercepts `global.fetch` and inspects the actual JSON body `DeepSeekClient` constructs, rather
than trusting the code by inspection alone.

## DeepSeek model migration note

`agent/config/llm.yaml` uses `deepseek-v4-flash` / `deepseek-v4-pro` — **not** the legacy
`deepseek-chat` / `deepseek-reasoner` aliases, which DeepSeek deprecates 2026-07-24 15:59 UTC
with no fallback afterward. See "Optimized for DeepSeek's actual documented behavior" above
for how thinking mode, `reasoning_effort`, and `reasoning_content` are actually handled.

## Full tool reference

| Tool | Purpose |
|---|---|
| `glob_tool` / `grep_tool` / `read_tool` | Search phase primitives |
| `write_edit_tool` | Write a new file or unique-match edit an existing one |
| `run_command_tool` | Execute a shell command (tests, linter, kubectl, docker build, repro steps) |
| `ssh_tool` | Run a command on a remote host, or upload/download via scp (`action`: exec/upload/download) |
| `schedule_task_tool` | Recurring (OS cron) or one-off (delayed, detached) task scheduling; add/list/remove |
| `playwright_run_tool` | Run a Playwright spec via `npx playwright test`, returns pass/fail summary |
| `crawl_and_generate_playwright_test_tool` | Fetch a URL, extract links/buttons/forms, write a Playwright test skeleton |
| `github_tool` | clone/fetch/pull/status/commit/push, using `GITHUB_TOKEN` for HTTPS auth if set |
| `docker_deploy_ssh_tool` | Tar the workspace, ship it over SSH, run a Docker command remotely |
| `subagent_tool` | Delegate a focused task to a fresh, isolated sub-orchestrator; only its final summary returns |

`ssh_tool`, `github_tool`, `schedule_task_tool`, and `crawl_and_generate_playwright_test_tool`
were verified against a real local sshd, a real public GitHub repo, real crontab entries, and
a real live URL crawl respectively during development — not just type-checked.
`playwright_run_tool` was verified against a real `@playwright/test` project (including a
genuine pass and a genuine failure); it assumes the target workspace already has Playwright
configured and browsers installed (`npx playwright install`) — devnull doesn't bundle
Playwright itself, since UI tests belong to the project under test, not to the agent.
`docker_deploy_ssh_tool`'s pack/ship/extract pipeline is verified end-to-end; the final
`docker` command depends on Docker being installed on the target remote host.

To run it against real DeepSeek instead of the mock, just use the normal CLI
(`devnull --task "..."`) once `DEEPSEEK_API_KEY` is set — same dispatch path, live model.

## Solution design

See [`solution-design.md`](SOLUTION-DESIGN.md) for the full architecture: business logic,
component diagram, sequence diagram, tech-stack rationale, naming conventions, and an honest
list of known gaps/limitations.
