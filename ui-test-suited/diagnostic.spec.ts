import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("Diagnostic", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${UI_BASE}/diagnostics`);
    await page.waitForSelector("h1");
  });

  test("diagnostic page has a title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Diagnostics");
  });

  test("diagnostic page has test results section", async ({ page }) => {
    await expect(page.locator("text=Test results")).toBeVisible();
  });

  test("diagnostic page has skills section", async ({ page }) => {
    await expect(page.locator("text=Loaded skills")).toBeVisible();
  });

  test("diagnostic page has directives section", async ({ page }) => {
    await expect(page.locator("text=Directives & protocol")).toBeVisible();
  });

  test("diagnostic page has a run test button", async ({ page }) => {
    const runButton = page.locator("button:has-text('Run tests')");
    await expect(runButton).toBeVisible();
  });

  test("diagnostic results are displayed after running a test", async ({ page }) => {
    const runButton = page.locator("button:has-text('Run tests')");
    if (await runButton.isVisible()) {
      await runButton.click();
      // Wait for results to appear — tests auto-run on page load
      const results = page.locator("text=API Connection").first();
      await expect(results).toBeVisible({ timeout: 15_000 });
    }
  });

  test("diagnostic page shows pass/fail status for each check", async ({ page }) => {
    // Tests auto-run on page load, so status indicators should appear
    const passIndicator = page.locator("text=/pass|PASS/i").first();
    const failIndicator = page.locator("text=/fail|FAIL/i").first();

    // At least one status indicator should be present
    const anyIndicatorVisible = await Promise.any([
      passIndicator.isVisible().then((v) => v),
      failIndicator.isVisible().then((v) => v),
    ]);
    expect(anyIndicatorVisible).toBe(true);
  });

  test("diagnostic page shows description", async ({ page }) => {
    await expect(page.locator("text=System health checks and component testing")).toBeVisible();
  });

  test("diagnostic page shows directives loaded status", async ({ page }) => {
    // The directives section should show loaded status
    await expect(page.locator("text=Engineering Protocol")).toBeVisible();
    await expect(page.locator("text=System Directives")).toBeVisible();
    await expect(page.locator("text=Tool Definitions")).toBeVisible();
    await expect(page.locator("text=Skill Registry")).toBeVisible();
  });
});
