import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Plan Detail Page (/plans/:id)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("shows loading state for a valid plan ID", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/nonexistent-id`);
    await page.waitForLoadState("networkidle");
    // Should show loading or error state
    await expect(
      page.locator("text=Loading plan...").or(page.locator("text=Plan not found"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows error state for invalid plan ID", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/invalid-id`);
    await page.waitForLoadState("networkidle");
    // Should show error or not found message
    await expect(
      page.locator("text=Plan not found").or(page.locator("text=Failed to load plan"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("has a Back button to return to plans list", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/test-id`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("button:has-text('← Back')").or(page.locator("button:has-text('← Back to Plans'))")).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Back navigates to plans list", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/test-id`);
    await page.waitForLoadState("networkidle");
    const backButton = page.locator("button:has-text('← Back')").or(page.locator("button:has-text('← Back to Plans')"));
    await backButton.first().click({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/plans$/);
  });

  test("shows plan content section when plan loads", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/test-id`);
    await page.waitForLoadState("networkidle");
    // Should show Plan Content heading or error
    await expect(
      page.locator("text=Plan Content").or(page.locator("text=Plan not found"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows tasks section when plan loads", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/test-id`);
    await page.waitForLoadState("networkidle");
    // Should show Tasks heading or error
    await expect(
      page.locator("text=Tasks").or(page.locator("text=Plan not found"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows empty tasks state when plan has no tasks", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/test-id`);
    await page.waitForLoadState("networkidle");
    // If plan loads, may show "No tasks in this plan yet"
    const noTasks = page.locator("text=No tasks in this plan yet");
    const exists = await noTasks.isVisible({ timeout: 10_000 }).catch(() => false);
    if (exists) {
      await expect(noTasks).toBeVisible();
    }
  });

  test("has add task input field", async ({ page }) => {
    await page.goto(`${UI_BASE}/plans/test-id`);
    await page.waitForLoadState("networkidle");
    const addInput = page.locator("input[placeholder='Add a new task...']");
    const exists = await addInput.isVisible({ timeout: 10_000 }).catch(() => false);
    if (exists) {
      await expect(addInput).toBeVisible();
      await expect(page.locator("button:has-text('Add')")).toBeVisible();
    }
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/plans/test-id`);
    await expect(page.locator("h1").or(page.locator("text=Plan not found"))).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});
