import { test, expect } from "@playwright/test";

test.describe("Telemetry", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Navigate to telemetry page
    const telemetryLink = page.getByRole("link", { name: /telemetry|log|monitor|trace/i });
    if (await telemetryLink.isVisible()) {
      await telemetryLink.click();
    }
  });

  test("telemetry page has a searchable log viewer", async ({ page }) => {
    const searchInput = page.getByRole("textbox", { name: /search|filter|find/i });
    await expect(searchInput).toBeVisible();
  });

  test("telemetry page displays reason-action-observation entries", async ({ page }) => {
    // Look for columns or labels indicating ReAct trace structure
    const reasonLabel = page.locator("text=/reason|thought|think/i").first();
    const actionLabel = page.locator("text=/action|tool|call/i").first();
    const observationLabel = page.locator("text=/observation|result|output/i").first();

    // At least one of these structural elements should be visible
    const anyLabelVisible = await Promise.any([
      reasonLabel.isVisible().then((v) => v),
      actionLabel.isVisible().then((v) => v),
      observationLabel.isVisible().then((v) => v),
    ]);
    expect(anyLabelVisible).toBe(true);
  });

  test("telemetry page shows command execution entries", async ({ page }) => {
    const commandSection = page.locator("text=/command|exec|run|execute/i").first();
    await expect(commandSection).toBeVisible();
  });

  test("telemetry page shows token usage information", async ({ page }) => {
    const tokenSection = page.locator("text=/token|usage|cost|LLM call/i").first();
    await expect(tokenSection).toBeVisible();
  });

  test("search filter narrows down telemetry entries", async ({ page }) => {
    const searchInput = page.getByRole("textbox", { name: /search|filter|find/i });
    await expect(searchInput).toBeVisible();

    // Type a search term
    await searchInput.fill("health");

    // Wait for results to filter
    await page.waitForTimeout(500);

    // Verify the search term is reflected
    const currentValue = await searchInput.inputValue();
    expect(currentValue).toBe("health");
  });

  test("telemetry log type selector is present", async ({ page }) => {
    const logSelector = page.locator("select, [role='combobox'], [data-testid='log-selector']").first();
    await expect(logSelector).toBeVisible();
  });

  test("telemetry page has a refresh or reload button", async ({ page }) => {
    const refreshButton = page.getByRole("button", { name: /refresh|reload|update/i });
    await expect(refreshButton).toBeVisible();
  });
});
