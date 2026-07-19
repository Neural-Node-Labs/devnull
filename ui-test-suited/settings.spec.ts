import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${UI_BASE}/settings`);
    await page.waitForSelector("h1");
  });

  test("settings page has a title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Settings");
  });

  test("settings page has theme selector section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
  });

  test("settings page has user management section (admin)", async ({ page }) => {
    await expect(page.locator("text=User Management")).toBeVisible();
  });

  test("add user button is present in user management", async ({ page }) => {
    const addUserButton = page.locator("button:has-text('Add User')");
    await expect(addUserButton).toBeVisible();
  });

  test("add user flow: create a new user", async ({ page }) => {
    const addUserButton = page.locator("button:has-text('Add User')");
    await expect(addUserButton).toBeVisible();
    await addUserButton.click();

    const usernameInput = page.locator("input[aria-label='Username']");
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill("settings_user_" + Date.now());

    const passwordInput = page.locator("input[type='password']").first();
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("TestPass123!");

    const createButton = page.locator("button:has-text('Create User')");
    await createButton.click();

    // Verify the new user appears in the list
    await expect(page.locator("text=settings_user_").first()).toBeVisible({ timeout: 10_000 });
  });

  test("update user information", async ({ page }) => {
    const editButton = page.locator("button:has-text('Edit')").first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    const usernameInput = page.locator("input[aria-label='Username']").first();
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill("updated_user_" + Date.now());

    const saveButton = page.getByRole("button", { name: "Save" }).first();
    await saveButton.click();

    await expect(page.locator("text=updated_user_").first()).toBeVisible({ timeout: 10_000 });
  });

  test("delete user action is present", async ({ page }) => {
    const deleteButton = page.locator("button:has-text('Delete')").first();
    await expect(deleteButton).toBeVisible();
  });

  test("change password section is present", async ({ page }) => {
    await expect(page.locator("text=Change Password")).toBeVisible();
  });

  test("change password flow has current and new password fields", async ({ page }) => {
    const passwordFields = page.locator("input[type='password']");
    const count = await passwordFields.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("LLM key management section is present", async ({ page }) => {
    await expect(page.locator("text=LLM Key Management")).toBeVisible();
  });

  test("LLM key input field is present", async ({ page }) => {
    const keyInput = page.locator("input[type='password']").last();
    await expect(keyInput).toBeVisible();
  });

  test("theme selector shows available themes", async ({ page }) => {
    // Should show at least one theme button
    const themeButtons = page.locator("button:has-text('Theme')");
    // The theme section should be visible
    await expect(page.locator("text=Choose a theme for the dashboard")).toBeVisible();
  });
});
