# Plan: deploy to remote docker, ssh user/password in .env or _.env_ REMOTE_SSH_USER/REMOTE_SSH_PASSWORD host 86.38.217.69 , use docker_deploy_ssh_too and docker_deploy_ssh_tool if this tools is not effectivve do RCA how to fix the tools and fix it, and document in lesson learn.. 

```markdown
- [ ] **Plan & Inventory**: Read `docker-compose.yml` and `Dockerfile` files to understand the full service stack (API, UI, Postgres, Nginx). Identify which images need building and which are pulled from registry.
- [ ] **Read Env Credentials**: Check `.env` and `_env_` for `REMOTE_SSH_USER` and `REMOTE_SSH_PASSWORD`. If missing, prompt user for values. Validate SSH connectivity to `86.38.217.69` using `ssh_tool` with env-var credentials.
- [ ] **Build & Push Images**: Build all Docker images locally (or use registry push if configured). Tag and push to a registry accessible from the remote host, or prepare for direct transfer.
- [ ] **Deploy via `docker_deploy_ssh_tool`**: Use the tool to deploy the full stack to `86.38.217.69`. Pass env-var credentials via `userEnvVar`/`passwordEnvVar` params. Include pre-check (disk space, Docker availability) and health-check steps.
- [ ] **Validate Deployment**: Run `docker ps` and health endpoints on the remote host via `ssh_tool`. Verify all services are running (API, UI, Postgres, Nginx). Check logs for errors.
- [ ] **RCA if Tool Fails**: If `docker_deploy_ssh_tool` fails (auth, timeout, missing dependencies), diagnose using `ssh_tool` directly. Check: SSH auth method, `sshpass` availability, Docker daemon status, disk space, port conflicts. Document root cause.
- [ ] **Fix Tool & Document**: If tool has a bug (e.g., missing `sshpass` support, incorrect env-var resolution), fix the tool source code. Update `tasks/lessons.md` with the pattern and fix.
- [ ] **Rollback Plan**: Document rollback steps in `artifact.md`: stop containers, pull previous images, restart. Verify rollback works by simulating a failure.
```
