<#
.SYNOPSIS
  devnull Test Suite Runner (Windows PowerShell equivalent of run-all.sh)
.DESCRIPTION
  Runs all test categories and reports pass/fail for each.
  Usage: .\tests\run-all.ps1 [[-UnitOnly] | [-IntegrationOnly] | [-E2EOnly]]
.PARAMETER UnitOnly
  Skip integration and e2e tests.
.PARAMETER IntegrationOnly
  Skip unit and e2e tests.
.PARAMETER E2EOnly
  Skip unit and integration tests.
.EXAMPLE
  .\tests\run-all.ps1
  .\tests\run-all.ps1 -UnitOnly
  .\tests\run-all.ps1 -IntegrationOnly
  .\tests\run-all.ps1 -E2EOnly
#>

param(
  [switch]$UnitOnly,
  [switch]$IntegrationOnly,
  [switch]$E2EOnly
)

# ── Configuration ────────────────────────────────────────────────────────────

# ROOT_DIR: resolve to the project root (parent of tests/)
$ROOT_DIR = Split-Path -Path (Split-Path -Path $PSCommandPath -Parent) -Parent
Set-Location -Path $ROOT_DIR

$PASS = 0
$FAIL = 0
$SKIP = 0
$FAILED_SUITES = @()

# ── Helpers ──────────────────────────────────────────────────────────────────

function header {
  param([string]$Title)
  Write-Host ""
  Write-Host ("=" * 66)
  Write-Host "  $Title"
  Write-Host ("=" * 66)
}

function pass {
  param([string]$Name)
  Write-Host "  [+] $Name"
  $script:PASS++
}

function fail {
  param([string]$Name)
  Write-Host "  [X] $Name"
  $script:FAIL++
  $script:FAILED_SUITES += $Name
}

function skip {
  param([string]$Name)
  Write-Host "  [-] $Name"
  $script:SKIP++
}

# ── Parse args ───────────────────────────────────────────────────────────────

$RUN_UNIT = $true
$RUN_INTEGRATION = $true
$RUN_E2E = $true

if ($UnitOnly) {
  $RUN_INTEGRATION = $false
  $RUN_E2E = $false
}
if ($IntegrationOnly) {
  $RUN_UNIT = $false
  $RUN_E2E = $false
}
if ($E2EOnly) {
  $RUN_UNIT = $false
  $RUN_INTEGRATION = $false
}

# ── 1. Unit Tests ────────────────────────────────────────────────────────────

if ($RUN_UNIT) {
  header "Unit Tests (vitest)"

  # npx vitest run --config tests/vitest.config.ts
  npx vitest run --config tests/vitest.config.ts 2>&1
  if ($LASTEXITCODE -eq 0) {
    pass "All unit tests passed"
  } else {
    fail "Unit tests failed"
  }
}

# ── 2. Integration Tests ─────────────────────────────────────────────────────

if ($RUN_INTEGRATION) {
  header "Integration Tests"

  # Check if Docker is available
  $dockerAvailable = $false
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    # docker info &>/dev/null equivalent: check stderr too
    $dockerInfoOutput = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
      $dockerAvailable = $true
    }
  }

  if ($dockerAvailable) {
    if (Test-Path "tests/integration") {
      Write-Host "  Docker available - running integration tests..."

      # npx vitest run tests/integration/ --config tests/vitest.config.ts
      npx vitest run tests/integration/ --config tests/vitest.config.ts 2>&1
      if ($LASTEXITCODE -eq 0) {
        pass "All integration tests passed"
      } else {
        fail "Integration tests failed"
      }
    } else {
      skip "tests/integration/ directory not found - skipping integration tests"
    }
  } else {
    skip "Docker not available — skipping integration tests"
  }
}

# ── 3. E2E / Playwright Page Tests ───────────────────────────────────────────

if ($RUN_E2E) {
  header "E2E / Playwright Page Tests"

  # Check if the UI server is running (required for e2e tests)
  # NOTE: In PowerShell, 'curl' is an alias for Invoke-WebRequest.
  # We need the real curl.exe. Use 'curl.exe' explicitly to bypass the alias.
  $uiRunning = $false
  try {
    $null = curl.exe -sf http://127.0.0.1:3000/ 2>&1
    if ($LASTEXITCODE -eq 0) {
      $uiRunning = $true
    }
  } catch {
    $uiRunning = $false
  }

  if ($uiRunning) {
    Write-Host "  UI server is running — running Playwright tests..."

    # npx playwright test tests/pages/
    npx playwright test tests/pages/ 2>&1
    if ($LASTEXITCODE -eq 0) {
      pass "All Playwright page tests passed"
    } else {
      fail "Playwright page tests failed"
    }
  } else {
    skip "UI server not running on http://127.0.0.1:3000 — skipping e2e tests"
  }
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host ("=" * 66)
Write-Host "  RESULTS"
Write-Host ("=" * 66)
Write-Host "  [+] Passed: $PASS"
Write-Host "  [X] Failed: $FAIL"
Write-Host "  [-] Skipped: $SKIP"
Write-Host ""

if ($FAILED_SUITES.Count -gt 0) {
  Write-Host "  Failed suites:"
  foreach ($suite in $FAILED_SUITES) {
    Write-Host "    - $suite"
  }
  Write-Host ""
  exit 1
} else {
  Write-Host "  All test suites passed! :)"
  Write-Host ""
  exit 0
}
