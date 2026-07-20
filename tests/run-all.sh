#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# devnull Test Suite Runner
# Runs all test categories and reports pass/fail for each.
# Usage: bash tests/run-all.sh [--unit-only] [--integration-only] [--e2e-only]
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0
SKIP=0
FAILED_SUITES=()

# ── Helpers ──────────────────────────────────────────────────────────────────

header() {
  echo ""
  echo "══════════════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "══════════════════════════════════════════════════════════════════════"
}

pass() {
  echo "  ✅ $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  ❌ $1"
  FAIL=$((FAIL + 1))
  FAILED_SUITES+=("$1")
}

skip() {
  echo "  ⏭️  $1"
  SKIP=$((SKIP + 1))
}

# ── Parse args ───────────────────────────────────────────────────────────────

RUN_UNIT=true
RUN_INTEGRATION=true
RUN_E2E=true

for arg in "$@"; do
  case "$arg" in
    --unit-only)      RUN_INTEGRATION=false; RUN_E2E=false ;;
    --integration-only) RUN_UNIT=false; RUN_E2E=false ;;
    --e2e-only)       RUN_UNIT=false; RUN_INTEGRATION=false ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ── 1. Unit Tests ────────────────────────────────────────────────────────────

if [ "$RUN_UNIT" = true ]; then
  header "Unit Tests (vitest)"

  if npx vitest run --config tests/vitest.config.ts 2>&1; then
    pass "All unit tests passed"
  else
    fail "Unit tests failed"
  fi
fi

# ── 2. Integration Tests ─────────────────────────────────────────────────────

if [ "$RUN_INTEGRATION" = true ]; then
  header "Integration Tests"

  # Check if Docker is available and integration test directory exists
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    if [ -d tests/integration ]; then
      echo "  Docker available — running integration tests..."

      if npx vitest run tests/integration/ --config tests/vitest.config.ts 2>&1; then
        pass "All integration tests passed"
      else
        fail "Integration tests failed"
      fi
    else
      skip "tests/integration/ directory not found — skipping integration tests"
    fi
  else
    skip "Docker not available — skipping integration tests"
  fi
fi

# ── 3. E2E / Playwright Page Tests ───────────────────────────────────────────

if [ "$RUN_E2E" = true ]; then
  header "E2E / Playwright Page Tests"

  # Check if the UI server is running (required for e2e tests)
  if curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo "  UI server is running — running Playwright tests..."

    if npx playwright test tests/pages/ 2>&1; then
      pass "All Playwright page tests passed"
    else
      fail "Playwright page tests failed"
    fi
  else
    skip "UI server not running on http://127.0.0.1:3000 — skipping e2e tests"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════════════"
echo "  RESULTS"
echo "══════════════════════════════════════════════════════════════════════"
echo "  ✅ Passed: $PASS"
echo "  ❌ Failed: $FAIL"
echo "  ⏭️  Skipped: $SKIP"
echo ""

if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  echo "  Failed suites:"
  for suite in "${FAILED_SUITES[@]}"; do
    echo "    - $suite"
  done
  echo ""
  exit 1
else
  echo "  All test suites passed! 🎉"
  echo ""
  exit 0
fi
