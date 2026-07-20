# Phase 1: Deployment Infrastructure Inventory

## Overview

This document maps the current deployment pipeline end-to-end: source code → build → package → deploy → health check. It identifies all relevant files, their roles, and any gaps.

---

## 1. Pipeline Map

```
Source Code ──► Build ──► Package ──► Deploy ──► Health Check
    │              │           │            │             │
    ▼              ▼           ▼            ▼             ▼
  *.ts/.tsx     tsc +      tar.gz       SSH/scp      docker compose
  (src/, ui/)   vite       (workspace   to remote    ps + curl
                           tarball)     host         endpoints
```

---

## 2. Source Code

| Location | Purpose |
|----------|---------|
| `src/` | TypeScript backend (API server, CLI, tools, orchestrator) |
| `ui/` | React frontend (Vite + TypeScript) |
| `agent/` | Built-in skills, protocol, and config shipped in the Docker image |

---

## 3. Build

### Backend (`Dockerfile`)
- **Multi-stage**: `builder` stage compiles TypeScript, `runtime` stage runs it
- **Base image**: `node:20-alpine` (pinnable via `--build-arg NODE_IMAGE`)
- **Builder stage**: `npm install` → `tsc` compile → output in `/build/dist`
- **Runtime stage**: `npm install --omit=dev` → copies `dist/` from builder → copies `agent/` → sets `DEVNULL_HOME=/opt/devnull`
- **Non-root user**: `devnull` (UID 100)
- **Healthcheck**: HTTP GET `localhost:3001/api/v1/health`
- **Entrypoint**: `node /opt/devnull/dist/cli/index.js`

### Frontend (`ui/Dockerfile`)
- **Multi-stage**: `builder` stage with `npm ci` + `tsc && vite build`, `nginx:alpine` runtime
- **Serves**: built assets from `/usr/share/nginx/html`
- **Nginx config**: `ui/nginx.conf` — proxies `/api/` to `api:3001` with 600s read timeout

### `.dockerignore` (root)
Excludes: `node_modules`, `dist`, `.git`, `.log`, `.agent/index`, `tasks`, `reports`, `.env`, `.env.local`, `.env.production`

### `ui/.dockerignore`
Excludes: `node_modules`, `dist`, `.git`, `.env`, `.env.local`, `.env.production`

---

## 4. Package

### `docker_deploy_ssh_tool` (`src/tools/dockerDeploySshTool.ts`)
The primary packaging + deployment mechanism. Steps:

1. **Pre-deploy validation** — checks Docker + Compose are installed, disk space, uptime
2. **Create remote directory** — `mkdir -p <remotePath>`
3. **Tar workspace** — uses `fast-glob` with `dot: true` to include dotfiles (`.env.example`, `.dockerignore`), respecting ignore rules from `loadIgnoreRules()`
4. **Upload tarball** — via `scpUpload` (ssh2 SFTP for password auth, shell-out scp for key auth)
5. **Upload `.env` file** — if `envFile` option is specified
6. **Extract on remote** — `tar -xzf` then remove tarball
7. **Rollback snapshot** — saves `docker compose ps --format json` to `.devnull-rollback-snapshot.json`
8. **Run Docker command** — default: `docker compose up -d --build`
9. **Health verification** — polls `docker compose ps` every 5s until all services are healthy (or timeout at 120s)

### Legacy deploy scripts (redundant/outdated)

| File | Purpose | Status |
|------|---------|--------|
| `deploy_remote.py` | Python paramiko-based deploy to `86.38.217.69` | **Legacy** — duplicates `docker_deploy_ssh_tool` |
| `scripts/deploy-remote.mjs` | Node.js script that calls `deployWorkspaceViaSsh` directly | **Redundant** — same logic as CLI `--deploy --remote` |

---

## 5. Deploy

### Primary deploy path: `docker_deploy_ssh_tool` via tool dispatcher

The tool is registered in `src/tools/toolSchemas.ts` (line 217) and dispatched in `src/tools/toolDispatcher.ts` (line 249). It supports:

- **Inline credentials**: `host`, `user`, `password` params
- **Env-var credentials**: `userEnvVar`, `passwordEnvVar` params (resolved from `process.env` at runtime)
- **Compose file selection**: `composeFile` param
- **Registry pull mode**: `pullFromRegistry` replaces `--build` with `--pull always`
- **Skip options**: `skipValidation`, `skipHealthCheck`, `skipRollback`
- **Timeouts**: `healthCheckTimeoutMs` (default 120s), `dockerCommandTimeoutMs` (default 300s)

### CLI deploy mode (`src/cli/index.ts`)

The `--deploy` / `--docker` / `--remote` flags provide a CLI entry point:

- `devnull --deploy --docker` → local `docker compose up -d --build`
- `devnull --deploy --docker --llm true` → sends deploy as a devops task to the LLM
- `devnull --deploy --docker --remote 86.38.217.69` → remote deploy via `deployWorkspaceViaSsh`
- `devnull --deploy --docker --remote 86.38.217.69 --llm true` → LLM-driven remote deploy

### `docker-compose.yml` (local orchestration)

Three services:
- **postgres**: `postgres:16-alpine`, healthcheck via `pg_isready`, persistent volume `pgdata`
- **api**: built from root `Dockerfile`, depends on postgres (healthy), env from `.env`, port 3001, command `--serve --port 3001 --host 0.0.0.0`
- **ui**: built from `ui/Dockerfile`, depends on api (healthy), port 8080:80, nginx proxies `/api/` to api:3001

### `enhancement/docker-compose.yaml`
Separate Traefik reverse-proxy compose file (not part of the main stack). Provides Let's Encrypt TLS termination.

---

## 6. Health Check

### Post-deploy health verification (in `docker_deploy_ssh_tool`)
1. Polls `docker compose ps --format json` every 5 seconds
2. Parses NDJSON output (one JSON object per line) or falls back to tab-separated format
3. Checks `allServicesHealthy()` — every service must be "Up", "running", or "healthy"
4. Detects failed states: "exit", "crash", "error", "unhealthy"
5. Timeout after 120s (configurable)

### Docker healthchecks (in `docker-compose.yml`)
- **postgres**: `pg_isready` every 10s, 5 retries, 10s start period
- **api**: HTTP GET `localhost:3001/api/v1/health` every 30s, 3 retries, 10s start period
- **ui**: `wget --spider http://127.0.0.1:80/` every 30s, 3 retries, 5s start period

### E2E tests (`e2e/deploy-test.spec.ts`)
Playwright tests that verify API endpoints (`/api/v1/health`, `/api/v1/skills`, etc.) and UI page loads. These are **speculative** — written against `ui.md` requirements, not the actual UI implementation.

---

## 7. SSH Credentials Configuration

### Env vars used for remote deploy

| Variable | Source | Used By |
|----------|--------|---------|
| `REMOTE_SSH_USER` | `.env` / `_.env_` | `src/cli/index.ts` (line 129), `deploy_remote.py` (line 19), `scripts/deploy-remote.mjs` (line 14) |
| `REMOTE_SSH_PASSWORD` | `.env` / `_.env_` | `src/cli/index.ts` (line 130), `deploy_remote.py` (line 20), `scripts/deploy-remote.mjs` (line 15) |
| `XCODER_SSH_TARGETS` | env var | `src/remote/config.ts` (line 14) — fleet ops |
| `XCODER_SSH_USER` | env var | `src/remote/config.ts` (line 20) — fleet ops |
| `XCODER_SSH_PASSWORD` | env var | `src/remote/config.ts` (line 21) — fleet ops |

### Current values (from `_.env_`)
- `REMOTE_SSH_USER=root`
- `REMOTE_SSH_PASSWORD=cPNvtYzbA/S-2+S@`
- Target host: `86.38.217.69`

### Credential flow in `docker_deploy_ssh_tool`
The tool schema accepts `userEnvVar` and `passwordEnvVar` string params. The dispatcher resolves them at runtime:
```typescript
const resolvedUser = args.userEnvVar ? (process.env[args.userEnvVar] ?? "") : (args.user ?? "");
const resolvedPassword = args.passwordEnvVar ? (process.env[args.passwordEnvVar] ?? "") : undefined;
```
This keeps secrets out of LLM context and process argv.

---

## 8. Gaps and Issues

### Critical Gaps

1. **No CI/CD pipeline** — No GitHub Actions, GitLab CI, or Jenkins config exists. Deployments are manual (CLI or tool invocation). No automated test gate before deploy.

2. **No staging environment** — Only one remote target (`86.38.217.69`). No canary or blue/green deploy capability.

3. **No artifact registry** — Images are built on the remote host from source every time (`--build`). No Docker registry push/pull workflow. The `pullFromRegistry` option exists but has no registry configured.

4. **No automated rollback test** — Rollback logic exists in code but has never been validated end-to-end. The rollback snapshot saves compose state but doesn't save the previous tarball.

### Moderate Gaps

5. **Redundant deploy scripts** — `deploy_remote.py` (Python/paramiko) and `scripts/deploy-remote.mjs` duplicate the `docker_deploy_ssh_tool` functionality. They're not maintained in sync.

6. **`_.env_` file contains real credentials** — This file has actual SSH password for `86.38.217.69`. It's not in `.gitignore` (the `.gitignore` doesn't exist in the workspace; `.dockerignore` excludes `.env` but not `_.env_`).

7. **No monitoring/alerting** — No health check endpoint monitoring, no uptime tracking, no deploy failure alerts.

8. **E2E tests are speculative** — `e2e/deploy-test.spec.ts` tests were written against requirements, not the actual UI. They may fail on a real deployment.

### Minor Issues

9. **`enhancement/docker-compose.yaml` is disconnected** — The Traefik reverse-proxy compose file is in an `enhancement/` directory and not wired into the main stack.

10. **No deploy documentation** — No `DEPLOY.md` or equivalent documenting the deploy process, rollback procedure, or environment configuration.

---

## 9. File Inventory Summary

| File | Role | Status |
|------|------|--------|
| `Dockerfile` | Backend image build | ✅ Active |
| `ui/Dockerfile` | Frontend image build | ✅ Active |
| `docker-compose.yml` | Local orchestration (3 services) | ✅ Active |
| `.dockerignore` | Build context exclusions | ✅ Active |
| `ui/.dockerignore` | UI build context exclusions | ✅ Active |
| `ui/nginx.conf` | Nginx config with API proxy | ✅ Active |
| `src/tools/dockerDeploySshTool.ts` | Primary deploy tool | ✅ Active |
| `src/tools/toolDispatcher.ts` | Tool dispatch (line 249) | ✅ Active |
| `src/tools/toolSchemas.ts` | Tool schema (line 217) | ✅ Active |
| `src/cli/index.ts` | CLI entry point with deploy flags | ✅ Active |
| `src/remote/config.ts` | Fleet SSH config loader | ✅ Active |
| `src/tools/sshTool.ts` | SSH exec/upload/download | ✅ Active |
| `src/tools/__tests__/dockerDeploySshTool.test.ts` | Unit tests for deploy tool | ✅ Active |
| `e2e/deploy-test.spec.ts` | E2E deploy verification tests | ⚠️ Speculative |
| `deploy_remote.py` | Legacy Python deploy script | 🔴 Redundant |
| `scripts/deploy-remote.mjs` | Legacy Node deploy script | 🔴 Redundant |
| `_.env_` | Environment config with credentials | ⚠️ Contains secrets |
| `.env.example` | Environment template | ✅ Active |
| `enhancement/docker-compose.yaml` | Traefik reverse-proxy | 🔴 Disconnected |
