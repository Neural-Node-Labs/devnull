import { test, expect } from "@playwright/test";

test.describe("Project Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Navigate to project management page
    const projectsLink = page.getByRole("link", { name: /project|workspace/i });
    if (await projectsLink.isVisible()) {
      await projectsLink.click();
    }
  });

  test("project list is displayed", async ({ page }) => {
    const projectList = page.locator("[data-testid='project-list'], .project-list, ul:has(li)").first();
    await expect(projectList).toBeVisible();
  });

  test("add project button is present", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /add|new|create project/i });
    await expect(addButton).toBeVisible();
  });

  test("add project flow: create a new project", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /add|new|create project/i });
    await addButton.click();

    const projectNameInput = page.getByRole("textbox", { name: /name|project name|title/i });
    await expect(projectNameInput).toBeVisible();
    await projectNameInput.fill("Test Project " + Date.now());

    const confirmButton = page.getByRole("button", { name: /save|create|confirm|submit/i });
    await confirmButton.click();

    // Verify the new project appears in the list
    await expect(page.locator("text=Test Project").first()).toBeVisible({ timeout: 10_000 });
  });

  test("select active project", async ({ page }) => {
    // Click on the first project in the list to select it as active
    const firstProject = page.locator("[data-testid='project-item'], .project-item, li").first();
    await expect(firstProject).toBeVisible();
    await firstProject.click();

    // Verify it's now marked as active/selected
    const activeIndicator = page.locator("[data-testid='active-project'], .active, .selected").first();
    await expect(activeIndicator).toBeVisible();
  });

  test("workspace browser shows files", async ({ page }) => {
    const workspaceSection = page.locator("text=/workspace|browser|files/i").first();
    await expect(workspaceSection).toBeVisible();
  });

  test("workspace file download is available", async ({ page }) => {
    const downloadButton = page.getByRole("button", { name: /download|export|zip/i });
    await expect(downloadButton).toBeVisible();
  });

  test("workspace delete action is present", async ({ page }) => {
    const deleteButton = page.getByRole("button", { name: /delete|remove/i });
    await expect(deleteButton).toBeVisible();
  });

  test("workspace location can be included in LLM context", async ({ page }) => {
    const includeToggle = page.locator("input[type='checkbox'], [role='switch']").first();
    await expect(includeToggle).toBeVisible();
  });
});
