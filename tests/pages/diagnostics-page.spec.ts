import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Diagnostics Page (/diagnostics)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/diagnostics`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the diagnostics page with title and description", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Diagnostics");
    await expect(page.locator("text=System health checks and component testing")).toBeVisible();
  });

  test("has a Run tests button", async ({ page }) => {
    await expect(page.locator("button:has-text('Run tests')")).toBeVisible();
  });

  test("shows test results section", async ({ page }) => {
    await expect(page.locator("text=Test results")).toBeVisible();
  });

  test("runs tests automatically on mount and shows results", async ({ page }) => {
    // Tests auto-run on mount; wait for results to appear
    await expect(page.locator("text=API Connection")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Health Check")).toBeVisible();
    await expect(page.locator("text=Skills Loaded")).toBeVisible();
    await expect(page.locator("text=Telemetry Available")).toBeVisible();
    await expect(page.locator("text=React Render")).toBeVisible();
  });

  test("shows pass/fail status for each test", async ({ page }) => {
    // Wait for tests to complete
    await expect(page.locator("text=API Connection")).toBeVisible({ timeout: 10_000 });
    // Each test should have a status indicator (PASS, FAIL, or PENDING)
    const statusIndicators = page.locator("span:has-text('pass'), span:has-text('fail'), span:has-text('pending')");
    const count = await statusIndicators.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("shows loaded skills section", async ({ page }) => {
    await expect(page.locator("text=Loaded skills")).toBeVisible();
  });

  test("shows skills list or empty state", async ({ page }) => {
    // Wait for skills to load
    await page.waitForTimeout(3000);
    const skillsSection = page.locator("text=Loaded skills").locator("..");
    const emptyState = skillsSection.locator("text=No skills loaded");
    const skillCards = skillsSection.locator("div[style*='border-radius: 10px']");
    const isEmpty = await emptyState.isVisible().catch(() => false);
    if (!isEmpty) {
      const count = await skillCards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test("shows directives and protocol section", async ({ page }) => {
    await expect(page.locator("text=Directives & protocol")).toBeVisible();
  });

  test("directives section shows loaded status for all items", async ({ page }) => {
    await expect(page.locator("text=Engineering Protocol")).toBeVisible();
    await expect(page.locator("text=System Directives")).toBeVisible();
    await expect(page.locator("text=Tool Definitions")).toBeVisible();
    await expect(page.locator("text=Skill Registry")).toBeVisible();
    // Each should show a checkmark
    const checkmarks = page.locator("text=✅ Loaded");
    const count = await checkmarks.count();
    expect(count).toBe(4);
  });

  test("clicking Run tests re-runs the tests", async ({ page }) => {
    // Wait for initial tests to complete
    await expect(page.locator("text=API Connection")).toBeVisible({ timeout: 10_000 });
    // Click Run tests
    await page.locator("button:has-text('Run tests')").click();
    // Tests should show pending state again briefly
    await expect(page.locator("text=Running…")).toBeVisible({ timeout: 3_000 });
    // Then complete again
    await expect(page.locator("text=API Connection")).toBeVisible({ timeout: 15_000 });
  });

  test("shows skill role badges and trigger tags", async ({ page }) => {
    // Wait for skills to load
    await page.waitForTimeout(3000);
    const skillsSection = page.locator("text=Loaded skills").locator("..");
    const emptyState = skillsSection.locator("text=No skills loaded");
    const isEmpty = await emptyState.isVisible().catch(() => false);
    if (!isEmpty) {
      // Should have role badges (rounded spans with role text)
      const roleBadges = skillsSection.locator("span[style*='border-radius: 999px']");
      const badgeCount = await roleBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(1);
    }
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/diagnostics`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});
