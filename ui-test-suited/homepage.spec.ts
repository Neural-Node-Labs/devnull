import { test, expect } from "@playwright/test";

test.describe("UI Homepage", () => {
  test("homepage loads and contains expected title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/devnull UI/);
  });

  test("homepage has a root div for React mount", async ({ page }) => {
    await page.goto("/");
    const rootDiv = page.locator("#root");
    await expect(rootDiv).toBeVisible();
  });

  test("homepage loads JS and CSS assets", async ({ page }) => {
    await page.goto("/");

    const jsAssets = page.locator("script[type='module']");
    const cssAssets = page.locator("link[rel='stylesheet']");

    await expect(jsAssets).toHaveCount(1);
    await expect(cssAssets).toHaveCount(1);
  });

  test("homepage navigation links are present", async ({ page }) => {
    await page.goto("/");

    // Expect navigation elements based on ui.md requirements
    const nav = page.locator("nav, header, [role='navigation']");
    await expect(nav).toBeVisible();
  });

  test("homepage renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");

    // Wait for the React app to mount
    await expect(page.locator("#root")).toBeVisible();

    expect(consoleErrors.length).toBe(0);
  });
});
