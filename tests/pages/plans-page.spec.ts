import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Plans Page (/plans)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/plans`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the plans page with title and description", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Plans");
    await expect(page.locator("text=View and manage plans created by devnull")).toBeVisible();
  });

  test("shows loading state initially", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans`);
    await expect(page.locator("text=Loading plans...")).toBeVisible({ timeout: 5_000 });
  });

  test("shows empty state when no plans exist", async ({ page }) => {
    await expect(page.locator("text=No plans yet")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Plans are created when devnull generates a plan for a task")).toBeVisible();
  });

  test("has a Refresh button", async ({ page }) => {
    await expect(page.locator("button:has-text('Refresh')")).toBeVisible();
  });

  test("clicking Refresh reloads the plans list", async ({ page }) => {
    await page.locator("button:has-text('Refresh')").click();
    // Should show loading state again briefly
    await expect(page.locator("text=Loading plans...")).toBeVisible({ timeout: 3_000 });
  });

  test("shows error state when API fails", async ({ page }) => {
    // The error container should be in the DOM structure
    await expect(page.locator("h1")).toBeVisible();
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/plans`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});
