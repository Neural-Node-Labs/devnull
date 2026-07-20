# syntax=docker/dockerfile:1
# =============================================================================
# devnull — Multi-stage Dockerfile
#
# Build args:
#   NODE_IMAGE   = Node.js base image (default: node:20-alpine)
#   VERSION      = Semantic version label (default: 0.2.0)
#   BUILD_DATE   = ISO-8601 build timestamp for OCI labels
#
# To pin a specific digest for reproducibility:
#   docker pull node:20-alpine
#   docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine
#   docker build --build-arg NODE_IMAGE=node:20-alpine@sha256:<digest> .
# =============================================================================
ARG NODE_IMAGE=node:20-alpine
ARG VERSION=0.2.0
ARG BUILD_DATE

# =============================================================================
# Stage 1 — builder: compile TypeScript, includes devDependencies
# =============================================================================
FROM ${NODE_IMAGE} AS builder

LABEL \
    org.opencontainers.image.title="devnull (builder)" \
    org.opencontainers.image.description="devnull ReAct CLI agent — build stage" \
    org.opencontainers.image.source="https://github.com/neural-node-labs/devnull" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.authors="Sir John M. Nueva" \
    org.opencontainers.image.licenses="MIT"

WORKDIR /build

# Install build toolchain needed for native addons (better-sqlite3, etc.)
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first for optimal layer caching
COPY package.json package-lock.json* ./
# Use npm install instead of npm ci because the lockfile may contain
# platform-specific optional deps (e.g. @emnapi/* for @rolldown) that differ
# between the build host (Windows) and the Docker target (Linux).
RUN npm install --include=dev

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune devDependencies from node_modules so the builder stage can serve as
# a fallback for the runtime stage if npm install --omit=dev fails.
RUN npm prune --omit=dev

# =============================================================================
# Stage 2 — runtime: minimal image, production deps only, non-root user
# =============================================================================
FROM ${NODE_IMAGE}

LABEL \
    org.opencontainers.image.title="devnull" \
    org.opencontainers.image.description="devnull ReAct CLI agent — runtime image" \
    org.opencontainers.image.source="https://github.com/neural-node-labs/devnull" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.authors="Sir John M. Nueva" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.base.name="${NODE_IMAGE}"

# ---------------------------------------------------------------------------
# Install runtime system dependencies
#   git / openssh-client / bash — for github_tool, ssh_tool, docker_deploy_ssh_tool,
#     and general shell compatibility for run_command_tool.
#   dcron — provides the `crontab` binary that schedule_task_tool shells out to
#     (Alpine's busybox crond doesn't ship one by default).
#   ca-certificates — required for HTTPS calls from the container.
# ---------------------------------------------------------------------------
# hadolint ignore=DL3018
RUN apk add --no-cache \
    bash \
    ca-certificates \
    dcron \
    git \
    openssh-client

WORKDIR /opt/devnull

# Copy node_modules from builder stage (already pruned of devDependencies)
# This avoids re-running npm install in the runtime stage, which would need
# to compile native addons (better-sqlite3) from source on Alpine.
COPY --from=builder /build/node_modules ./node_modules

# Copy compiled output from builder
COPY --from=builder /build/dist ./dist

# Copy agent skills, protocol, and config (fallback for DEVNULL_HOME)
COPY agent ./agent

# Copy env example (user provides real .env at runtime)
COPY .env.example ./

# Symlink onto PATH so `devnull` works as a bare command inside the container
RUN ln -s /opt/devnull/dist/cli/index.js /usr/local/bin/devnull \
    && chmod +x /opt/devnull/dist/cli/index.js

# ---------------------------------------------------------------------------
# Environment defaults
#   DEVNULL_HOME — lets SkillRegistry/protocol/config fall back to the built-in
#     skills, devnull.md protocol, and default llm.yaml when the mounted workspace
#     doesn't have its own agent/ directory.
#   DEVNULL_API_PORT — default port for the API server.
#   NODE_ENV — production by default; override for development.
#   DATABASE_TYPE — SQLite by default (zero-config, file-based).
# ---------------------------------------------------------------------------
ENV DEVNULL_HOME=/opt/devnull \
    DEVNULL_API_PORT=3001 \
    NODE_ENV=production \
    DATABASE_TYPE=sqlite

# ---------------------------------------------------------------------------
# Create non-root user and set up data directory
# ---------------------------------------------------------------------------
RUN addgroup -S devnull \
    && adduser -S devnull -G devnull \
    && mkdir -p /data \
    && chown -R devnull:devnull /opt/devnull /data

USER devnull

# ---------------------------------------------------------------------------
# Volumes
#   /workspace — mount your project as the workspace devnull operates on
#   /data      — persistent SQLite database volume
# ---------------------------------------------------------------------------
VOLUME ["/workspace", "/data"]

EXPOSE 3001

# ---------------------------------------------------------------------------
# Healthcheck — verify the API server is responding
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/v1/health', r => {process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# ---------------------------------------------------------------------------
# Default command — show help when no arguments are provided
# ---------------------------------------------------------------------------
ENTRYPOINT ["node", "/opt/devnull/dist/cli/index.js"]
CMD ["--help"]
