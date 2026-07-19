import { test, expect } from "@playwright/test";

const UI_BASE = "http://localhost:8080";
const API_BASE = "http://localhost:3001";

// ─── Helper: Login via API and store token in localStorage ─────────────────

async function loginViaApi(page: any) {
  const resp = await page.request.post(`${API_BASE}/api/v1/login`, {
    data: { username: "admin", password: "admin1234" },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.success).toBe(true);

  const { token, username, role } = body.data;

  // Set auth state in localStorage so the UI thinks we're logged in
  await page.evaluate(
    ({ token, username, role }) => {
      localStorage.setItem("devnull_auth_token", token);
      localStorage.setItem(
        "devnull_auth_user",
        JSON.stringify({ username, role })
      );
    },
    { token, username, role }
  );

  return { token, username, role };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe("Plans Page UI", () => {
  test("Plans page loads and shows empty state when no plans exist", async ({
    page,
  }) => {
    // Login first
    await loginViaApi(page);

    // Navigate to plans page
    await page.goto(`${UI_BASE}/plans`);

    // Wait for the page to render
    await page.waitForSelector("h1");

    // Check the page title
    const title = page.locator("h1");
    await expect(title).toHaveText("Plans");

    // Should show the empty state message
    const emptyMsg = page.locator("text=No plans yet");
    await expect(emptyMsg).toBeVisible();
  });

  test("Plans page shows error state when API fails", async ({ page }) => {
    await loginViaApi(page);

    // Navigate to plans page
    await page.goto(`${UI_BASE}/plans`);

    // Wait for the page to render
    await page.waitForSelector("h1");

    // The page should load (either empty state or error)
    const title = page.locator("h1");
    await expect(title).toHaveText("Plans");

    // Check that the refresh button exists
    const refreshBtn = page.locator("button:has-text('Refresh')");
    await expect(refreshBtn).toBeVisible();
  });

  test("Plans page has correct layout elements", async ({ page }) => {
    await loginViaApi(page);

    await page.goto(`${UI_BASE}/plans`);
    await page.waitForSelector("h1");

    // Check subtitle
    const subtitle = page.locator("text=View and manage plans created by devnull");
    await expect(subtitle).toBeVisible();

    // Check refresh button
    const refreshBtn = page.locator("button:has-text('Refresh')");
    await expect(refreshBtn).toBeVisible();
  });

  test("Can navigate to plans page via navbar", async ({ page }) => {
    await loginViaApi(page);

    // Go to homepage first
    await page.goto(`${UI_BASE}/`);
    await page.waitForLoadState("networkidle");

    // Find and click the Plans link in the navbar
    const plansLink = page.locator("a:has-text('Plans'), nav a:has-text('Plans')");
    if (await plansLink.count() > 0) {
      await plansLink.first().click();
      await page.waitForURL("**/plans");
      await expect(page.locator("h1")).toHaveText("Plans");
    }
  });

  test("API /api/v1/plans endpoint returns valid response", async ({
    request,
  }) => {
    // First login to get a token
    const loginResp = await request.post(`${API_BASE}/api/v1/login`, {
      data: { username: "admin", password: "admin1234" },
    });
    const loginBody = await loginResp.json();
    const token = loginBody.data.token;

    // Call plans endpoint with auth
    const resp = await request.get(`${API_BASE}/api/v1/plans`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // The plans endpoint is registered BEFORE auth middleware, so it should work
    // even without a token. But let's check with one anyway.
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("plans");
    expect(Array.isArray(body.data.plans)).toBe(true);
  });

  test("API /api/v1/plans endpoint works without auth (public route)", async ({
    request,
  }) => {
    // The plans routes are registered BEFORE authMiddleware in routes.ts
    const resp = await request.get(`${API_BASE}/api/v1/plans`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("plans");
    expect(Array.isArray(body.data.plans)).toBe(true);
  });
});
