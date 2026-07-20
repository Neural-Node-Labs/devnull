# devnull Test Suite

Organized test suite covering all testable functionality of the devnull system.

## Structure

```
tests/
├── README.md              # This file
├── vitest.config.ts       # Vitest configuration for all tests
├── run-all.sh             # Script to run all tests
│
├── unit/                  # Pure unit tests (no external dependencies)
│   ├── contextCompaction.test.ts
│   ├── goalValidator.test.ts
│   ├── stepScorer.test.ts
│   ├── skillRegistry.test.ts
│   ├── protocol.test.ts
│   ├── workspaceManager.test.ts
│   ├── taskHistory.test.ts
│   ├── config.test.ts
│   ├── auth.test.ts
│   ├── llmKeyStore.test.ts
│   ├── projectStore.test.ts
│   └── dockerDeploySshTool.test.ts
│
├── integration/           # Integration tests (require Docker/Postgres)
│   ├── api.test.ts        # Full API endpoint tests against running server
│   ├── postgres.test.ts   # Postgres store tests
│   └── docker.test.ts     # Docker compose lifecycle tests
│
├── e2e/                   # End-to-end tests (require full stack running)
│   ├── ui.test.ts         # Playwright UI tests
│   └── cli.test.ts        # CLI invocation tests
│
└── fixtures/              # Test fixtures and helpers
    ├── mockLlm.ts         # Mock LLM client
    ├── testServer.ts      # Test API server helper
    └── testData.ts        # Shared test data
```

## Running Tests

```bash
# Run all unit tests
npx vitest run --config tests/vitest.config.ts

# Run specific test file
npx vitest run tests/unit/contextCompaction.test.ts --config tests/vitest.config.ts

# Run integration tests (requires Docker stack running)
npx vitest run tests/integration/ --config tests/vitest.config.ts

# Run all tests
bash bash tests/run-all.sh
```
