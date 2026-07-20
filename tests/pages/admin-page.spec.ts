import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Admin Page (/admin)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/admin`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the admin page with title and description", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Admin Panel");
    await expect(page.locator("text=User management and system administration")).toBeVisible();
  });

  test("shows user management section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("has an Add User button", async ({ page }) => {
    const addUserButton = page.locator("button:has-text('Add User')");
    await expect(addUserButton).toBeVisible();
  });

  test("clicking Add User opens the add user form", async ({ page }) => {
    await page.locator("button:has-text('Add User')").click();
    await expect(page.locator("input[aria-label='Username']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.locator("select[data-testid='role-selector']")).toBeVisible();
    await expect(page.locator("button:has-text('Create User')")).toBeVisible();
  });

  test("add user form has role selector with User and Admin options", async ({ page }) => {
    await page.locator("button:has-text('Add User')").click();
    const roleSelector = page.locator("select[data-testid='role-selector']");
    const options = await roleSelector.locator("option").allTextContents();
    expect(options).toContain("User");
    expect(options).toContain("Admin");
  });

  test("clicking Cancel closes the add user form", async ({ page }) => {
    await page.locator("button:has-text('Add User')").click();
    await expect(page.locator("input[aria-label='Username']")).toBeVisible();
    await page.locator("button:has-text('Cancel')").click();
    await expect(page.locator("input[aria-label='Username']")).not.toBeVisible();
  });

  test("shows user list table with correct columns", async ({ page }) => {
    const userList = page.locator("[data-testid='user-list']");
    await expect(userList).toBeVisible();
    const table = userList.locator("table");
    await expect(table).toBeVisible();
    // Check column headers
    await expect(table.locator("th")).toHaveText(["ID", "Username", "Role", "Created", "Actions"]);
  });

  test("displays users in the table", async ({ page }) => {
    const userList = page.locator("[data-testid='user-list']");
    await expect(userList).toBeVisible();
    // Should have at least one user row (the admin user)
    const rows = userList.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
  });

  test("each user row has Edit and Delete action buttons", async ({ page }) => {
    const firstRow = page.locator("[data-testid='user-list'] tbody tr").first();
    await expect(firstRow.locator("button:has-text('Edit')")).toBeVisible();
    await expect(firstRow.locator("button:has-text('Delete')")).toBeVisible();
  });

  test("clicking Edit on a user opens inline edit mode", async ({ page }) => {
    const editButton = page.locator("button:has-text('Edit')").first();
    await editButton.click();
    // Should show Save and Cancel buttons
    await expect(page.locator("button:has-text('Save')").first()).toBeVisible();
    await expect(page.locator("button:has-text('Cancel')").first()).toBeVisible();
  });

  test("inline edit mode shows username input and role selector", async ({ page }) => {
    await page.locator("button:has-text('Edit')").first().click();
    await expect(page.locator("input[aria-label='Username']").first()).toBeVisible();
    await expect(page.locator("select[data-testid='role-selector']").first()).toBeVisible();
  });

  test("clicking Cancel in edit mode closes inline editing", async ({ page }) => {
    await page.locator("button:has-text('Edit')").first().click();
    await expect(page.locator("button:has-text('Save')").first()).toBeVisible();
    await page.locator("button:has-text('Cancel')").first().click();
    await expect(page.locator("button:has-text('Save')")).not.toBeVisible();
  });

  test("shows success message after creating a user", async ({ page }) => {
    await page.locator("button:has-text('Add User')").click();
    const username = `testadmin_${Date.now()}`;
    await page.locator("input[aria-label='Username']").fill(username);
    await page.locator("input[type='password']").first().fill("TestPass123!");
    await page.locator("button:has-text('Create User')").click();
    // Should show success message
    await expect(page.locator(`text=User "${username}" created`)).toBeVisible({ timeout: 10_000 });
  });

  test("shows error for empty username on create", async ({ page }) => {
    await page.locator("button:has-text('Add User')").click();
    await page.locator("input[type='password']").first().fill("TestPass123!");
    await page.locator("button:has-text('Create User')").click();
    await expect(page.locator("text=Username and password are required")).toBeVisible();
  });

  test("non-admin users cannot access admin page", async ({ page }) => {
    // Login as a regular user
    await page.goto(`${UI_BASE}/login`);
    await page.fill("#username", "admin");
    await page.fill("#password", "admin1234");
    await page.click("button[type='submit']");
    await page.waitForURL("**/");

    // Try to navigate to admin
    await page.goto(`${UI_BASE}/admin`);
    // Should redirect away from admin (to home or login)
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/admin`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});
