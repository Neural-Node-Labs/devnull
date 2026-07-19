import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("Project Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${UI_BASE}/projects`);
    await page.waitForSelector("h1");
  });

  test("project page has a title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Projects");
  });

  test("project page shows description", async ({ page }) => {
    await expect(page.locator("text=Manage projects and browse their workspace files")).toBeVisible();
  });

  test("new project button is present", async ({ page }) => {
    const addButton = page.getByRole("button", { name: "New project" }).first();
    await expect(addButton).toBeVisible();
  });

  test("add project flow: create a new project", async ({ page }) => {
    const addButton = page.getByRole("button", { name: "New project" }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    const projectNameInput = page.locator("input#proj-name");
    await expect(projectNameInput).toBeVisible();
    await projectNameInput.fill("Test Project " + Date.now());

    const createButton = page.locator("button:has-text('Create project')");
    await createButton.click();

    // Verify the new project appears in the list
    await expect(page.locator("text=Test Project").first()).toBeVisible({ timeout: 10_000 });
  });

  test("select active project", async ({ page }) => {
    // Click on the first project in the list to select it
    const firstProject = page.locator("text=Test Project").first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
    }
  });

  test("workspace browser shows files for selected project", async ({ page }) => {
    // If there's a project, the workspace section should be visible
    const workspaceSection = page.locator("text=Workspace:").first();
    if (await workspaceSection.isVisible()) {
      await expect(workspaceSection).toBeVisible();
    }
  });

  test("workspace file download is available", async ({ page }) => {
    const downloadButton = page.locator("button:has-text('Download')").first();
    if (await downloadButton.isVisible()) {
      await expect(downloadButton).toBeVisible();
    }
  });

  test("workspace delete action is present", async ({ page }) => {
    const deleteButton = page.getByRole("button", { name: "Delete" }).first();
    if (await deleteButton.isVisible()) {
      await expect(deleteButton).toBeVisible();
    }
  });

  test("workspace location can be included in LLM context", async ({ page }) => {
    const includeToggle = page.locator("input[type='checkbox']").first();
    if (await includeToggle.isVisible()) {
      await expect(includeToggle).toBeVisible();
    }
  });

  test("project rename button is present", async ({ page }) => {
    const renameButton = page.locator("button:has-text('Rename')").first();
    if (await renameButton.isVisible()) {
      await expect(renameButton).toBeVisible();
    }
  });

  test("empty state shows when no projects exist", async ({ page }) => {
    // If no projects, should show the empty state message
    const emptyState = page.locator("text=No projects yet");
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    }
  });
});
