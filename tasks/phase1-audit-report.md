# Phase 1: Environment & Credential Audit Report

## 1. SSH Credential Wiring: `docker_deploy_ssh_tool`

### Schema (`src/tools/toolSchemas.ts`)
| Check | Status | Details |
|-------|--------|---------|
| `userEnvVar` param declared | ✅ | `type: "string"`, description mentions env-var safety |
| `passwordEnvVar` param declared | ✅ | `type: "string"`, description mentions env-var safety |
| LLM description mentions env-var usage | ✅ | "Credentials can be provided inline OR via environment variable names" |
| `host` and `remotePath` required | ✅ | `required: ["host", "remotePath"]` |
| `user`/`userEnvVar`/`passwordEnvVar` optional | ✅ | Not in `required` array |

### Dispatcher (`src/tools/toolDispatcher.ts`, lines 249–280)
| Check | Status | Details |
|-------|--------|---------|
| Resolves `userEnvVar` from `process.env` | ✅ | `process.env[args.userEnvVar] ?? ""` |
| Resolves `passwordEnvVar` from `process.env` | ✅ | `process.env[args.passwordEnvVar] ?? undefined` |
| Falls back to inline `user`/`password` | ✅ | `args.user ?? ""` / `undefined` when no env-var |
| Passes resolved creds to `deployWorkspaceViaSsh()` | ✅ | `user: resolvedUser, password: resolvedPassword` |
| Cache-busting dynamic import | ✅ | `import("./dockerDeploySshTool.js?t=" + Date.now())` |

### Runtime (`src/tools/dockerDeploySshTool.ts`)
| Check | Status | Details |
|-------|--------|---------|
| `DeployOptions` accepts `user`/`password` | ✅ | Both optional strings |
| Constructs `SshTarget` from opts | ✅ | `host, user, port, keyPath, password` |
| Passes to `sshExec`/`scpUpload` | ✅ | Uses `ssh2` library for password auth |

### CLI (`src/cli/index.ts`, lines 129–157)
| Check | Status | Details |
|-------|--------|---------|
| Reads `REMOTE_SSH_USER` from env | ✅ | `process.env.REMOTE_SSH_USER` |
| Reads `REMOTE_SSH_PASSWORD` from env | ✅ | `process.env.REMOTE_SSH_PASSWORD` |
| Validates both are set | ✅ | Exits with error if missing |
| Passes as inline creds (not env-var names) | ⚠️ | Uses `user: remoteUser, password: remotePassword` directly — password in memory but not in argv |

### `ssh_tool` (`src/tools/sshTool.ts`)
| Check | Status | Details |
|-------|--------|---------|
| Password auth via `ssh2` library | ✅ | `ssh2Exec()` uses native Node.js SSH client |
| Key-based auth via shell-out `ssh` | ✅ | `sshBaseArgs()` with `BatchMode=yes` |
| `sshpass` code path exists | ✅ | `buildSshCommand()` wraps with `sshpass -e` |
| `sshpass` code path is reachable | ❌ | **Dead code** — `sshExec()`/`scpUpload()`/`scpDownload()` all take the `ssh2` path when `target.password` is set; the shell-out path is only used for key-based auth (no password) |

### `ssh_copy_tool` / `ssh_run_command` (fleet tools)
| Check | Status | Details |
|-------|--------|---------|
| Uses `XCODER_SSH_TARGETS` env var | ✅ | `loadRemoteConfig()` reads from env |
| Uses `XCODER_SSH_USER` env var | ✅ | Shared username for all fleet targets |
| Uses `XCODER_SSH_PASSWORD` env var | ✅ | Shared password for all fleet targets |
| Uses `ssh2` for password auth | ✅ | `connect()` in `sshConnection.ts` uses `ssh2` Client |

---

## 2. `sshpass` Availability

**Conclusion: `sshpass` is NOT required on the build/deploy host.**

The `ssh_tool` uses two distinct auth mechanisms:
1. **Password auth** → `ssh2` (Node.js native library, declared in `package.json` as `"ssh2": "^1.17.0"`). This is a pure-JS SSH client that handles password authentication natively — no `sshpass` needed.
2. **Key-based auth** → Shells out to `ssh`/`scp` with `BatchMode=yes`. No password involved, so no `sshpass` needed.

The `sshpass` code in `buildSshCommand()` is **dead code** — it wraps the shell-out command with `sshpass -e`, but the shell-out path is only taken when there's **no password** (key-based auth). When a password IS set, `sshExec()`/`scpUpload()`/`scpDownload()` all take the `ssh2` path instead.

**Recommendation:** Remove the dead `sshpass` code from `buildSshCommand()` to eliminate confusion. The `ssh2` library handles password auth cleanly and cross-platform.

---

## 3. `REMOTE_SSH_USER`, `REMOTE_SSH_PASSWORD`, `REMOTE_SSH_HOST` Env Vars

| Env Var | Where Used | Status |
|---------|-----------|--------|
| `REMOTE_SSH_USER` | `src/cli/index.ts` line 129 | ✅ Read from `process.env` |
| `REMOTE_SSH_PASSWORD` | `src/cli/index.ts` line 130 | ✅ Read from `process.env` |
| `REMOTE_SSH_HOST` | Not found in codebase | ❌ **Not used anywhere** — the CLI takes `--remote <ip>` as a CLI argument, not from an env var |

**Finding:** `REMOTE_SSH_HOST` is not referenced in any source file. The remote host IP is passed via the `--remote <ip>` CLI flag, not an environment variable. The `.env.example` file also does not document `REMOTE_SSH_HOST`, `REMOTE_SSH_USER`, or `REMOTE_SSH_PASSWORD`.

**Recommendation:** Either:
- (a) Add `REMOTE_SSH_HOST` as an env var fallback (so `--remote` can be omitted when the env var is set), or
- (b) Document the `--remote` flag and the `REMOTE_SSH_USER`/`REMOTE_SSH_PASSWORD` env vars in `.env.example`

---

## 4. Docker Compose CPU/Memory Constraints (Target: 1 CPU, Limited RAM)

### Current Limits

| Service | CPU Limit | Memory Limit | CPU Reservation | Memory Reservation |
|---------|-----------|-------------|-----------------|-------------------|
| postgres | 0.5 | 512M | 0.1 | 128M |
| api | 0.5 | 2G | 0.1 | 128M |
| ui | 0.5 | 256M | 0.1 | 64M |
| **Total (limits)** | **1.5** | **~2.75G** | **0.3** | **~320M** |

### Analysis

| Check | Status | Details |
|-------|--------|---------|
| CPU limit sum (1.5) ≤ 1 CPU | ❌ | Sum of limits exceeds 1 CPU. Docker will throttle, but this is acceptable since limits are per-container ceilings, not simultaneous guarantees. |
| Memory limit sum (~2.75G) ≤ available RAM | ⚠️ | Depends on host. If host has < 3GB, OOM kills are likely. The `api` service's 2G limit is the biggest concern. |
| CPU reservations sum (0.3) ≤ 1 CPU | ✅ | Reservations are well within 1 CPU |
| Memory reservations sum (~320M) ≤ available RAM | ✅ | Reservations are modest |
| `api` service memory limit (2G) | ⚠️ | High for a 1-CPU host. The API runs Node.js + LLM calls — memory usage depends on response sizes. |
| `postgres` CPU limit (0.5) | ✅ | Appropriate for a DB on a 1-CPU host |
| `ui` CPU limit (0.5) | ✅ | Nginx static file server — lightweight |

### Recommendations

1. **Reduce `api` memory limit** from `2G` to `1G` — Node.js with the current workload shouldn't need more than 1GB on a constrained host.
2. **Reduce `api` CPU limit** from `0.5` to `0.25` — the API is I/O-bound (waiting on LLM responses), not CPU-bound.
3. **Document the 1-CPU constraint** in a deployment guide so operators know to adjust limits.
4. **Consider removing the `ui` service** on very constrained hosts (1 CPU, < 2GB RAM) — the API can serve the UI directly.

---

## Summary

| Area | Verdict |
|------|---------|
| SSH credential wiring (schema → dispatcher → runtime) | ✅ Correct — env-var names resolved from `process.env` at runtime |
| `sshpass` availability | ✅ Not needed — `ssh2` library handles password auth natively |
| `REMOTE_SSH_HOST` env var | ❌ Not implemented — host is CLI-only (`--remote <ip>`) |
| `.env.example` documentation | ❌ Missing `REMOTE_SSH_USER`/`REMOTE_SSH_PASSWORD` entries |
| Docker Compose CPU constraints | ⚠️ Sum of limits exceeds 1 CPU; `api` memory limit (2G) is high |
| Dead code (`sshpass` in `buildSshCommand`) | ❌ Unreachable code path — should be cleaned up |
