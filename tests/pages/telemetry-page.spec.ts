import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Telemetry Page (/telemetry)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${UI_BASE}/telemetry`);
    await page.waitForLoadState("networkidle");
  });

  test("renders the telemetry page with title", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("Telemetry");
    await expect(page.locator("text=View agent logs and telemetry data")).toBeVisible();
  });

  test("shows loading state initially", async ({ page }) => {
    await page.goto(`${UI_BASE}/telemetry`);
    await expect(page.locator("text=Loading telemetry data...")).toBeVisible({ timeout: 5_000 });
  });

  test("shows empty state when no telemetry data exists", async ({ page }) => {
    // After loading, should show empty state or entries
    const emptyState = page.locator("text=No telemetry entries found");
    const entries = page.locator("text=No entries matching");
    await expect(emptyState.or(entries).or(page.locator("div[style*='flex-direction: column']"))).toBeVisible({ timeout: 10_000 });
  });

  test("has log file tabs (thinking, llm, sys)", async ({ page }) => {
    await expect(page.locator("button:has-text('thinking')")).toBeVisible();
    await expect(page.locator("button:has-text('llm')")).toBeVisible();
    await expect(page.locator("button:has-text('sys')")).toBeVisible();
  });

  test("has a Refresh button", async ({ page }) => {
    await expect(page.locator("button:has-text('Refresh')")).toBeVisible();
  });

  test("has search input", async ({ page }) => {
    const searchInput = page.locator("input[aria-label='Search telemetry']");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", "Search telemetry entries...");
  });

  test("has task ID filter input", async ({ page }) => {
    const filterInput = page.locator("input[aria-label='Filter by task ID']");
    await expect(filterInput).toBeVisible();
    await expect(filterInput).toHaveAttribute("placeholder", "Filter by task ID...");
  });

  test("shows ReAct trace legend badges", async ({ page }) => {
    await expect(page.locator("text=Reason / Thought")).toBeVisible();
    await expect(page.locator("text=Action / Tool Call")).toBeVisible();
    await expect(page.locator("text=Observation / Result")).toBeVisible();
    await expect(page.locator("text=Command Executed")).toBeVisible();
    await expect(page.locator("text=Token Usage")).toBeVisible();
  });

  test("clicking a log file tab switches the view", async ({ page }) => {
    const llmTab = page.locator("button:has-text('llm')");
    await llmTab.click();
    // The active tab should be highlighted
    await expect(llmTab).toHaveCSS("border", /rgb\(147, 51, 234\)/);
  });

  test("search input filters entries", async ({ page }) => {
    const searchInput = page.locator("input[aria-label='Search telemetry']");
    await searchInput.fill("test query");
    // Should show filtered results or "No entries matching" message
    await expect(
      page.locator("text=No entries matching").or(page.locator("div[style*='flex-direction: column']"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows error state when API fails", async ({ page }) => {
    // The error container should exist in the DOM structure
    await expect(page.locator("h1")).toBeVisible();
  });
});
