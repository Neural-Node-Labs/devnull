# WBS: deploy the remote docker deployment option devnull --docker --deploy --remote --llm false, env has REMOTE_SSH_USER, REMOTE_SSH_PASSWORD, REMOTE_SSH_HOST

- [x] Phase 1: Environment & Credential Audit
Audit the current SSH credential handling in `docker_deploy_ssh_tool` and related tools. Verify that `REMOTE_SSH_USER`, `REMOTE_SSH_PASSWORD`, and `REMOTE_SSH_HOST` env vars are properly wired through the tool's schema, dispatcher, and runtime execution. Check that `sshpass` is available on the build/deploy host and that the tool correctly reads from `process.env` rather than inline arguments. Validate that the existing `docker-compose.yml` and Dockerfile are compatible with the remote target's CPU/memory constraints (1 CPU, limited RAM).
- [x] Phase 2: Build & Package Pipeline
Run `npm run build` to produce fresh compiled JS. Create a deploy tarball that includes the built artifacts, Dockerfile, docker-compose.yml, .dockerignore, and any required config files. Ensure the tarball excludes `.env` (secrets) but includes `.env.example`. Validate the tarball contents match the expected deploy file list from `artifact.md`.
- [x] Phase 3: Remote Deploy Execution
Use `docker_deploy_ssh_tool` to copy the tarball to the remote host, extract it, and run `docker compose up -d` with the correct env vars injected. Monitor the deploy output for errors (CPU limit violations, bind-mount permission issues, `npm ci` failures). If the deploy fails, apply the fixes documented in `lessons.md` (e.g., `chown` the workspace directory, replace `npm ci` with `npm install`, reduce CPU limits).
- [ ] Phase 4: Health Check & Validation
After the containers are running, verify all services are healthy via `docker compose ps` and the API health endpoint. Check that the API responds to requests and that the UI is accessible. If any service is unhealthy, diagnose using container logs and apply targeted fixes. Confirm the deploy is stable before marking complete.
- [ ] Phase 5: Rollback & Documentation
Document the successful deploy in `tasks/todo.md` with the remote host details, any deviations from the standard deploy process, and the final service status. Ensure the rollback plan in `artifact.md` is updated to reflect the remote deploy path (e.g., `docker compose down`, restore previous tarball, `docker compose up -d`). Capture any new lessons learned in `tasks/lessons.md`.
