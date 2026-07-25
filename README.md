# devnull — fixes from the review

Drop these into the matching paths in your repo (they preserve the original structure).
Each file is a complete, drop-in replacement — not a diff.

**Verified, not just reviewed:** every file here was overlaid onto your actual extracted
project, run through `npx tsc -p tsconfig.json --noEmit` (clean, exit 0) and `npx vitest run`
against your real test suite (66 passed / 5 failed — identical to the unmodified baseline, so
zero regressions; the 5 failures are pre-existing and unrelated: 1 in `toolDispatcher.test.ts`'s
`safeParseJson`, 4 in `indexing.test.ts` from a `.agent/index` temp-dir path issue). The new
`ssrfGuard.ts` logic was also runtime-tested directly (10 cases: metadata/private/localhost
blocked by default, correctly allowed only where `allowPrivate` is deliberately set, wrong
schemes rejected, public IPs allowed) — not just type-checked.

## Cross-platform (Windows/Linux)

- **`scripts/run-bash.mjs`** (new) — cross-platform launcher for `scripts/*.sh`. Unchanged on
  Linux/macOS. On Windows, looks for Git Bash / WSL's `bash.exe`; if none found, prints an
  actionable message instead of a raw ENOENT.
- **`package.json`** — `"install": "bash scripts/install.sh"` was overriding npm's own install
  lifecycle, so plain `npm install` failed immediately on native Windows. Renamed to
  `"postinstall"`; every remaining bash-dependent script routes through `run-bash.mjs`.
- **`src/tools/scheduleTool.ts`** — hard-coded `bash`/`sleep`/`crontab`. Added a Windows branch:
  `schtasks` for recurring jobs, PowerShell `Start-Sleep` for one-off delayed jobs.
- **`setEnv.cmd`** — echoed secret values to console (now only names); used `setlocal`, which
  discarded everything it set the moment the script ended even when run directly in a terminal
  (removed, so it now actually does what it claims to).
- **`.github/workflows/ci.yml`** — added `windows-latest` to the lint/typecheck/test job's
  matrix (the job that would've caught the two bugs above). Build/Docker/deploy jobs stay
  Linux-only since their targets are Linux containers regardless.
- **`Dockerfile`** — `npm install` triggers the `postinstall` bash script (pre-existing, ran as
  `"install"` before), but `node:20-alpine` doesn't ship bash by default — so this Docker build
  was already broken by that lifecycle hook before this review even started, it just never
  surfaced since the Docker jobs in CI never got exercised against it in a way that would catch
  it. Added `apk add bash`. Also pruned devDependencies before the runtime stage (smaller image,
  less attack surface — devDependencies like typescript/vitest were shipping into production).

**Still not included:** `scripts/build.sh`, `scripts/setup.sh`, `scripts/install.sh`,
`scripts/install-docker.sh`, `scripts/init-db.sh`, `scripts/smoke-test-standalone.sh` — never
uploaded, only referenced by `package.json`/`ci.yml`. Upload them and I'll check their internals.

## Security

- **`src/tools/sshHostVerifier.ts`** (new) + **`src/tools/sshTool.ts`** + **`src/remote/sshConnection.ts`**
  — TWO separate ssh2 connection paths had no real host-key verification: `sshTool.ts` used
  `hostVerifier: () => true` (accepts anything), and `sshConnection.ts` set no `hostVerifier` at
  all (ssh2's default with none set is the same "accept anything" behavior). Both now use a
  shared trust-on-first-use verifier — first connection to a host:port is recorded, a later
  connection with a *different* key is rejected and logged — matching the
  `StrictHostKeyChecking=accept-new` model the shell-out (key-auth) path already used correctly.
- **`src/tools/ssrfGuard.ts`** (new) + **`summarizeUrlTool.ts`** + **`siteCrawlerTool.ts`** +
  **`crawlPlaywrightTool.ts`** + **`apiTestTool.ts`** — these tools `fetch()`/`page.goto()`ed an
  LLM-supplied URL with zero validation, meaning a task (or content the agent crawled and then
  acted on) could point them at cloud metadata endpoints (`169.254.169.254`), internal services,
  or `localhost`, with the result fed straight back into the agent's context. Two-layer fix:
  `assertSafeToFetch()` resolves the hostname via a real DNS lookup (not just string matching,
  to close the DNS-rebinding bypass) and blocks loopback/private/link-local/metadata ranges;
  `safeFetch()` re-validates on **every redirect hop**, since a URL can pass the initial check
  and then 302 to an internal address — plain `fetch`'s default (and this code's explicit)
  `redirect: "follow"` would've silently followed that without ever re-checking.
  `apiTestTool.ts` opts into `allowPrivate: true` since it's explicitly a dev tool for testing
  the user's *own* local APIs — blocking `localhost` there would break its actual purpose;
  metadata/link-local/multicast stay blocked even with that flag, since there's no legitimate
  "test my local API" reason to ever hit a cloud metadata endpoint.
- **`crawlPlaywrightTool.ts`** — the generated Playwright test file interpolated the crawled
  `url` completely unescaped into `page.goto('${url}')` — a crafted URL could break out of the
  string literal and inject arbitrary code into the generated `.ts` file (which someone might
  later run in CI without a careful review). Fixed by routing it through the file's own
  `escaped()` helper — which itself only escaped quotes, not backslashes, so also fixed that
  (backslashes now escaped first, then quotes).
- **`src/api/auth.ts`** + **`src/api/routes.ts`** — scrypt instead of salted SHA-256 for
  passwords (with transparent re-hash on next login), `crypto.timingSafeEqual` instead of `===`
  for hash comparison, and bearer tokens now expire after 24h instead of never.
- **`src/tools/workspacePath.ts`** (new) + **`readTool.ts`** + **`writeEditTool.ts`** — no path
  containment meant an absolute or `../`-escaping path could read/write outside the task
  workspace. Both now resolve through `resolveWithinWorkspace()`, which throws on escape.
- **`src/api/fileUserStore.ts`** (new) + **`src/api/routes.ts`** — `storedUsers` was in-memory
  only (the code had a comment acknowledging it: *"in-memory for now, but structured for DB
  migration"*) — every restart wiped all users. Fixed with the same file-based convention
  already used elsewhere (`llmKeyStore.ts`), at `~/.devnull/users.json`. If you want this on
  Postgres/`src/db` instead, that's a bigger, separate change needing your input on schema/
  migration conventions.
- **`src/util/filePermissions.ts`** (new) + **`llmKeyStore.ts`** + **`fileUserStore.ts`** +
  **`sshHostVerifier.ts`** — `mode: 0o600` is a no-op on Windows/NTFS, so these files were
  readable by any other local account on Windows despite the mode argument implying otherwise.
  Added a shared `icacls`-based restriction, best-effort (logs and continues if it fails).
- **`src/core/goalValidator.ts`** + **`src/core/orchestrator.ts`** — the validator's fail-open
  case (unparseable JSON response → defaults to `valid: true`) was indistinguishable from a
  genuine pass anywhere downstream. Added an explicit `failedOpen` flag, surfaced as a distinct
  warning in telemetry + console instead of silently blending into a normal validation pass.

## Token efficiency / DeepSeek

- **`src/tools/toolSchemaFilter.ts`** (new) + **`src/core/orchestrator.ts`** — every LLM call
  sent all 25 tool schemas (~5,750 tokens) regardless of the routed skill.
  `SkillHeader.requires_tools` already existed but was unused. `filterToolsForSkills()` now uses
  it: core tools always included, skill-declared tools added, **safe fallback to the full list**
  if no skill matched or a skill doesn't declare `requires_tools`.

  **Still needs your action:** `agent/skills/<name>/SKILL.md` files weren't in the dump, so I
  couldn't verify `requires_tools` is actually populated. If empty, this is a safe no-op until
  filled in.

## Genuinely still open — needs files or decisions I don't have

- `scripts/*.sh` internals and `agent/skills/*/SKILL.md` files — not in your upload.
- Whether the user store should move to Postgres/`src/db` instead of the file-based store above.
- `agent/config/llm.yaml`'s `thinking: true` overrides only cover `rca`/`architect`/`pentester`
  — worth checking whether other skills need it; needs your judgment on which skills are
  actually reasoning-depth-sensitive.
