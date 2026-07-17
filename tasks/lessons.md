# Lessons Learned

## 2025-07-17: Missing Authorization Header in UI Tests

**Problem:** `ui-test-suited/health.spec.ts` tests failed with `{"success":false,"error":"Missing Authorization header"}` because the API server had `DEVNULL_API_KEY` set but the Playwright test runner didn't have it in its environment.

**Root cause:** The `authHeaders()` function read `process.env.DEVNULL_API_KEY` and returned an empty object when the env var wasn't set. The API server required Bearer auth but the tests weren't sending it.

**Fix:** Added auto-detection logic (`resolveApiToken()`) that:
1. Checks `process.env.DEVNULL_API_KEY` first
2. Probes the API health endpoint without auth using Node.js `http` module
3. Caches the result in a module-level variable via `test.beforeAll()`

**Lesson:** When writing tests that make API calls to an auth-protected service, don't assume the test runner has the same environment variables as the service. Use auto-detection (probe without auth first) to determine whether auth is needed, rather than requiring manual env var configuration.

## 2025-07-17: Login-Based Token Auth Replaces Static API Key

**Problem:** The old `DEVNULL_API_KEY` system required the same static key to be shared between the API server and all clients. The UI had no way to obtain a token — it needed the key pre-configured.

**Solution:** Replaced static `DEVNULL_API_KEY` with a login-based token system:
1. `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars define the default admin credentials
2. `POST /api/v1/login` accepts credentials and returns a generated token (crypto.randomUUID)
3. Auth middleware validates tokens from an in-memory store
4. Backward compatible: if `ADMIN_PASSWORD` is not set, API runs in open-access mode

**Key design decisions:**
- Login endpoint is excluded from auth middleware (uses `req.path === "/login"` check)
- Token store is in-memory (Map) — simple, no DB dependency, tokens are ephemeral
- `isAuthEnabled()` checks for `ADMIN_PASSWORD` being set (not `DEVNULL_API_KEY`)
- Tests auto-detect auth mode: if `ADMIN_PASSWORD` is set, they login first to get a token

## 2025-07-17: Fallback Error Message Buried the Actual Failure Reason

**Problem:** When both `DEEPSEEK_API_KEY` and `ANTHROPIC_API_KEY` were missing, the error message said `"Fallback provider anthropic missing ANTHROPIC_API_KEY; cannot complete request."` — the actual error (missing `DEEPSEEK_API_KEY`) was buried in the middle of the message.

**Fix:** Reordered the error message so the **primary failure reason** comes first:
- Before: `"Fallback provider anthropic missing ANTHROPIC_API_KEY; cannot complete request. Original failure: missing DEEPSEEK_API_KEY. Request payload: {...}"`
- After: `"Primary LLM call failed: missing DEEPSEEK_API_KEY. Fallback provider anthropic also unavailable (missing ANTHROPIC_API_KEY). Request payload: {...}"`

**Lesson:** When composing error messages across a fallback chain, surface the **root cause** (primary failure) first, not the last link in the chain. The user needs to see what actually went wrong immediately, not after parsing secondary context.

## 2025-07-17: Plan Mode Must Be Exposed as a Two-Phase API for UI Integration

**Problem:** The CLI's plan mode worked fine (generate plan → show on console → wait for stdin yes/no → execute), but the UI had no way to participate in this flow. The `/chat` endpoint was a single synchronous call that either ran plan mode (blocking on stdin) or skipped it entirely.

**Solution:** Split the chat flow into two API endpoints:
1. `POST /api/v1/chat/plan` — generates the plan via `orchestrator.generatePlan()` and returns it with a session ID
2. `POST /api/v1/chat/execute` — takes a session ID and executes the task with `planMode: "never"` (plan already done)

**Key design decisions:**
- In-memory session store (Map) for plan state — simple, no DB dependency, sessions are ephemeral
- Session is deleted after execution to prevent replay
- `generatePlan()` extracted as a public method from `runPlanMode()` so the API can call it without interactive prompts
- UI defaults to `planMode: "always"` to ensure plans are always shown

**Lesson:** When building a UI for a CLI-native tool, identify all interactive prompts (stdin yes/no) and expose them as API endpoints with session state. Don't assume the UI can participate in a synchronous request-response flow when the backend needs user input mid-execution.

## 2025-07-17: UI Must Have Proper Auth Flow — Login Page + Token Management + Route Guards

**Problem:** The UI had no authentication. The `api/client.ts` never sent auth tokens. The AdminPage had a broken "first login" flow that called `api.createUser()` instead of `api.login()`. Anyone could access all pages including admin functions.

**Root cause:** The backend had a proper login-based token auth system (`POST /api/v1/login` + Bearer token middleware), but the UI was never updated to use it. The client code had no token storage, no auth headers, and no route protection.

**Fix:** Implemented a complete auth flow:
1. **AuthContext** — React context providing `isAuthenticated`, `isAdmin`, `login()`, `logout()` to all components
2. **LoginPage** — Form that calls `POST /api/v1/login` and stores the token in localStorage
3. **ProtectedRoute** — Route guard that redirects to `/login` if not authenticated, supports `requireAdmin` prop
4. **Token management in client.ts** — All API requests now include `Authorization: Bearer <token>` header; 401/403 responses auto-clear auth state
5. **Role-based nav** — Admin link only shown to admin users; admin-only routes protected by `ProtectedRoute requireAdmin`

**Lesson:** When the backend has an auth system, the UI must be updated in lockstep. Don't leave the UI without auth headers, token management, and route guards. The three pieces needed are: (1) a login page, (2) a context/provider for auth state, and (3) route guards that check auth state before rendering protected pages.
