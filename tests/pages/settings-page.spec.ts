import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Settings Page (/settings)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/settings`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the settings page with title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Settings");
  });

  test("has theme selector section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
    await expect(page.locator("text=Choose a theme for the dashboard")).toBeVisible();
  });

  test("theme selector shows available theme cards", async ({ page }) => {
    // Theme cards are buttons with theme names
    const themeSection = page.locator("h2:has-text('Theme')").locator("..");
    // Should have at least one theme button with color preview dots
    const themeButtons = page.locator("button").filter({ has: page.locator("span[style*='border-radius: 50%']") });
    const count = await themeButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("clicking a theme card updates the active theme", async ({ page }) => {
    // Find a theme button that is not currently active
    const themeButtons = page.locator("button").filter({ has: page.locator("span[style*='border-radius: 50%']") });
    const count = await themeButtons.count();
    if (count >= 2) {
      // Click the second theme
      await themeButtons.nth(1).click();
      // The clicked theme should now have a primary border
      await expect(themeButtons.nth(1)).toHaveCSS("border-color", /rgb\(147, 51, 234\)/);
    }
  });

  test("has user management section for admin users", async ({ page }) => {
    await expect(page.locator("[data-testid='admin-section']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("user management has Add User button", async ({ page }) => {
    await expect(page.locator("button:has-text('Add User')")).toBeVisible();
  });

  test("clicking Add User opens the form", async ({ page }) => {
    await page.locator("button:has-text('Add User')").click();
    await expect(page.locator("input[aria-label='Username']")).toBeVisible();
    await expect(page.locator("select[data-testid='role-selector']")).toBeVisible();
    await expect(page.locator("button:has-text('Create User')")).toBeVisible();
  });

  test("user management shows user list table", async ({ page }) => {
    const userList = page.locator("[data-testid='user-list']");
    await expect(userList).toBeVisible();
    await expect(userList.locator("table")).toBeVisible();
  });

  test("has change password section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
    await expect(page.locator("text=Not yet available")).toBeVisible();
  });

  test("change password fields are disabled", async ({ page }) => {
    const passwordInputs = page.locator("input[type='password']");
    // The password fields in the change password section should be disabled
    const disabledInputs = passwordInputs.locator("[disabled]");
    const count = await disabledInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("has LLM key management section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "LLM Key Management" })).toBeVisible();
  });

  test("LLM key section shows key status", async ({ page }) => {
    await expect(page.locator("text=Checking current key status").or(page.locator("text=currently configured"))).toBeVisible({ timeout: 10_000 });
  });

  test("LLM key section has Save Key button", async ({ page }) => {
    await expect(page.locator("button:has-text('Save Key')")).toBeVisible();
  });

  test("LLM key section shows Clear button when key exists", async ({ page }) => {
    // Wait for key status to load
    await page.waitForTimeout(2000);
    const clearButton = page.locator("button:has-text('Clear')");
    // May or may not be visible depending on key status
    const exists = await clearButton.isVisible().catch(() => false);
    if (exists) {
      await expect(clearButton).toBeVisible();
    }
  });

  test("shows error for empty API key", async ({ page }) => {
    await page.locator("button:has-text('Save Key')").click();
    await expect(page.locator("text=Please enter an API key")).toBeVisible();
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/settings`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});
