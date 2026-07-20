# Blueprint: devnull Packaging Strategy

## 1. Purpose

This blueprint defines the packaging strategy for devnull — a TypeScript/Node.js ReAct CLI
agent with a React/TypeScript UI frontend. The goal is to produce deployable artifacts that
exclude source code, externalize configuration, handle secrets securely, and support the
target deployment environments identified in Phase 1.

---

## Appendix A: Database Architecture

### A.1 Database Abstraction Layer

The database layer provides a unified interface for both SQLite (default) and PostgreSQL,
allowing the backend to switch between them via a single environment variable.

```
src/db/
├── types.ts              ← DatabaseClient interface + QueryResult + DatabaseType
├── config.ts             ← DatabaseConfig + loadDatabaseConfig() from env vars
├── connection.ts         ← createConnection() factory function
├── sqliteClient.ts       ← SqliteClient implements DatabaseClient
├── postgresClient.ts     ← PostgresClient implements DatabaseClient
└── index.ts              ← Barrel exports
```

### A.2 Core Interface

```typescript
export interface DatabaseClient {
  init(): Promise<void>;
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
  readonly initialized: boolean;
}
```

### A.3 Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_TYPE` | `sqlite` | Backend selector: `sqlite` or `postgres` |
| `DATABASE_SQLITE_PATH` | `~/.devnull/data/devnull.db` | SQLite file path |
| `DATABASE_URL` | (unset) | PostgreSQL connection string |
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_NAME` | `devnull` | PostgreSQL database |
| `DATABASE_USER` | `devnull` | PostgreSQL user |
| `DATABASE_PASSWORD` | `devnull_pass` | PostgreSQL password |
| `DATABASE_SSL` | `false` | Enable SSL |
| `DATABASE_POOL_MAX` | `5` | Max pool connections |
| `DATABASE_POOL_IDLE` | `30000` | Idle timeout ms |
| `DATABASE_POOL_TIMEOUT` | `5000` | Connection timeout ms |

### A.4 Store Layer (Consumers)

7 database-backed stores follow the same pattern (constructor injection of `DatabaseClient`,
schema-per-store via `init()`, graceful fallback on errors):

| Store | Tables | File |
|---|---|---|
| `PostgresProjectStore` | `projects` | `src/api/postgresProjectStore.ts` |
| `PlanStore` | `plans`, `plan_tasks` | `src/api/planStore.ts` |
| `PhaseReportStore` | `phase_reports` | `src/api/phaseReportStore.ts` |
| `TaskHistoryStore` | `task_history` | `src/api/taskHistoryStore.ts` |
| `WbsStore` | `wbs_entries` | `src/api/wbsStore.ts` |
| `PostgresTaskHistory` | `task_history` | `src/core/postgresTaskHistory.ts` |
| `PostgresTelemetry` | `telemetry_logs`, `telemetry_llm_calls`, `telemetry_errors` | `src/telemetry/postgresTelemetry.ts` |

### A.5 SQL Dialect Translation

The `SqliteClient` automatically translates PostgreSQL SQL to SQLite-compatible SQL:

- `$1, $2` → `?` (positional params)
- `ILIKE` → `LIKE`
- `TIMESTAMPTZ` → `TEXT`
- `NOW()` → `(datetime('now'))`
- `EXCLUDED.` → `excluded.`
- Strips `::type` casts, `RETURNING *`
- `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `JSONB` → `TEXT`, `BOOLEAN` → `INTEGER`
- `TRUE`/`FALSE` → `1`/`0`

### A.6 Known Gaps

1. **Duplicate `task_history` table**: Both `PostgresTaskHistory` and `TaskHistoryStore` manage the same table — consolidate into one.
2. **`RETURNING *` stripped for SQLite**: Documented limitation — use separate SELECT if needed.
3. **No centralized migration**: Schema changes require updating each store's `init()`.


## 2. Packaging Decision: Container Image (Docker) — Primary, Tarball — Secondary

### Decision: Docker container image as the primary packaging format

| Criterion | Docker | Compiled Binary (PyInstaller/Nuitka) | Platform Installer (.deb/.rpm/.exe) |
|---|---|---|---|
| **Fits existing architecture** | ✅ Already has Dockerfile + compose | ❌ TypeScript/Node.js — not Python | ❌ Overkill for a CLI + API server |
| **Dependency management** | ✅ npm install in build stage | ❌ Would need node bundler (pkg/nexe) | ❌ Would need fpm + repo management |
| **Multi-service** | ✅ API + UI + Postgres in compose | ❌ Single binary can't replace compose | ❌ Single package can't orchestrate services |
| **Remote deploy** | ✅ docker_deploy_ssh_tool exists | ❌ Would need new deploy mechanism | ❌ Would need package manager on target |
| **Source exclusion** | ✅ .dockerignore + multi-stage | ✅ Binary obfuscates source | ❌ .deb/.rpm still ships JS files |
| **Configuration** | ✅ Env vars + .env file | ✅ Env vars | ✅ Env vars |
| **Secret handling** | ✅ .env excluded from image | ✅ .env excluded from bundle | ✅ .env excluded from package |
| **CI/CD integration** | ✅ Standard Docker CI | ❌ Non-standard tooling | ❌ Platform-specific build matrix |

**Rationale:** The project already has a working multi-stage Dockerfile, docker-compose.yml
for local dev, and a `docker_deploy_ssh_tool` for remote deployment. Switching to a compiled
binary or platform installer would add complexity without benefit — the Node.js runtime is
already required, and Docker provides the cleanest isolation, dependency management, and
deployment path.

### Secondary: Deploy Tarball (tar.gz)

For environments where Docker is not available or where the user wants to inspect/modify the
artifact before deployment, a deploy tarball (`devnull-deploy.tar.gz`) is produced as a
secondary artifact. This contains the compiled JS output, Dockerfile, compose file, and
supporting config — everything needed to build and run the stack.

## 3. Artifact Structure

### 3.1 Docker Image (`devnull:latest`)

```
/opt/devnull/                    # DEVNULL_HOME
├── dist/                        # Compiled TypeScript (JS only, no .ts)
│   ├── cli/index.js             # CLI entry point
│   ├── core/                    # Orchestrator, skill registry, protocol, etc.
│   ├── tools/                   # 12 tool implementations
│   ├── api/                     # Express API server
│   ├── llm/                     # DeepSeek client
│   ├── config/                  # LLM config loader
│   ├── indexing/                # Workspace indexer
│   ├── telemetry/               # File-based logging
│   ├── remote/                  # SSH/SCP utilities
│   └── test/                    # Test suites (optional, for diagnostics)
├── agent/                       # Skills, protocol, config (fallback)
│   ├── devnull.md               # Engineering protocol
│   ├── config/llm.yaml          # LLM backend config
│   └── skills/                  # 13 hot-plug skills
│       ├── programmer/SKILL.md
│       ├── architect/SKILL.md
│       └── ... (13 total)
├── package.json                 # Production dependencies manifest
├── package-lock.json            # Locked dependency versions
├── .env.example                 # Template for user's .env
└── node_modules/                # Production dependencies only
```

**What goes in:**
- `dist/` — compiled JavaScript (source maps included for debugging)
- `agent/` — skills, protocol, LLM config (fallback for DEVNULL_HOME)
- `package.json` + `package-lock.json` — for npm dependency resolution
- `node_modules/` — production dependencies only (`npm install --omit=dev`)
- `.env.example` — template for user configuration

**What stays out:**
- `src/` — TypeScript source code (compiled to `dist/`, not shipped)
- `node_modules/` dev dependencies — excluded via `--omit=dev`
- `.env`, `.env.local`, `.env.production` — secrets never in image
- `.git/` — version control history
- `.log/` — runtime data
- `.agent/index/` — generated workspace index
- `tasks/`, `reports/`, `coverage/` — user workspace data
- `tests/`, `e2e/`, `ui-test-suited/` — test suites (not needed at runtime)
- `ui/` — frontend source (built as separate image)
- `scripts/`, `enhancement/`, `docs/` — development artifacts

### 3.2 UI Docker Image (`devnull-ui:latest`)

```
/usr/share/nginx/html/           # nginx web root
├── index.html                   # SPA entry point
├── assets/                      # Built JS/CSS bundles
│   ├── index-*.js
│   └── index-*.css
└── ...                          # Other static assets

/etc/nginx/conf.d/default.conf   # nginx config (API proxy)
```

**What goes in:**
- Built Vite output (`dist/` from `ui/` directory)
- nginx configuration with API reverse proxy

**What stays out:**
- `ui/src/` — React/TypeScript source code
- `ui/node_modules/` — dev dependencies
- `ui/package.json`, `ui/tsconfig.json`, `ui/vite.config.ts` — build config

### 3.3 Deploy Tarball (`devnull-deploy.tar.gz`)

```
devnull-deploy.tar.gz
├── dist/                        # Compiled JS (same as Docker dist/)
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml           # API + UI + Postgres services
├── .dockerignore                # Build context exclusions
├── .env.example                 # Template (NOT .env)
├── package.json                 # Production dependencies
├── package-lock.json            # Locked versions
├── tsconfig.json                # TypeScript config (for reference)
├── agent/                       # Skills, protocol, config
│   ├── devnull.md
│   ├── config/llm.yaml
│   └── skills/
│       ├── programmer/SKILL.md
│       └── ... (13 total)
└── ui/                          # Frontend source (built separately)
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── package-lock.json
    └── ... (built assets)
```

## 4. Configuration Externalization

### 4.1 Environment Variables (Runtime)

All configuration is externalized via environment variables, passed at container runtime:

| Variable | Default | Purpose | Sensitivity |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | (required) | DeepSeek LLM access | 🔴 Secret |
| `ANTHROPIC_API_KEY` | (optional) | Fallback LLM provider | 🔴 Secret |
| `GITHUB_TOKEN` | (optional) | GitHub API auth for github_tool | 🔴 Secret |
| `DEVNULL_API_KEY` | (unset) | API Bearer token auth | 🔴 Secret |
| `DATABASE_URL` | `postgresql://devnull:devnull_pass@localhost:5432/devnull` | PostgreSQL connection | 🟡 Contains password |
| `DEVNULL_API_PORT` | `3001` | API server port | 🟢 Non-sensitive |
| `DEVNULL_API_HOST` | `0.0.0.0` | API server bind address | 🟢 Non-sensitive |
| `DEVNULL_HOME` | `/opt/devnull` | Fallback path for agent skills/config | 🟢 Non-sensitive |
| `NODE_ENV` | `production` | Runtime environment | 🟢 Non-sensitive |
| `POSTGRES_USER` | `devnull` | PostgreSQL user | 🟢 Non-sensitive |
| `POSTGRES_PASSWORD` | `devnull_pass` | PostgreSQL password | 🔴 Secret |
| `POSTGRES_DB` | `devnull` | PostgreSQL database name | 🟢 Non-sensitive |
| `REMOTE_SSH_USER` | (optional) | SSH user for remote deploy | 🟡 Credential |
| `REMOTE_SSH_PASSWORD` | (optional) | SSH password for remote deploy | 🔴 Secret |
| `MAX_ITERATIONS` | `10` | ReAct loop iteration ceiling | 🟢 Non-sensitive |

### 4.2 Configuration Files (Baked into Image)

The following configuration files are baked into the Docker image as fallbacks:

- `agent/devnull.md` — Engineering protocol (can be overridden by workspace mount)
- `agent/config/llm.yaml` — LLM model selection, per-skill reasoning overrides (can be overridden)
- `agent/skills/*/SKILL.md` — 13 built-in skills (can be overridden by workspace mount)

**Override mechanism:** When a workspace is mounted at `/workspace`, any `agent/` directory
in the workspace takes precedence over the image's built-in `agent/`. This allows projects
to ship custom skills, protocols, or LLM config without modifying the image.

### 4.3 Secret Handling

| Concern | Approach |
|---|---|
| **API keys** | Passed via `--env-file .env` at `docker run`; never baked into image |
| **Database credentials** | Passed via environment variables; `DATABASE_URL` contains password |
| **SSH credentials** | Passed via environment variables (`REMOTE_SSH_USER`, `REMOTE_SSH_PASSWORD`) |
| **GitHub token** | Passed via `GITHUB_TOKEN` env var; used in-memory only |
| **.env file** | Explicitly excluded from Docker build via `.dockerignore` |
| **.env in tarball** | Explicitly excluded from deploy tarball via exclusion rules |
| **Runtime secrets** | Never logged to telemetry files (`.log/`); only non-sensitive metadata |

## 5. Build Pipeline

### 5.1 Build Stages

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ TypeScript   │    │ Docker Build │    │ Image Push   │    │ Deploy       │
│ Compilation  │───►│ (multi-stage)│───►│ (registry)   │───►│ (docker run  │
│ npm run build│    │ docker build │    │ docker push  │    │  or compose) │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### 5.2 Docker Build (Multi-Stage)

**Stage 1 — Builder:**
- Base: `node:20-alpine`
- Install ALL dependencies (including devDependencies)
- Copy TypeScript source
- Compile: `npm run build` (tsc)
- Output: `dist/` directory with compiled JS

**Stage 2 — Runtime:**
- Base: `node:20-alpine`
- Install system deps: `bash`, `ca-certificates`, `dcron`, `git`, `openssh-client`
- Install production dependencies only: `npm install --omit=dev`
- Copy compiled JS from builder: `dist/`
- Copy agent skills/config: `agent/`
- Copy `.env.example`
- Set `DEVNULL_HOME=/opt/devnull`
- Create non-root user `devnull`
- HEALTHCHECK for API server mode
- ENTRYPOINT: `node /opt/devnull/dist/cli/index.js`

### 5.3 UI Docker Build (Separate Multi-Stage)

**Stage 1 — Builder:**
- Base: `node:20-alpine`
- Install dependencies
- Build: `npm run build` (Vite)
- Output: `dist/` with static assets

**Stage 2 — Serve:**
- Base: `nginx:alpine`
- Copy built assets from builder
- Copy nginx config with API reverse proxy
- Expose port 80

### 5.4 Deploy Tarball Creation

The deploy tarball is created by `scripts/create-deploy-tarball.mjs` (or `.sh` equivalent):

```bash
node scripts/create-deploy-tarball.mjs
# Output: devnull-deploy.tar.gz
```

The tarball includes compiled JS, Dockerfile, compose file, agent skills, and UI source —
everything needed to build and run on a remote Docker host. Secrets are explicitly excluded.

## 6. Deployment Modes

### 6.1 Docker CLI Mode (Single Container)

```bash
docker run --rm -it \
  -v "$PWD":/workspace \
  --env-file .env \
  devnull:latest \
  --task "fix the bug"
```

### 6.2 Docker Compose (Full Stack)

```bash
docker compose --profile serve up -d
# Starts: api (port 3001) + ui (port 8080) + postgres (port 5432)
```

### 6.3 Remote Deploy (via docker_deploy_ssh_tool)

```bash
# Uses the built-in tool to package, ship, and deploy
devnull --task "deploy to production"
# Internally calls docker_deploy_ssh_tool which:
# 1. Creates tarball of workspace
# 2. Ships via SCP to remote host
# 3. Runs docker compose up -d --build
# 4. Verifies health endpoints
# 5. Supports rollback on failure
```

### 6.4 Local Development (No Docker)

```bash
npm install
npm run build
node dist/cli/index.js --task "..."   # CLI mode
node dist/cli/index.js --serve        # API server mode
```

## 7. Versioning & Tagging

| Artifact | Tag Strategy | Example |
|---|---|---|
| Docker image (API) | `devnull-api:{version}`, `devnull-api:latest` | `devnull-api:0.2.0` |
| Docker image (UI) | `devnull-ui:{version}`, `devnull-ui:latest` | `devnull-ui:0.2.0` |
| Deploy tarball | `devnull-deploy-{version}.tar.gz` | `devnull-deploy-0.2.0.tar.gz` |
| Git tag | `v{version}` | `v0.2.0` |

## 8. Tradeoffs & Rejected Alternatives

### Rejected: Compiled Binary (pkg/nexe)

- **Why rejected:** Node.js binary bundlers (pkg, nexe) have poor ESM support, struggle with
  native modules (ssh2, pg), and produce large binaries (~50MB+) that don't eliminate the
  Node.js dependency — they bundle it. The Docker image is smaller, more maintainable, and
  already works.

### Rejected: Platform-Specific Installers (.deb/.rpm/.exe)

- **Why rejected:** devnull is a multi-service stack (API + UI + Postgres), not a single
  desktop application. A .deb package can't orchestrate three services. Docker Compose is
  the correct abstraction for multi-service deployment.

### Rejected: Single "Fat" Image with UI

- **Why rejected:** The API and UI have different lifecycle, scaling, and update requirements.
  Separate images allow independent updates, scaling, and health monitoring. The nginx reverse
  proxy pattern is standard and well-understood.

### Rejected: No Tarball (Docker-only)

- **Why rejected:** Some deployment environments (air-gapped, no Docker registry access)
  require a portable artifact. The tarball provides a fallback that can be manually inspected,
  modified, and deployed.

## 9. Security Considerations

| Concern | Mitigation |
|---|---|
| Source code exposure | TypeScript compiled to JS; source maps included but no `.ts` files shipped |
| Secret leakage | `.env` excluded from image and tarball; secrets passed at runtime |
| Container escape | Non-root user (`devnull`); no `--privileged` flag |
| Supply chain | `package-lock.json` pins dependency versions; multi-stage build isolates build tools |
| Network exposure | API binds to configurable host/port; healthcheck is unauthenticated by design |
| SSH credentials | Passed via env vars, never written to disk in the image |
