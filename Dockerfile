# syntax=docker/dockerfile:1

# ---- builder: compile TypeScript, includes devDependencies ----
FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: minimal image, production deps only, non-root ----
FROM node:20-alpine

# git/openssh/bash for github_tool, ssh_tool, docker_deploy_ssh_tool, and general shell
# compatibility for run_command_tool. dcron provides the `crontab` binary schedule_task_tool
# shells out to (Alpine's busybox crond doesn't ship one by default).
# Exact apk version pins require querying Alpine's package index for this base image tag,
# which needs registry access to verify from here; if you need fully reproducible builds,
# pin these after your first build via `docker run devnull apk info -v`.
# hadolint ignore=DL3018
RUN apk add --no-cache git openssh-client bash dcron

WORKDIR /opt/devnull
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /build/dist ./dist
COPY agent ./agent
COPY .env.example ./

# Symlink onto PATH so `devnull` works as a bare command inside the container.
RUN ln -s /opt/devnull/dist/cli/index.js /usr/local/bin/devnull \
    && chmod +x /opt/devnull/dist/cli/index.js

# DEVNULL_HOME lets SkillRegistry/protocol/config fall back to the 13 built-in skills,
# devnull.md protocol, and default llm.yaml when the mounted workspace doesn't have its own
# agent/ directory -- see src/core/skillRegistry.ts, src/core/protocol.ts, src/config/loadConfig.ts.
ENV DEVNULL_HOME=/opt/devnull

RUN addgroup -S devnull && adduser -S devnull -G devnull \
    && mkdir -p /workspace \
    && chown -R devnull:devnull /workspace /opt/devnull

USER devnull
WORKDIR /workspace

ENTRYPOINT ["node", "/opt/devnull/dist/cli/index.js"]
CMD ["--help"]
