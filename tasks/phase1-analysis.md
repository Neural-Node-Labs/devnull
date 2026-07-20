# Phase 1: Requirements & Constraints Analysis

## 1. Codebase Overview

**Project:** devnull — a ReAct CLI agent with hot-pluggable role skills
**Version:** 0.2.0
**License:** Proprietary (Copyright 2026 Sir John M. Nueva — All Rights Reserved)
**Language:** TypeScript (ESM), Node.js runtime
**Default LLM:** DeepSeek (deepseek-v4-flash / deepseek-v4-pro)

### Directory Structure

```
devnull/
├── src/                    # TypeScript source (~50 files)
│   ├── cli/index.ts        # CLI entry point
│   ├── core/               # Orchestrator, skill registry, protocol, goal validator
│   ├── tools/              # 12 tool implementations + dispatcher + schemas
│   ├── api/                # Express API server, auth, routes, stores
│   ├── llm/                # DeepSeek client + mock client
│   ├── config/             # LLM config loader
│   ├── indexing/           # Workspace indexer + ignore rules
│   ├── telemetry/          # File-based logging
│   ├── remote/             # SSH/SCP utilities
│   └── test/               # Standalone test suites (~18 files)
├── agent/                  # Skills, protocol, config (baked into Docker image)
│   ├── devnull.md          # Engineering protocol
│   ├── config/llm.yaml     # LLM backend config
│   └── skills/             # 13 hot-plug skills (each a SKILL.md)
├── ui/                     # React/TypeScript frontend
│   ├── src/                # React components, pages, API client
│   ├── Dockerfile          # Multi-stage nginx build
│   └── nginx.conf          # Reverse proxy config
├── tests/                  # Vitest unit tests + Playwright page tests
├── e2e/                    # Playwright E2E deployment tests
├── ui-test-suited/         # Comprehensive Playwright UI test suite
├── enhancement/            # Enhancement planning docs
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # API + UI + PostgreSQL services
├── package.json            # Root package (devnull CLI)
├── tsconfig.json           # TypeScript config
└── .dockerignore
```
