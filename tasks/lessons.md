# Lessons Learned

Track recurring patterns and mistakes here so we don't repeat them.

## 2025-07-17: Postgres + Playwright Full Suite

- **CRLF line endings in SKILL.md files break frontmatter parsing**: The `FRONTMATTER_RE` regex in `skillRegistry.ts` only matched `\n` line endings. On Windows, files have `\r\n`. Fixed by making the regex accept optional `\r` before `\n`: `/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/`.
- **Pre-existing UI test failures are not infrastructure issues**: The `ui-test-suited` tests were written speculatively against `ui.md` requirements, not the actual UI implementation. Many tests fail because the UI doesn't have the expected elements yet (no `<nav>`, no chat input matching those patterns, admin page redirects to login, etc.). These are test implementation issues, not Postgres/Docker issues.
- **Postgres container needs `depends_on` with `condition: service_healthy`**: The API must wait for Postgres to be ready before starting. Using `pg_isready` healthcheck with `service_healthy` condition ensures reliable startup ordering.
- **DATABASE_URL must use the Docker service name as host**: Inside the Docker network, the API connects to `postgres:5432`, not `localhost:5432`. The `.env` file has `localhost` for local development, while `docker-compose.yml` overrides with the service name.

## 2026-07-19: Nginx 504 Gateway Time-out on Task Execution

- **Nginx `proxy_read_timeout` defaults to 60s, which is too short for LLM ReAct loops**: The `/api/v1/chat`, `/api/v1/chat/plan`, and `/api/v1/chat/execute` endpoints run the full ReAct loop (multiple LLM calls + tool executions) which can take several minutes. Without an explicit `proxy_read_timeout`, nginx kills the connection at 60s and returns a 504. Fix: add `proxy_read_timeout 600s;` (10 minutes) to the `/api/` location block in `ui/nginx.conf`.

## 2026-07-19: ReAct Iteration Extension in UI

- **The API's `onIterationLimitReached` was hardcoded to `async () => false`**: In `src/api/routes.ts`, the orchestrator was configured to always stop when hitting the iteration limit. The UI received a `limitation` message but had no way to tell the server to continue. Fix: added `continueOnLimit` option to `OrchestratorOptions` and `ChatRequest`. When `true`, the orchestrator auto-continues past the iteration limit. The UI now shows a "▶ Continue" button on limitation messages that re-sends the task with `continueOnLimit: true`.
- **The UI had no "Continue" button on limitation messages**: When the server returned a `limitation` field (e.g., "The task did not finish within the iteration limit."), the message was displayed but there was no way for the user to extend the iteration. Fix: added a `handleContinue` function and a "▶ Continue" button that appears on limitation messages, re-sending the same task with `continueOnLimit: true`.

## 2026-07-19: SSH Tools Env-Var Credential Enhancement

- **Passwords in tool arguments leak into logs, context, and process argv**: When SSH passwords are passed as inline tool parameters, they appear in the LLM context, tool call logs, and potentially in `/proc` on Linux. Fix: add `userEnvVar` and `passwordEnvVar` string params to `ssh_tool` and `docker_deploy_ssh_tool` schemas. The dispatcher resolves credentials from `process.env[varName]` at runtime. For `ssh_tool`, the password is passed via `sshpass -e` (reads from `SSHPASS` env var) rather than as a command-line argument, keeping it out of process argv entirely.
- **`sshpass` is required for password-based SSH auth**: The original `ssh_tool` used `BatchMode=yes` which explicitly disables password auth. When a password is provided via env var, `BatchMode=yes` must be omitted and `sshpass -e` must wrap the ssh/scp command. The password is injected via the `SSHPASS` environment variable in the child process's env, not as a CLI argument.
- **Prefer devops fleet tools for multi-host operations**: `ssh_copy_tool` and `ssh_run_command` use shared env-var credentials (`XCODER_SSH_TARGETS`/`XCODER_SSH_USER`/`XCODER_SSH_PASSWORD`) and support parallel execution across multiple targets. The `ssh_tool` and `docker_deploy_ssh_tool` descriptions now explicitly recommend these fleet tools for multi-host operations.
