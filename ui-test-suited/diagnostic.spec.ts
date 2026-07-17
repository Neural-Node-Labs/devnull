import { test, expect } from "@playwright/test";

test.describe("Diagnostic", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Navigate to diagnostic page
    const diagnosticLink = page.getByRole("link", { name: /diagnostic|diagnose|health|status/i });
    if (await diagnosticLink.isVisible()) {
      await diagnosticLink.click();
    }
  });

  test("diagnostic page has React component testing section", async ({ page }) => {
    const reactSection = page.locator("text=/React|component|render|mount/i").first();
    await expect(reactSection).toBeVisible();
  });

  test("diagnostic page has tools testing section", async ({ page }) => {
    const toolsSection = page.locator("text=/tool|glob|grep|read|write|run/i").first();
    await expect(toolsSection).toBeVisible();
  });

  test("diagnostic page has skills testing section", async ({ page }) => {
    const skillsSection = page.locator("text=/skill|programmer|architect|devops|tester/i").first();
    await expect(skillsSection).toBeVisible();
  });

  test("diagnostic page has directives testing section", async ({ page }) => {
    const directivesSection = page.locator("text=/directive|protocol|instruction|policy/i").first();
    await expect(directivesSection).toBeVisible();
  });

  test("diagnostic page has a run test button", async ({ page }) => {
    const runButton = page.getByRole("button", { name: /run test|start|execute|check/i });
    await expect(runButton).toBeVisible();
  });

  test("diagnostic results are displayed after running a test", async ({ page }) => {
    const runButton = page.getByRole("button", { name: /run test|start|execute|check/i });
    if (await runButton.isVisible()) {
      await runButton.click();
      // Wait for results to appear
      const results = page.locator("[data-testid='diagnostic-result'], .result, .output, pre, code").first();
      await expect(results).toBeVisible({ timeout: 15_000 });
    }
  });

  test("diagnostic page shows pass/fail status for each check", async ({ page }) => {
    const passIndicator = page.locator("text=/pass|success|✓|✅|check/i").first();
    const failIndicator = page.locator("text=/fail|error|✗|❌|cross/i").first();

    // At least one status indicator should be present
    const anyIndicatorVisible = await Promise.any([
      passIndicator.isVisible().then((v) => v),
      failIndicator.isVisible().then((v) => v),
    ]);
    expect(anyIndicatorVisible).toBe(true);
  });

  test("diagnostic page has a summary section", async ({ page }) => {
    const summary = page.locator("text=/summary|overview|report|all checks/i").first();
    await expect(summary).toBeVisible();
  });
});
