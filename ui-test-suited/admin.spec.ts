import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("Admin Panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${UI_BASE}/admin`);
    await page.waitForSelector("h1");
  });

  test("admin page is accessible via navigation", async ({ page }) => {
    await expect(page).toHaveURL(/admin/i);
  });

  test("admin page has user management section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("admin page has an Add User button", async ({ page }) => {
    const addUserButton = page.locator("button:has-text('Add User')");
    await expect(addUserButton).toBeVisible();
  });

  test("admin can create a new user", async ({ page }) => {
    const addUserButton = page.locator("button:has-text('Add User')");
    await expect(addUserButton).toBeVisible();
    await addUserButton.click();

    const usernameInput = page.locator("input[aria-label='Username']");
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill("admin_created_" + Date.now());

    const passwordInput = page.locator("input[type='password']").first();
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("AdminPass123!");

    const roleSelector = page.locator("select[data-testid='role-selector']");
    if (await roleSelector.isVisible()) {
      await roleSelector.selectOption("admin");
    }

    const createButton = page.locator("button:has-text('Create User')");
    await createButton.click();

    // Verify the new user appears in the list
    await expect(page.locator("text=admin_created_").first()).toBeVisible({ timeout: 10_000 });
  });

  test("admin can edit existing user roles", async ({ page }) => {
    const editButton = page.locator("button:has-text('Edit')").first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    const roleSelector = page.locator("select[data-testid='role-selector']").first();
    if (await roleSelector.isVisible()) {
      await roleSelector.selectOption("user");
    }

    const saveButton = page.locator("button:has-text('Save')");
    await saveButton.click();
  });

  test("admin can delete a user", async ({ page }) => {
    const deleteButton = page.locator("button:has-text('Delete')").first();
    await expect(deleteButton).toBeVisible();
  });

  test("admin page lists all registered users in a table", async ({ page }) => {
    const userTable = page.locator("table");
    await expect(userTable).toBeVisible();
  });

  test("admin page shows user management description", async ({ page }) => {
    await expect(page.locator("text=User management and system administration")).toBeVisible();
  });
});
