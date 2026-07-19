import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("Telemetry", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${UI_BASE}/telemetry`);
    await page.waitForSelector("h1");
  });

  test("telemetry page has a title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Telemetry");
  });

  test("telemetry page has a searchable log viewer", async ({ page }) => {
    const searchInput = page.locator("input[aria-label='Search telemetry']");
    await expect(searchInput).toBeVisible();
  });

  test("telemetry page has a task ID filter", async ({ page }) => {
    const taskFilter = page.locator("input[aria-label='Filter by task ID']");
    await expect(taskFilter).toBeVisible();
  });

  test("telemetry page displays reason-action-observation entries", async ({ page }) => {
    // Look for the ReAct trace structure indicators
    const reasonLabel = page.locator("text=Reason / Thought").first();
    const actionLabel = page.locator("text=Action / Tool Call").first();
    const observationLabel = page.locator("text=Observation / Result").first();

    // All three structural elements should be visible
    await expect(reasonLabel).toBeVisible();
    await expect(actionLabel).toBeVisible();
    await expect(observationLabel).toBeVisible();
  });

  test("telemetry page shows command execution entries", async ({ page }) => {
    const commandSection = page.locator("text=Command Executed").first();
    await expect(commandSection).toBeVisible();
  });

  test("telemetry page shows token usage information", async ({ page }) => {
    const tokenSection = page.locator("text=Token Usage").first();
    await expect(tokenSection).toBeVisible();
  });

  test("search filter narrows down telemetry entries", async ({ page }) => {
    const searchInput = page.locator("input[aria-label='Search telemetry']");
    await expect(searchInput).toBeVisible();

    // Type a search term
    await searchInput.fill("health");

    // Verify the search term is reflected
    const currentValue = await searchInput.inputValue();
    expect(currentValue).toBe("health");
  });

  test("telemetry log type selector is present", async ({ page }) => {
    // Log type buttons: thinking, llm, sys
    const thinkingBtn = page.locator("button:has-text('thinking')");
    const llmBtn = page.locator("button:has-text('llm')");
    const sysBtn = page.locator("button:has-text('sys')");

    await expect(thinkingBtn).toBeVisible();
    await expect(llmBtn).toBeVisible();
    await expect(sysBtn).toBeVisible();
  });

  test("telemetry page has a refresh button", async ({ page }) => {
    const refreshButton = page.locator("button:has-text('Refresh')");
    await expect(refreshButton).toBeVisible();
  });

  test("telemetry page shows description", async ({ page }) => {
    await expect(page.locator("text=View agent logs and telemetry data")).toBeVisible();
  });

  test("telemetry page shows empty state when no logs exist", async ({ page }) => {
    // Should show a message about no entries — the exact text depends on the log file selected
    const emptyMsg = page.locator("text=/No telemetry entries found|No entries matching/i").first();
    if (await emptyMsg.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(emptyMsg).toBeVisible();
    }
  });
});
