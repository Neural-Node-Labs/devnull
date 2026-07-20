import { test, expect } from "@playwright/test";
import { UI_BASE, loginAsAdmin } from "./helpers";

test.describe("Home Page (/)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("renders the dashboard with welcome message", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText(/Welcome/);
    await expect(page.locator("text=devnull agent dashboard")).toBeVisible();
  });

  test("shows navigation cards for all main sections", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Telemetry" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
  });

  test("navigation cards link to correct routes", async ({ page }) => {
    const chatCard = page.locator("a[href='/chat']");
    await expect(chatCard).toBeVisible();
    await expect(page.locator("a[href='/projects']")).toBeVisible();
    await expect(page.locator("a[href='/telemetry']")).toBeVisible();
    await expect(page.locator("a[href='/diagnostics']")).toBeVisible();
    await expect(page.locator("a[href='/settings']")).toBeVisible();
    await expect(page.locator("a[href='/admin']")).toBeVisible();
  });

  test("clicking a card navigates to the target page", async ({ page }) => {
    await page.locator("a[href='/chat']").click();
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.locator("h1")).toHaveText("Chat");
  });

  test("shows health info badges when API is available", async ({ page }) => {
    await expect(page.locator("text=API Version")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Status")).toBeVisible();
    await expect(page.locator("text=Online")).toBeVisible();
  });

  test("shows uptime badge", async ({ page }) => {
    await expect(page.locator("text=Uptime")).toBeVisible({ timeout: 10_000 });
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    // Allow some expected errors (e.g. health endpoint timing)
    expect(consoleErrors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });

  test("has a navigation bar", async ({ page }) => {
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("shows the username in the welcome header", async ({ page }) => {
    await expect(page.locator("text=Welcome, admin")).toBeVisible();
  });
});
