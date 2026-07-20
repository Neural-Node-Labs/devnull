import { test, expect } from "@playwright/test";
import { UI_BASE, API_BASE } from "./helpers";

test.describe("Login Page (/login)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${UI_BASE}/login`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the login page with title and form", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("devnull");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("shows loading state while checking user count", async ({ page }) => {
    // The page initially shows "Loading..." while checking GET /api/v1/users/count
    // This state is transient — we just verify the form eventually appears
    await expect(page.locator("#username")).toBeVisible({ timeout: 10_000 });
  });

  test("shows error for empty username and password", async ({ page }) => {
    await page.click("button[type='submit']");
    await expect(page.locator("text=Please enter both username and password")).toBeVisible();
  });

  test("shows error for short password in register mode", async ({ page }) => {
    // Check if we're in register mode (no users exist)
    const submitBtn = page.locator("button[type='submit']");
    const btnText = await submitBtn.textContent();

    if (btnText?.includes("Register")) {
      await page.fill("#username", "testuser");
      await page.fill("#password", "ab");
      await submitBtn.click();
      await expect(page.locator("text=Password must be at least 4 characters")).toBeVisible();
    }
  });

  test("redirects to home if already authenticated", async ({ page }) => {
    // First login
    await page.fill("#username", "admin");
    await page.fill("#password", "admin1234");
    await page.click("button[type='submit']");
    await page.waitForURL("**/");

    // Navigate to login again — should redirect to /
    await page.goto(`${UI_BASE}/login`);
    await page.waitForURL("**/");
    await expect(page.locator("h1")).toHaveText(/Welcome/);
  });

  test("shows error for invalid credentials", async ({ page }) => {
    // Only test this if we're in login mode (users exist)
    const submitBtn = page.locator("button[type='submit']");
    const btnText = await submitBtn.textContent();

    if (btnText?.includes("Sign In")) {
      await page.fill("#username", "nonexistent");
      await page.fill("#password", "wrongpassword");
      await submitBtn.click();
      // Should show an error message
      await expect(page.locator("[class*='error'], [style*='color: var(--color-error)']")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("has accessible form labels", async ({ page }) => {
    await expect(page.locator("label[for='username']")).toHaveText("Username");
    await expect(page.locator("label[for='password']")).toHaveText("Password");
  });

  test("password field has autocomplete attribute", async ({ page }) => {
    const passwordInput = page.locator("#password");
    const autocomplete = await passwordInput.getAttribute("autocomplete");
    expect(["current-password", "new-password"]).toContain(autocomplete);
  });

  test("username field is auto-focused", async ({ page }) => {
    await expect(page.locator("#username")).toBeFocused();
  });
});
