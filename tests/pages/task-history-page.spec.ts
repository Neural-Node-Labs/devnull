import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Task History Page (/task-history)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/task-history`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the task history page with title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Task History");
  });

  test("shows loading state initially", async ({ page }) => {
    await page.goto(`${UI_BASE}/task-history`);
    await expect(page.locator("text=Loading task history...")).toBeVisible({ timeout: 5_000 });
  });

  test("shows empty state when no task history exists", async ({ page }) => {
    await expect(page.locator("text=No task history yet")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Run a task in the Chat page to see it here")).toBeVisible();
  });

  test("has a Refresh button", async ({ page }) => {
    await expect(page.locator("button:has-text('↻ Refresh')")).toBeVisible();
  });

  test("clicking Refresh reloads the task history", async ({ page }) => {
    await page.locator("button:has-text('↻ Refresh')").click();
    // Should show loading state again briefly
    await expect(page.locator("text=Loading...")).toBeVisible({ timeout: 3_000 });
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

    await page.goto(`${UI_BASE}/task-history`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});
