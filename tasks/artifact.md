# Deployment Artifact — devnull Docker + Playwright Validation

## Deployed Services

| Service | Container | Image | Port | Status |
|---------|-----------|-------|------|--------|
| API | `devnull-api` | `devnull-api:latest` | `3001` | Healthy |
| UI | `devnull-ui` | `devnull-ui:latest` | `8080` | Healthy (starting) |

## How to Deploy

```bash
# Build and start both services
docker compose --profile serve up -d --build

# Or just the API
docker compose --profile serve up -d --build api

# Stop everything
docker compose --profile serve down
```

## Files Deployed

- `Dockerfile` — multi-stage build, non-root user, production deps only, 266MB image
- `docker-compose.yml` — API + UI services with resource limits, healthchecks, profiles
- `.dockerignore` — excludes node_modules, dist, .env, ui/, etc.
- `e2e/deploy-test.spec.ts` — Playwright test suite (10 tests)
- `e2e/playwright.config.ts` — Playwright config

## Playwright Test Results

**10/10 passed** (2.1s)

### API Tests (7)
1. ✅ `GET /api/v1/health` — returns 200 with `status: "ok"`, version `0.1.0`
2. ✅ `GET /api/v1/skills` — returns all 13 skills (programmer, architect, devops, etc.)
3. ✅ `POST /api/v1/chat` with empty task — returns 400
4. ✅ `POST /api/v1/chat` with missing task — returns 400
5. ✅ `GET /api/v1/telemetry` with no logs — returns empty entries
6. ✅ `GET /api/v1/telemetry` with invalid log param — returns 400
7. ✅ `GET /api/v1/nonexistent` — returns 404

### UI Tests (3)
8. ✅ UI homepage loads with correct title
9. ✅ Root `#root` div is visible (React mount point)
10. ✅ JS and CSS assets are loaded

## Rollback Plan

```bash
# Stop and remove containers
docker compose --profile serve down

# Remove images
docker rmi devnull-api:latest devnull-ui:latest

# To redeploy previous version, rebuild from a specific git tag
git checkout tags/v0.1.0
docker compose --profile serve up -d --build
```

## Image Details

- **API image**: `devnull-api:latest` — 266MB (Alpine-based, multi-stage)
- **Base**: `node:20-alpine` pinned by digest
- **Runtime deps**: bash, ca-certificates, dcron, git, openssh-client
- **Non-root user**: `devnull` (UID/GID from Alpine defaults)
- **Healthcheck**: HTTP GET `/api/v1/health` every 30s, 10s start period
