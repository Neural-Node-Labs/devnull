# ui-test-suited

Back-to-back UI test suite for **devnull** using [Playwright](https://playwright.dev/).

Covers the full feature surface defined in [`ui.md`](../ui.md): chat, project management,
settings, telemetry, admin panel, and diagnostics — plus API health checks.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Playwright browsers** installed (see below)
- The **devnull API** running at `http://localhost:3001`
- The **devnull UI** running at `http://localhost:8080`

> Start both services via Docker:
> ```bash
> docker compose --profile serve up -d
> ```
> This starts the API on port 3001 and the UI on port 8080.

---

## Setup

```bash
cd ui-test-suited
npm install
npx playwright install chromium
```

This installs the Playwright test runner and the Chromium browser (the default project target).

---

## Running Tests

### Run the full suite

```bash
npm test
```

### Run a specific spec file

```bash
npx playwright test health.spec.ts
npx playwright test chat-flow.spec.ts
npx playwright test project-management.spec.ts
```

### Run tests in headed mode (see the browser)

```bash
npm run test:headed
```

### Run tests with the Playwright debugger

```bash
npm run test:debug
```

### Generate and view the HTML report

```bash
npm run test:report
npm run show-report
```

---

## Test Structure

| Spec File | Coverage |
|---|---|
| `health.spec.ts` | API health check, skills listing, error handling (400/404), telemetry endpoints |
| `homepage.spec.ts` | UI loads, title, root mount point, JS/CSS assets, navigation, console errors |
| `chat-flow.spec.ts` | Message input, send button, voice/listen, file upload, chat history |
| `project-management.spec.ts` | Project CRUD, active project selection, workspace browser, download/delete, LLM context toggle |
| `settings.spec.ts` | User CRUD, password change, LLM key management |
| `telemetry.spec.ts` | Searchable logs, reason-action-observation, command execution, token usage, log type selector |
| `admin.spec.ts` | Admin user creation, user management, role editing, user deletion, admin-only visibility |
| `diagnostic.spec.ts` | React testing, tools/skills/directives testing, run test button, pass/fail results |

---

## Configuration

The Playwright config (`playwright.config.ts`) sets:

| Setting | Value |
|---|---|
| `baseURL` | `http://localhost:8080` |
| Timeout | 30s per test, 10s per assertion |
| Screenshots | On failure only |
| Trace | Retained on failure |
| Reporter | List (console) + HTML report |

The API base URL is hardcoded to `http://localhost:3001` in `health.spec.ts`. Adjust if your
API runs on a different port.

---

## Writing Tests

- Use **role-based locators** (`getByRole`, `getByLabel`, `getByText`) over CSS selectors tied
  to implementation details.
- Every interaction should end in an `expect()` that proves the flow succeeded.
- Use `test.describe` to group by feature/page.
- Use `test.beforeEach` for navigation to the page under test.

---

## CI Integration

Example GitHub Actions workflow:

```yaml
name: UI Tests
on: [push, pull_request]
jobs:
  ui-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Start services
        run: docker compose --profile serve up -d
      - name: Install Playwright
        working-directory: ui-test-suited
        run: |
          npm ci
          npx playwright install chromium
      - name: Run tests
        working-directory: ui-test-suited
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: ui-test-suited/playwright-report/
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `net::ERR_CONNECTION_REFUSED` | UI/API not running | `docker compose --profile serve up -d` |
| `locator not found` | UI element selector mismatch | Check the actual DOM; update locator |
| Tests pass locally but fail in CI | Timing issue | Add `expect().toBeVisible()` waits instead of `waitForTimeout` |
| `Browser not installed` | Missing Playwright browsers | `npx playwright install chromium` |
