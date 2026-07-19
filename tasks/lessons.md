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

## 2026-07-19: Remote Docker Deploy to 86.38.217.69

- **`globTool` has `dot: false` which excludes dotfiles from deployment tarballs**: The `docker_deploy_ssh_tool` used `globTool("**/*")` to list files for the tarball, but `globTool` has `dot: false` which excludes all dotfiles (`.env.example`, `.dockerignore`, etc.). Fix: replaced `globTool` with a direct `fast-glob` call using `dot: true` in `dockerDeploySshTool.ts`. The ignore rules from `loadIgnoreRules()` are still applied, so `.env` (in `.dockerignore`) is correctly excluded while `.env.example` is included.
- **`npm ci` fails when `package-lock.json` has platform-specific optional deps**: The `package-lock.json` generated on Windows includes entries for `@emnapi/core` and `@emnapi/runtime` (optional deps of `@rolldown/binding-wasm32-wasi`) that don't match the versions available on Linux. `npm ci` requires exact lockfile alignment and fails. Fix: replaced `npm ci` with `npm install` in the Dockerfile's production stage. The builder stage also had both `npm install` AND `npm ci` — removed the redundant `npm ci`.
- **CPU limits in `docker-compose.yml` must not exceed available CPUs**: The remote server has only 1 CPU, but the API service had `cpus: "2"` which Docker rejected with "range of CPUs is from 0.01 to 1.00". Fix: reduced all CPU limits to at most `"0.5"` so multiple containers can coexist on a 1-CPU machine.
- **Bind-mounted `/workspace` directory is owned by root on the host, not the container's `devnull` user**: The `docker-compose.yml` bind-mounts `/root/devnull` (host) to `/workspace` (container). The host directory is owned by `root`, but the container runs as `devnull` (UID 100). When the app tries to create `/workspace/.log`, it gets EACCES. Fix: `chown -R 100:101 /root/devnull` on the host, and pre-create `/workspace/.log` in the Dockerfile so the directory exists even without the bind mount fix.
- **Always rebuild (`npm run build`) before deploying after code changes**: The `docker_deploy_ssh_tool` dynamically imports the compiled JS with cache-busting (`?t=Date.now()`), but if the build hasn't been run since the source change, the old compiled code is used. Always run `npm run build` before deploying.

## 2026-07-19: SSH Tools Env-Var Credential Enhancement

- **Passwords in tool arguments leak into logs, context, and process argv**: When SSH passwords are passed as inline tool parameters, they appear in the LLM context, tool call logs, and potentially in `/proc` on Linux. Fix: add `userEnvVar` and `passwordEnvVar` string params to `ssh_tool` and `docker_deploy_ssh_tool` schemas. The dispatcher resolves credentials from `process.env[varName]` at runtime. For `ssh_tool`, the password is passed via `sshpass -e` (reads from `SSHPASS` env var) rather than as a command-line argument, keeping it out of process argv entirely.
- **`sshpass` is required for password-based SSH auth**: The original `ssh_tool` used `BatchMode=yes` which explicitly disables password auth. When a password is provided via env var, `BatchMode=yes` must be omitted and `sshpass -e` must wrap the ssh/scp command. The password is injected via the `SSHPASS` environment variable in the child process's env, not as a CLI argument.
- **Prefer devops fleet tools for multi-host operations**: `ssh_copy_tool` and `ssh_run_command` use shared env-var credentials (`XCODER_SSH_TARGETS`/`XCODER_SSH_USER`/`XCODER_SSH_PASSWORD`) and support parallel execution across multiple targets. The `ssh_tool` and `docker_deploy_ssh_tool` descriptions now explicitly recommend these fleet tools for multi-host operations.
