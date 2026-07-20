# Phase 3: Build & Packaging Implementation

## Goal
Implement the packaging pipeline: build script, Dockerfile improvements, and deploy tarball creation that produces deployable artifacts without source code. Validate that artifacts run independently of the source tree.

## Tasks

### Task 1: Build Script (`scripts/build.sh`)
- [ ] Create a unified build script that:
  1. Compiles TypeScript (`npm run build` / `tsc`)
  2. Installs production dependencies only (`npm install --omit=dev`)
  3. Copies agent skills/config to dist output
  4. Outputs to `dist/` directory
  5. Validates the build output (checks for key JS files)
- [ ] Add npm scripts: `"package:build"` and `"package:validate"`

### Task 2: Dockerfile Improvements
- [ ] Review and enhance existing Dockerfile:
  - [ ] Ensure `.dockerignore` is comprehensive (already good)
  - [ ] Verify multi-stage build excludes source code from runtime image
  - [ ] Add build arg for version tagging
  - [ ] Add labels (maintainer, version, source)
  - [ ] Verify non-root user works correctly
  - [ ] Ensure HEALTHCHECK works for API server mode

### Task 3: UI Dockerfile Improvements
- [ ] Review and enhance `ui/Dockerfile`:
  - [ ] Pin base image versions
  - [ ] Add labels
  - [ ] Verify nginx config works with built assets
  - [ ] Ensure non-root user

### Task 4: Deploy Tarball Script
- [ ] Review existing `scripts/create-deploy-tarball.mjs` and `.sh`
- [ ] Add npm script: `"package:tarball"`
- [ ] Ensure tarball excludes source code (.ts files)
- [ ] Validate tarball contents programmatically

### Task 5: Build Validation
- [ ] Run `npm run build` and verify `dist/` output
- [ ] Run tarball creation and validate contents
- [ ] Verify no `.ts` files in `dist/`
- [ ] Verify `dist/cli/index.js` is executable
- [ ] Verify `dist/` can run independently (node dist/cli/index.js --help)

### Task 6: Documentation
- [ ] Update `README.md` with build/packaging instructions
- [ ] Document artifact structure in `artifact.md`

## Validation Criteria
1. `npm run build` produces `dist/` with compiled JS (no .ts files)
2. `node dist/cli/index.js --help` works without source tree
3. Docker image builds successfully
4. Deploy tarball contains all required files, no .env, no .ts source
5. UI Docker image builds successfully
