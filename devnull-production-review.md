# devnull — Production Readiness Review

Reviewed: full project dump (140 files, `index.json` + 3 `.dump` files) for the `devnull` ReAct CLI agent.

**Bottom line: this is not ready to deploy.** The blockers aren't subtle logic bugs — they're missing pieces of the distribution itself (no `Dockerfile`, no `scripts/`, no `migrations/`, no protocol doc) plus one confirmed functional bug that breaks the SQLite backend outright. Below is each issue you listed, in order, with file:line references.

---

## 1. Build

`package.json` defines these scripts:

```
package:build      → bash scripts/build.sh --compile
package:validate   → bash scripts/build.sh --validate
package:tarball    → bash scripts/build.sh --tarball
package:docker     → bash scripts/build.sh --docker
package:all        → bash scripts/build.sh --all
setup              → bash scripts/setup.sh
install            → bash scripts/install.sh
install:docker     → bash scripts/install-docker.sh
init-db            → bash scripts/init-db.sh
```

**None of `scripts/build.sh`, `scripts/setup.sh`, `scripts/install.sh`, `scripts/install-docker.sh`, or `scripts/init-db.sh` exist anywhere in the indexed project.** I confirmed this against `index.json` directly (140/140 files accounted for, zero under a `scripts/` path). Every packaging entry point in `package.json` is a dangling reference.

The plain `build` script (`tsc -p tsconfig.json`) and `dev`/`start`/`test` scripts are fine as far as they go — but nothing that actually produces a shippable artifact (tarball, Docker image, installed service) currently works, because the shell scripts that do that work were never committed or were dropped from this export.

**Fix:** either these scripts genuinely don't exist yet (write them), or they exist locally and weren't included in this dump — check the actual repo/working tree before assuming the export is complete. Either way, nothing downstream (§2, §4) can be validated until this is resolved.

---

## 2. `--docker --deploy` and `--remote`

### 2a. No Dockerfile, no docker-compose.yml
There's a `.dockerignore` and `ui/.dockerignore`, implying a Docker build context exists somewhere — but there is **no `Dockerfile`** (root or `ui/`) and **no `docker-compose.yml`** anywhere in the project.

`src/tools/dockerComposeDeployTool.ts` runs `docker compose up -d --build` in whatever directory it's given:

```ts
const child = spawn("docker", ["compose", "up", "-d", "--build"], {
  cwd: targetDir, ...
```

With no `docker-compose.yml` present, this will fail immediately with a "no configuration file provided" error every time the agent (or a human) invokes docker deploy. This is a distribution problem, not a logic bug in the tool itself — the tool is written correctly for a compose file that doesn't ship.

### 2b. Remote deploy: SSH host key verification is disabled
**`deploy_remote.py`** (line ~371):
```python
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
```
`AutoAddPolicy` silently trusts and stores *any* host key on first connect — there's no verification against a known_hosts file or pinned fingerprint. This is a real MITM exposure for a script whose entire job is pushing your workspace and secrets to a remote Docker host over SSH.

**`src/remote/sshConnection.ts`** has the same gap, just via a different library — the `ssh2` `Client.connect()` call has no `hostVerifier` callback set, so ssh2's default behavior (no verification at all) applies:
```ts
conn.on("ready", ...).connect({ ... });   // no hostVerifier
```
Both the Python remote-deploy path and the TypeScript SSH tool path need this fixed the same way — pin against a known-hosts file (or accept a fingerprint the operator supplies) and reject on mismatch, don't auto-trust.

### 2c. Password-based auth is a first-class option
`deploy_remote.py` accepts `--password` / `REMOTE_SSH_PASSWORD`. Combined with 2b (no host verification), a password sent over an unverified connection is a straightforward credential-interception risk. Recommend making key-based auth the default and treating password auth as a discouraged fallback with a warning printed to stderr.

**Net effect:** `--docker --deploy` will fail on a fresh checkout (no compose file to build from), and `--remote` works but with a security posture (auto-trust host keys) that shouldn't go near a production host.

---

## 3. SQLite implementation — the error, found

This one has a definite root cause. **Every table-creation call in the codebase bundles a `CREATE TABLE` and a `CREATE INDEX` in a single SQL string**, e.g. `src/db/initialize.ts`:

```ts
await db.query(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, ...
  );

  CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
`);
```

This pattern repeats for every table in `initialize.ts`, and again independently in `src/api/taskHistoryStore.ts`, `phaseReportStore.ts`, `wbsStore.ts`, `postgresProjectStore.ts`, and `planStore.ts`.

For Postgres (`pg`), this is fine — `pg`'s simple query protocol happily runs multiple semicolon-separated statements in one call. **For `better-sqlite3`, it is not fine.** `Database.prototype.prepare()` only accepts a single statement; a string containing two statements throws (`"The supplied SQL string contains more than one statement"`). `src/db/sqliteClient.ts` funnels every non-SELECT/INSERT/UPDATE/DELETE statement (which is what a `CREATE TABLE` falls into) through exactly that call path:

```ts
} else {
  // Other statements (CREATE, ALTER, PRAGMA, etc.)
  const stmt = this.db.prepare(translated);   // <-- throws on the 2-statement strings above
  ...
}
```

And because `query()` wraps everything in try/catch and only `console.warn`s on failure:

```ts
} catch (err) {
  console.warn("[SqliteClient] Query failed:", ...);
  return { rows: [], rowCount: 0 };
}
```

**the table never actually gets created, the app doesn't crash, and every subsequent query against that table silently returns `{rows: [], rowCount: 0}` instead of an error the caller can act on.** That matches "sqlite implementation shows error" — you're almost certainly seeing a stream of `[SqliteClient] Query failed: ...` warnings in the logs, with empty results everywhere, rather than one obvious exception.

**Fix:** split every `CREATE TABLE ...; CREATE INDEX ...;` combo into two separate `db.query()` calls (or make `SqliteClient.query()` detect multi-statement input and run it through `this.db.exec(translated)` instead of `.prepare()` — `exec()` supports multiple statements but doesn't support parameter binding or return `.run()`-style metadata, so it should only be used for the no-params DDL path).

### Other SQLite-dialect issues worth fixing while you're in there
- **`migrations.ts` expects a `migrations/sqlite/` and `migrations/postgres/` directory** (`MIGRATIONS_ROOT = path.resolve(__dirname, "..", "..", "migrations")`) that **doesn't exist anywhere in the project**. `runMigrations()` silently logs "No migration files found" and does nothing — so in practice all schema creation currently depends entirely on the ad-hoc `CREATE TABLE IF NOT EXISTS` calls in `initialize.ts` and the individual stores, not on the migration system the code comments describe. Either the migrations directory needs to ship, or the doc comments describing it as the source of truth are aspirational and should say so.
- **`ILIKE` → `LIKE` translation drops case-insensitivity.** The comment in `sqliteClient.ts` says it uses `COLLATE NOCASE`, but the actual regex just does `result.replace(/\bILIKE\b/gi, "LIKE")` — no `COLLATE NOCASE` is added. Any query written with `ILIKE` for a case-insensitive search will silently become case-sensitive on SQLite.
- **`RETURNING *` is stripped, not translated**, so any store that does `INSERT ... RETURNING *` and reads the returned row (e.g. to get a generated ID or timestamp) will get back an empty row set on SQLite while working fine on Postgres — a correctness divergence between backends, not just an SQLite-only bug. Worth grepping call sites that consume `.rows[0]` after an insert to confirm they have a SQLite-safe fallback.
- No handling for Postgres JSON operators (`->`, `->>`, `@>`) if any store uses them — the regex translator doesn't touch these, so they'd pass through unchanged and fail against SQLite's own JSON1 syntax.

---

## 4. UI / API / Docker setup validation

- **API server binds `0.0.0.0` by default** (`src/api/server.ts`) with **wide-open CORS** (`app.use(cors())`, no origin allowlist). For a production deploy this should have an explicit allowed-origins list (e.g. from an env var), not the permissive default.
- **Auth tokens are in-memory only** (`src/api/auth.ts`: `const tokenStore = new Map<string, TokenEntry>()`), with **no expiry** — a token is valid forever once issued (`createdAt` is recorded but nothing ever checks it). In a Docker deployment this also means every container restart invalidates all sessions, and if you ever run more than one API replica, tokens issued by one instance won't validate against another. Given the app already has a full DB layer, tokens (or at least a shared session store) should live there, not in process memory, and should carry a TTL.
- **Password hashing uses salted SHA-256**, not a slow/adaptive hash (bcrypt/scrypt/argon2). The salt is a good instinct but SHA-256 is fast by design, which is exactly the wrong property for password storage — recommend switching to bcrypt or argon2 before this goes anywhere near real user accounts.
- **`agent/devnull.md`, the "engineering protocol" file, does not exist in the project**, and `src/core/protocol.ts` (`loadProtocol()`) falls back to `undefined` silently if it's missing, both from the workspace and from a `DEVNULL_HOME` Docker-baked copy (which also can't exist, since there's no Dockerfile to bake it in — see §2a). Concretely: `buildProtocolPrompt()` will currently return an **empty string**, meaning the ReAct agent runs with no system-level engineering protocol at all, with no error or warning surfaced anywhere. This is worth checking first — if this file is meant to define core agent behavior, its absence would explain a lot of "the agent isn't following the rules I expect" symptoms, and it fails completely silently.
- **UI**: `ui/` is a separate Vite/React project with its own `package.json`/`.dockerignore`, "built independently, served via nginx" per the root `.dockerignore` comment — but there's no nginx config or Dockerfile for it either, consistent with the gap in §2a. Can't validate the actual served setup until that exists.

---

## 5. ReAct loop validation

The core loop (`src/core/orchestrator.ts`, ~1700 lines) is structurally sound and has some genuinely good design already in place:

- `contextCompaction.ts` correctly collapses **stale** file-read observations while preserving the assistant's `tool_calls`/`reasoning_content` verbatim — this respects DeepSeek's thinking-mode requirement that reasoning tied to a tool call must be echoed back unchanged, which is easy to get wrong and isn't here.
- `duplicateActionDetector.ts` / `stepScorer.ts` give a cheap, deterministic (no extra LLM call) per-step health score, specifically flagging *identical action → identical result* repeats without penalizing legitimate re-runs (e.g. re-running a test after a fix, which produces a different observation). That's the right definition of "duplicate" for a coding agent.
- `reactAuditor.ts` is a self-test harness that verifies bug fixes via independent, real verification (`verify(dir)` actually runs code) rather than trusting the agent's own claim of success — good practice, keep it in CI.

Two things worth checking, not confirmed as bugs given the scope of this review:
- `scoreStep()` calls `findDuplicateActions(state.callHistory)` on **every single step**, re-scanning and re-stringifying the *entire* call history each time. That's O(n²) over a long-running task. Fine for the maxIterations=20-ish default, but worth capping (e.g. only check against the last N calls) if you raise iteration ceilings.
- The iteration-limit "ask to continue" flow (`askContinue()`) auto-continues in non-interactive mode with just a log line — confirm that's the behavior you want for unattended/CI runs (it could silently keep spending tokens past what a human would have approved).

---

## 6. Making ReAct more token-efficient without losing effectiveness

You've already got the highest-leverage lever in place (stale file-read compaction). Beyond that, in order of expected impact:

1. **Cap tool-observation size, not just staleness.** `contextCompaction.ts` only removes *superseded* reads — a single very large file read (or a command with a huge stdout, e.g. a verbose test run) still sits in context at full size until it's superseded. Add a hard per-observation character/token cap with a "[truncated, N bytes omitted]" marker for large outputs (grep/glob/run_command results especially), independent of the staleness check.
2. **Summarize old iterations instead of just marking them stale.** Right now stale reads become a placeholder with no content. For long tasks, consider periodically collapsing entire early iterations (thought+action+observation) into a one-paragraph running summary once they're more than ~N iterations old, rather than keeping every individual message indefinitely. This is a bigger lift than #1 but pays off most on long tasks.
3. **Route by model tier more aggressively.** `llm.yaml` already does this well (fast/non-thinking `deepseek-v4-flash` by default, `deepseek-v4-pro` + high reasoning effort only for `rca`/`architect`/`pentester` skills) — this is the right pattern. Make sure any *new* skills you add default to the flash tier unless they specifically need deep reasoning; it's easy to accidentally default new skills to the expensive tier by copy-pasting a config block.
4. **Dedupe tool schemas sent per request.** If `toolSchemas.ts` sends the full tool/function definitions on every single API call (typical for OpenAI-compatible chat APIs), and the tool list is large, that's fixed overhead repeated every iteration. Worth checking whether DeepSeek's API supports tool-schema caching or whether trimming the tool list to only what's relevant for the current skill (via `skillRegistry.ts`) meaningfully shrinks the per-call payload.
5. **Time-boxed:** the `deepseek-chat` / `deepseek-reasoner` model strings are called out in `llm.yaml`'s own comment as deprecated **2026-07-24 15:59 UTC** — three days from now — with no fallback after that date. `llm.yaml` and `deepseekClient.ts` already point at the new `deepseek-v4-flash`/`deepseek-v4-pro` IDs, so the agent's runtime path looks fine. But **`summarize.mjs` still hardcodes `DEFAULT_MODEL = 'deepseek-chat'`** — that's the script that generates file/index summaries (and is very likely why `index.json` is full of `"purpose": "Purpose not determined (heuristic fallback...)"` entries already — it looks like this call path is already failing today). Fix this one regardless of the token-efficiency angle; it'll hard-fail in 3 days if it isn't already failing.

---

## Priority order if you fix these in sequence

1. `summarize.mjs` deprecated model string (breaks in 3 days, may already be silently failing).
2. SQLite multi-statement `CREATE TABLE`/`CREATE INDEX` bug (§3) — breaks the SQLite backend outright, silently.
3. Missing `scripts/`, `Dockerfile`, `docker-compose.yml`, `migrations/`, `agent/devnull.md` (§1, §2a, §3, §4) — confirm whether these are truly absent from the repo or just weren't captured in this export, since almost everything else downstream depends on them existing.
4. SSH host-key verification (§2b) before anyone runs `--remote` against a real host.
5. Auth hardening — token TTL/shared storage, CORS allowlist, bcrypt/argon2 (§4) — before exposing the API beyond localhost.
