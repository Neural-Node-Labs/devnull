import { test, expect } from "@playwright/test";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Navigate to settings page
    const settingsLink = page.getByRole("link", { name: /setting|config|preference/i });
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
    }
  });

  test("settings page has user management section", async ({ page }) => {
    const userSection = page.locator("text=/user|account|profile/i").first();
    await expect(userSection).toBeVisible();
  });

  test("add user button is present", async ({ page }) => {
    const addUserButton = page.getByRole("button", { name: /add user|new user|create user/i });
    await expect(addUserButton).toBeVisible();
  });

  test("add user flow: create a new user", async ({ page }) => {
    const addUserButton = page.getByRole("button", { name: /add user|new user|create user/i });
    await addUserButton.click();

    const usernameInput = page.getByRole("textbox", { name: /username|name|email/i });
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill("testuser_" + Date.now());

    const passwordInput = page.locator("input[type='password']").first();
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("TestPass123!");

    const saveButton = page.getByRole("button", { name: /save|create|confirm|submit/i });
    await saveButton.click();

    // Verify the new user appears in the list
    await expect(page.locator("text=testuser_").first()).toBeVisible({ timeout: 10_000 });
  });

  test("update user information", async ({ page }) => {
    // Click edit on the first user
    const editButton = page.getByRole("button", { name: /edit|update|modify/i }).first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    const usernameInput = page.getByRole("textbox", { name: /username|name|email/i });
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill("updated_user_" + Date.now());

    const saveButton = page.getByRole("button", { name: /save|update|confirm/i });
    await saveButton.click();

    await expect(page.locator("text=updated_user_").first()).toBeVisible({ timeout: 10_000 });
  });

  test("delete user action is present", async ({ page }) => {
    const deleteButton = page.getByRole("button", { name: /delete|remove user/i }).first();
    await expect(deleteButton).toBeVisible();
  });

  test("change password section is present", async ({ page }) => {
    const changePasswordSection = page.locator("text=/change password|password|reset password/i").first();
    await expect(changePasswordSection).toBeVisible();
  });

  test("change password flow has current and new password fields", async ({ page }) => {
    const passwordFields = page.locator("input[type='password']");
    const count = await passwordFields.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("LLM key management section is present", async ({ page }) => {
    const llmSection = page.locator("text=/LLM|API key|api key|model|key management/i").first();
    await expect(llmSection).toBeVisible();
  });

  test("LLM key input field is present", async ({ page }) => {
    const keyInput = page.locator("input[type='password'], input[placeholder*='key' i], input[placeholder*='API' i]").first();
    await expect(keyInput).toBeVisible();
  });
});
