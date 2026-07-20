# Phase 4: Installation & Setup Scripting
Create the installation and setup mechanism: a script or set of instructions that installs the packaged artifact, sets up the runtime environment (e.g., creates directories, sets permissions, writes config files from templates), and handles first-run initialization (e.g., database setup, secret injection). Ensure idempotency — re-running setup should be safe.

**Task:** create a plan how we will package the software with out the sources code and with capability to install and setup write in DEPLOYMENT_PLAN.md

**Result:**

I see the WSL bash isn't available. Let me continue with the implementation using the write tool to update package.json and create the remaining files.

Let me update `package.json` with the new npm scripts:
  → Tool call: read_tool({"filePath": "package.json"})
  [Observation] {"content":"{\n  \"name\": \"devnull\",\n  \"version\": \"0.2.0\",\n  \"description\": \"A ReAct CLI agent with hot-pluggable role skills\",\n  \"type\": \"module\",\n  \"main\": \"dist/cli/index.js\",\n  \"bin\": {\n    \"devnull\": \"./dist/cli/index.js\"\n  },\n  \"scripts\": {\n    \"build\": \"tsc -p tsconfig.json\",\n    \"build:watch\": \"tsc -p tsconfig.json --watch\",\n    \"start\": \"node dist/cli/index.js\",\n    \"start:serve\": \"node dist/cli/index.js --serve\",\n    \"package:tarball\": \"node scripts/create-deploy-tarball.mjs\",\n    \"package:docker\": \"docker build -t devnull:latest .\",\n    \"package:all\": \"npm run build && npm run package:tarball && npm run package:docker\",\n    \"test\": \"vitest run --config tests/vitest.config.ts\",\n    \"test:watch\": \"vitest --config tests/vitest.config.ts\",\n    \"test:iteration-stopping\": \"node dist/test/testIterationStopping.js\",\n    \"test:goal-validator\": \"node dist/test/testGoalValidator.js\",\n    \"test:react-auditor\": \"node dist/test/testReactAuditor.js\",\n    \"test:live-diagnostics\": \"node dist/test/testLiveDiagnosticsHarness.js\",\n    \"test:deepseek-contract\": \"node dist/test/testDeepSeekContract.js\",\n    \"test:tool-loop\": \"node dist/test/testToolLoop.js\",\n    \"lint\": \"echo 'Lint not configured yet'\",\n    \"clean\": \"rm -rf dist/\"\n  },\n  \"dependencies\": {\n    \"archiver\": \"^7.0.1\",\n    \"commander\": \"^12.1.0\",\n    \"deepmerge\": \"^4.3.1\",\n    \"dotenv\": \"^16.4.5\",\n    \"express\": \"^4.21.0\",\n    \"js-yaml\": \"^4.1.0\",\n    \"node-fetch\": \"^3.3.2\",\n    \"pg\": \"^8.13.0\",\n    \"ssh2\": \"^1.16.0\",\n    \"uuid\": \"^10.0.0\"\n  },\n  \"devDependencies\": {\n    \"@playwright/test\": \"^1.47.0\",\n    \"@types/archiver\": \"^6.0.2\",\n    \"@types/express\": \"^4.17.21\",\n    \"@types/js-yaml\": \"^4.0.9\",\n    \"@types/node\": \"^20.14.0\",\n    \"@types/node-fetch\": \"^2.6.11\",\n    \"@types/pg\": \"^8.11.10\",\n    \"@types/ssh2\": \"^1.15.0\",\n    \"@types/uuid\": \"^10.0.0\",\n    \"typescript\": \"^5.5.0\",\n    \"vitest\": \"^2.0.0\"\n  },\n  \"engines\": {\n    \"node\": \">=20.0.0\"\n  },\n  \"license\": \"MIT\"\n}\n"}

**Stats:**
- Tokens: 949,149
- Iterations: 21
