# WBS: SSH Tools Environment Variable Enhancement

## Goal
Enhance SSH tools so credentials (username/password) come from named environment variables instead of being passed inline, preventing password leakage in logs/context. Prioritize devops fleet tools (`ssh_copy_tool`, `ssh_run_command`) over raw `ssh_tool`.

## Tasks

### Milestone 1: Enhance `ssh_tool` (raw SSH) with env-var-based credentials
- [x] **T1.1** — Update `ssh_tool` schema (`toolSchemas.ts`): add optional `userEnvVar` and `passwordEnvVar` string params; make `user` optional when `userEnvVar` is set
- [x] **T1.2** — Update `ssh_tool` dispatcher (`toolDispatcher.ts`): resolve `user`/`password` from env vars if `userEnvVar`/`passwordEnvVar` are provided; fall back to inline `user` for backward compat
- [x] **T1.3** — Update `ssh_tool` description to document the env-var pattern

### Milestone 2: Enhance `docker_deploy_ssh_tool` with env-var-based credentials
- [x] **T2.1** — Update `docker_deploy_ssh_tool` schema: add optional `userEnvVar` and `passwordEnvVar` string params; make `user` optional when `userEnvVar` is set
- [x] **T2.2** — Update `docker_deploy_ssh_tool` dispatcher: resolve credentials from env vars
- [x] **T2.3** — Update `docker_deploy_ssh_tool` description to document the env-var pattern

### Milestone 3: Update tool descriptions to prioritize devops fleet tools
- [x] **T3.1** — Update `ssh_tool` description to say "prefer ssh_copy_tool/ssh_run_command for fleet operations"
- [x] **T3.2** — Update `docker_deploy_ssh_tool` description to mention env-var credential support

### Milestone 4: Validation
- [x] **T4.1** — TypeScript compilation check (`tsc --noEmit`) ✅
- [x] **T4.2** — Run existing test suite to confirm no regressions ✅ (52/52 tests pass, 13 pre-existing Playwright config failures unrelated)
