import { Page, expect } from "@playwright/test";

export const UI_BASE = "http://localhost:8080";
export const API_BASE = "http://localhost:3001";

/**
 * Login as admin via the UI login form.
 * Assumes the admin user (admin/admin1234) already exists.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto(`${UI_BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin1234");
  await page.click("button[type='submit']");
  await page.waitForURL("**/");
}

/**
 * Navigate to a page and wait for it to load.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(`${UI_BASE}${path}`);
  await page.waitForLoadState("networkidle");
}

/**
 * Register the first user (admin) if no users exist yet.
 * Returns true if registration was performed, false if users already exist.
 */
export async function registerFirstUser(page: Page) {
  await page.goto(`${UI_BASE}/login`);
  await page.waitForLoadState("networkidle");

  // Check if we're in register mode
  const registerBtn = page.locator("button[type='submit']");
  const btnText = await registerBtn.textContent();
  if (btnText?.includes("Register")) {
    await page.fill("#username", "admin");
    await page.fill("#password", "admin1234");
    await registerBtn.click();
    await page.waitForURL("**/");
    return true;
  }
  return false;
}
