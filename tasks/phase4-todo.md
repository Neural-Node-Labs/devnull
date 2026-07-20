# Phase 4: Installation & Setup Scripting — Plan

## Objective
Create the installation and setup mechanism: a script or set of instructions that installs the packaged artifact, sets up the runtime environment (creates directories, sets permissions, writes config files from templates), and handles first-run initialization (database setup, secret injection). Ensure idempotency — re-running setup should be safe.

## Deliverables

### 1. `scripts/install.sh` — Main installation script
- [ ] Detect environment (Docker vs bare-metal)
- [ ] Create runtime directories (`/opt/devnull`, `/workspace/.log`, etc.)
- [ ] Set permissions (non-root user `devnull`)
- [ ] Copy/extract artifact files
- [ ] Install production npm dependencies
- [ ] Write config files from templates (`.env` from `.env.example`)
- [ ] Validate installation (check CLI runs, check key files exist)
- [ ] Idempotent — safe to re-run

### 2. `scripts/init-db.sh` — Database initialization script
- [ ] Create PostgreSQL database if not exists
- [ ] Create tables (task_history, phase_reports, wbs_entries, etc.)
- [ ] Create indexes
- [ ] Idempotent — uses `CREATE TABLE IF NOT EXISTS`

### 3. `scripts/setup.sh` — Unified setup orchestrator
- [ ] Orchestrate install + init-db + first-run config
- [ ] Handle secret injection (prompt for API keys)
- [ ] Validate end-to-end
- [ ] Idempotent wrapper

### 4. `scripts/install-docker.sh` — Docker-based installation
- [ ] Pull/build Docker images
- [ ] Create docker-compose override for production
- [ ] Set up volumes and networks
- [ ] Initialize database container
- [ ] Validate services are healthy

### 5. Update `package.json` with setup scripts
- [ ] Add `setup`, `install`, `init-db` npm scripts

### 6. Update `README.md` with installation instructions
- [ ] Document bare-metal install path
- [ ] Document Docker install path
- [ ] Document first-run initialization

## Review
- [ ] All scripts are idempotent
- [ ] Secrets are never hardcoded
- [ ] Non-root user principle maintained
- [ ] Validation step at end of each script
- [ ] Rollback/cleanup on failure
