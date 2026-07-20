# syntax=docker/dockerfile:1

# =============================================================================
# Build args — override to pin a specific base image digest for reproducibility.
# To pin: docker build --build-arg NODE_IMAGE=node:20-alpine@sha256:<real-digest> .
# Get the current digest: docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine
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
    org.opencontainers.image.licenses="LicenseRef-Proprietary"

WORKDIR /build

# Copy dependency manifests first for layer caching
# Use npm install (not npm ci) because package-lock.json may have
# platform-specific optional deps that differ between build host and target.
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# =============================================================================
# Stage 2 — runtime: minimal image, production deps only, non-root
# =============================================================================
FROM ${NODE_IMAGE}

LABEL \
    org.opencontainers.image.title="devnull" \
    org.opencontainers.image.description="devnull ReAct CLI agent — runtime image" \
    org.opencontainers.image.source="https://github.com/neural-node-labs/devnull" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.authors="Sir John M. Nueva" \
    org.opencontainers.image.licenses="LicenseRef-Proprietary"
    org.opencontainers.image.base.name="${NODE_IMAGE}"

# ---------------------------------------------------------------------------
# Install runtime system dependencies
# git / openssh-client / bash — for github_tool, ssh_tool, docker_deploy_ssh_tool,
#   and general shell compatibility for run_command_tool.
# dcron — provides the `crontab` binary that schedule_task_tool shells out to
#   (Alpine's busybox crond doesn't ship one by default).
# ca-certificates — required for HTTPS calls from the container.
# ---------------------------------------------------------------------------
# hadolint ignore=DL3018
RUN apk add --no-cache \
    bash \
    ca-certificates \
    dcron \
    git \
    openssh-client

WORKDIR /opt/devnull

# Install production Node dependencies
# Use npm install instead of npm ci because package-lock.json may have
# platform-specific optional deps (e.g. @emnapi/* for @rolldown) that differ
# between the build host (Windows) and the Docker target (Linux).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

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
# DEVNULL_HOME — lets SkillRegistry/protocol/config fall back to the 13 built-in
#   skills, devnull.md protocol, and default llm.yaml when the mounted workspace
#   doesn't have its own agent/ directory.
# NODE_ENV — production by default; override for development.
# ---------------------------------------------------------------------------
ENV DEVNULL_HOME=/opt/devnull \
    DEVNULL_API_PORT=3001 \
    NODE_ENV=production

EXPOSE 3001

# ---------------------------------------------------------------------------
# Healthcheck for API server mode (docker compose up -d --serve)
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/v1/health', r => {process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# ---------------------------------------------------------------------------
# Non-root user
# ---------------------------------------------------------------------------
RUN addgroup -S devnull && adduser -S devnull -G devnull \
    && mkdir -p /workspace/.log \
    && chown -R devnull:devnull /workspace /opt/devnull

USER devnull
WORKDIR /workspace

ENTRYPOINT ["node", "/opt/devnull/dist/cli/index.js"]
CMD ["--help"]

