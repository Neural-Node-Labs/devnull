# Plan: Enhance docker_deploy_ssh_tool with DevOps/Docker-Expert depth

## Task
The user asked to "Add tool to deploy to remote docker" — the tool already existed as `docker_deploy_ssh_tool` (a basic tar-and-ship utility). The task was to enhance it with production-grade DevOps/Docker-Expert features.

## Implementation Plan

### Step 1: Enhance `dockerDeploySshTool.ts` ✅
- Added `DeployOptions` interface with all new parameters
- Added pre-deploy checks (docker version, disk space)
- Added rollback: snapshot existing compose state before deploy, restore on failure
- Added health verification after deploy (polls `docker compose ps` for healthy status)
- Added structured `DeployReport` return type with per-service status
- Added `composeFile` selection, `pullFromRegistry` mode, `envFile` shipping

### Step 2: Update `toolSchemas.ts` ✅
- Added all new parameters to the `docker_deploy_ssh_tool` schema with descriptions

### Step 3: Update `toolDispatcher.ts` ✅
- Updated dispatch to pass new options through to the enhanced deploy function

### Step 4: Update documentation ✅
- Updated `SOLUTION_DESIGN.md` tool table
- Updated `README.md` tool reference table
- Updated `agent/skills/docker-expert/SKILL.md` Output Artifacts
- Updated `agent/skills/devops/SKILL.md` Output Artifacts

### Step 5: Write unit tests and validate ✅
- Wrote 26 unit tests covering all pure functions (command building, status parsing, health check logic)
- Fixed a real bug: `allServicesHealthy()` matched `"unhealthy"` as healthy (substring match on "healthy")
- All 26 tests pass
- TypeScript build compiles cleanly

## Review

### What was done
The `docker_deploy_ssh_tool` was enhanced from a basic tar-and-ship utility to a production-grade remote Docker deploy tool with:

**New parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `composeFile` | string | Specific compose file (e.g. `docker-compose.prod.yml`) |
| `envFile` | string | Local `.env` file to ship alongside the workspace |
| `pullFromRegistry` | boolean | Replace `--build` with `--pull always` |
| `skipValidation` | boolean | Skip pre-deploy checks |
| `skipHealthCheck` | boolean | Skip health verification |
| `skipRollback` | boolean | Skip rollback snapshot |
| `healthCheckTimeoutMs` | number | Health check polling timeout (default: 2 min) |
| `dockerCommandTimeoutMs` | number | Docker command timeout (default: 5 min) |

**New features:**
1. **Pre-deploy validation** — checks remote host has Docker and Docker Compose installed, reports disk space and uptime
2. **Rollback** — snapshots the current compose state before deploy, restores on failure
3. **Health verification** — polls `docker compose ps` every 5s until all services are healthy or timeout
4. **DeployReport** — structured result with per-service status, tar size, all SSH operation results, rollback status
5. **Registry pull mode** — `pullFromRegistry: true` replaces `--build` with `--pull always`
6. **Compose file selection** — `composeFile` injects `-f <file>` into the docker command
7. **Env file shipping** — `envFile` uploads a local `.env` to the remote target directory

**Validation:**
- 26 unit tests covering all pure functions (command building, status parsing, health check logic)
- Fixed a real bug: `allServicesHealthy()` used `status.includes("healthy")` which matched `"unhealthy"` as healthy
- TypeScript build compiles with zero errors
- `npm test` runs all tests

### Files changed
- `src/tools/dockerDeploySshTool.ts` — complete rewrite with all new features
- `src/tools/toolSchemas.ts` — updated schema with new parameters
- `src/tools/toolDispatcher.ts` — updated dispatch to pass new options
- `SOLUTION_DESIGN.md` — updated tool description
- `README.md` — updated tool description
- `agent/skills/docker-expert/SKILL.md` — updated Output Artifacts
- `agent/skills/devops/SKILL.md` — updated Output Artifacts
- `src/tools/__tests__/dockerDeploySshTool.test.ts` — NEW: 26 unit tests
- `package.json` — added `test` and `test:watch` scripts

## Review
Here's the corrected completion report:

---

## What was actually done

The task was to **"Add tool to deploy to remote docker"**. The tool already existed as `docker_deploy_ssh_tool` — a basic tar-and-ship utility. I **enhanced it** with production-grade DevOps/Docker-Expert features and **validated it with 26 unit tests**.

### Key changes

1. **Enhanced `dockerDeploySshTool.ts`** — added 8 new parameters and 7 new features (pre-deploy validation, rollback, health verification, structured DeployReport, registry pull mode, compose file selection, env file shipping)

2. **Fixed a real bug found by testing** — `allServicesHealthy()` used `status.includes("healthy")` which incorrectly matched `"unhealthy"` as healthy. Fixed to use exact/startsWith matching.

3. **Wrote 26 unit tests** covering all pure functions:
   - `buildDockerCommand` — 6 tests (default, custom, pullFromRegistry, composeFile, combinations)
   - `buildRollbackSnapshotCommand` — 1 test
   - `buildRollbackRestoreCommand` — 1 test
   - `buildHealthCheckCommand` — 2 tests
   - `buildPreCheckCommand` — 1 test
   - `parseServiceStatuses` — 6 tests (JSON array, JSON object, tab-separated, header skip, NO_COMPOSE_PS, empty)
   - `allServicesHealthy` — 8 tests (Up, healthy, running, exited, unhealthy, crashed, "Up N minutes", "healthy (healthy)", empty)

4. **All 26 tests pass**, TypeScript compiles cleanly, `npm test` is configured.

### Files changed
- `src/tools/dockerDeploySshTool.ts` — enhanced implementation
- `src/tools/toolSchemas.ts` — updated schema
- `src/tools/toolDispatcher.ts` — updated dispatch
- `src/tools/__tests__/dockerDeploySshTool.test.ts` — **NEW** 26 unit tests
- `package.json` — added test scripts
- Documentation files updated
