# Plan: deploy to remote docker, ssh user/password in .env REMOTE_SSH_USER/REMOTE_SSH_PASSWORD host 86.38.217.69

```markdown
- [ ] **Read `.env` file** — extract `REMOTE_SSH_USER`, `REMOTE_SSH_PASSWORD`, and any other needed variables (e.g., `REMOTE_SSH_HOST` if defined, else use `86.38.217.69`). Validate they are non-empty.
- [ ] **SSH connectivity check** — use `ssh_tool` to connect to `86.38.217.69` with the resolved credentials. Run `docker info` to confirm Docker is available on the remote host.
- [ ] **Build and tag images locally** — run `docker compose build` (or `docker build` per service) and tag images with a version/date label for traceability.
- [ ] **Push images to a registry** — either push to Docker Hub / a private registry accessible from the remote host, OR prepare to transfer images via `docker save` + `scp` + `docker load` if no registry is available.
- [ ] **Copy `docker-compose.yml` and `.env` to remote** — use `ssh_copy_tool` to transfer the compose file and a sanitized `.env` (no secrets in plaintext; use env-var references) to the remote host.
- [ ] **Deploy on remote** — use `docker_deploy_ssh_tool` (or `ssh_tool` with `docker compose up -d`) to pull/load images and start services. Verify all containers are running (`docker ps`).
- [ ] **Health check** — run a smoke test against the deployed services (e.g., `curl` the API health endpoint, check UI is serving). Report status.
- [ ] **Document rollback plan** — in `tasks/todo.md` or `artifact.md`, record the exact commands to revert (e.g., `docker compose down`, previous image tags, backup of compose file).
```
