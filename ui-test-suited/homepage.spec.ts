import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";
const API_BASE = "http://localhost:3001";

async function login(page: any) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

test.describe("UI Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("homepage loads and contains expected title", async ({ page }) => {
    await expect(page).toHaveTitle(/devnull UI/);
  });

  test("homepage has a root div for React mount", async ({ page }) => {
    const rootDiv = page.locator("#root");
    await expect(rootDiv).toBeVisible();
  });

  test("homepage loads JS and CSS assets", async ({ page }) => {
    const jsAssets = page.locator("script[type='module']");
    const cssAssets = page.locator("link[rel='stylesheet']");
    await expect(jsAssets).toHaveCount(1);
    await expect(cssAssets).toHaveCount(1);
  });

  test("homepage has a navigation bar", async ({ page }) => {
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("homepage renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${UI_BASE}/`);
    await expect(page.locator("#root")).toBeVisible();
    expect(consoleErrors.length).toBe(0);
  });

  test("homepage shows welcome message with username", async ({ page }) => {
    await expect(page.locator("text=Welcome, admin")).toBeVisible();
  });

  test("homepage shows navigation cards", async ({ page }) => {
    // Cards should include Chat, Projects, Telemetry, Diagnostics, Settings, Admin
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Telemetry" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
  });

  test("homepage shows API health info", async ({ page }) => {
    await expect(page.locator("text=API Version")).toBeVisible();
    await expect(page.locator("text=Status")).toBeVisible();
    await expect(page.locator("text=Online")).toBeVisible();
  });
});
