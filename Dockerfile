# ─── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build toolchain for native addons (better-sqlite3), plus bash: package.json's
# postinstall script (scripts/install.sh) requires a real bash, which Alpine does NOT ship by
# default (its default shell is busybox ash). Without this, `npm install` below fails at the
# postinstall lifecycle step with a bare "spawn bash ENOENT" -- this predates the review
# (the same script ran as the "install" hook before), it just never surfaced because this
# Dockerfile was never exercised in CI (see the ci.yml fix: Job 1 now runs on windows-latest
# too, but the Docker jobs were and remain Linux-only, so this specific gap needed catching
# by hand rather than by CI).
RUN apk add --no-cache python3 make g++ bash

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json ./
RUN npm install --omit=optional

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc -p tsconfig.json

# Drop devDependencies (typescript, vitest, ts-node, @types/*, etc.) now that the build is done
# -- they were needed to run `tsc` above, but shipping them into the runtime image just adds
# size and unnecessary attack surface (more installed packages = more transitive dependencies
# that could carry a vulnerability) for something that never runs in production.
RUN npm prune --omit=dev

# ─── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built artifacts and production-only dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory for SQLite and logs with correct permissions
RUN mkdir -p /data/.log && chown -R appuser:appgroup /data

# Create workspace root for projects (PROJECTS_ROOT defaults to /app/workspace)
RUN mkdir -p /app/workspace && chown appuser:appgroup /app/workspace

# Switch to non-root user
USER appuser

# Default environment
ENV NODE_ENV=production
ENV DEVNULL_API_PORT=3001
ENV DEVNULL_API_HOST=0.0.0.0
ENV DATABASE_TYPE=sqlite
ENV DATABASE_SQLITE_PATH=/data/devnull.db
ENV DEVNULL_LOG_DIR=/data/.log

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health || exit 1

# Start the API server
CMD ["node", "dist/api/index.js"]
