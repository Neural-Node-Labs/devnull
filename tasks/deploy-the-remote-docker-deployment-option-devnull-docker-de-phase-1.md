# Phase 1: Environment & Credential Audit
Audit the current SSH credential handling in `docker_deploy_ssh_tool` and related tools. Verify that `REMOTE_SSH_USER`, `REMOTE_SSH_PASSWORD`, and `REMOTE_SSH_HOST` env vars are properly wired through the tool's schema, dispatcher, and runtime execution. Check that `sshpass` is available on the build/deploy host and that the tool correctly reads from `process.env` rather than inline arguments. Validate that the existing `docker-compose.yml` and Dockerfile are compatible with the remote target's CPU/memory constraints (1 CPU, limited RAM).

**Task:** deploy the remote docker deployment option devnull --docker --deploy --remote --llm false, env has REMOTE_SSH_USER, REMOTE_SSH_PASSWORD, REMOTE_SSH_HOST

**Result:**

(subagent hit iteration limit without completing)

**Stats:**
- Tokens: 931,668
- Iterations: 22
