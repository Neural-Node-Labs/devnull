import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3001";
const UI_BASE = "http://localhost:8080";

// ─── API Tests ──────────────────────────────────────────────────────────────

test.describe("devnull API (Docker deployment)", () => {
  test("GET /api/v1/health returns 200 with status ok", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/health`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.version).toBe("0.1.0");
    expect(typeof body.data.uptime).toBe("number");
  });

  test("GET /api/v1/skills returns 13 skills", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/skills`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(13);

    // Verify a few expected skills are present
    const names = body.data.map((s: { name: string }) => s.name);
    expect(names).toContain("programmer");
    expect(names).toContain("architect");
    expect(names).toContain("devops");
    expect(names).toContain("docker-expert");
    expect(names).toContain("playwright-ui-tester");
  });

  test("POST /api/v1/chat with empty task returns 400", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/api/v1/chat`, {
      data: { task: "" },
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing or empty");
  });

  test("POST /api/v1/chat with missing task returns 400", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/api/v1/chat`, {
      data: {},
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing or empty");
  });

  test("GET /api/v1/telemetry returns empty entries when no logs exist", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/telemetry?log=thinking&limit=10`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.logFile).toBe("thinking");
    expect(Array.isArray(body.data.entries)).toBe(true);
  });

  test("GET /api/v1/telemetry with invalid log param returns 400", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/telemetry?log=invalid`);
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid log file");
  });

  test("GET unknown route returns 404", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/nonexistent`);
    expect(resp.status()).toBe(404);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Not found");
  });
});

// ─── UI Tests ───────────────────────────────────────────────────────────────

test.describe("devnull UI (Docker deployment)", () => {
  test("UI homepage loads and contains expected title", async ({ page }) => {
    await page.goto(UI_BASE);
    await expect(page).toHaveTitle(/devnull UI/);
  });

  test("UI page has a root div for React mount", async ({ page }) => {
    await page.goto(UI_BASE);
    const rootDiv = page.locator("#root");
    await expect(rootDiv).toBeVisible();
  });

  test("UI loads JS and CSS assets", async ({ page }) => {
    await page.goto(UI_BASE);

    // Check that JS and CSS assets are loaded
    const jsAssets = page.locator("script[type='module']");
    const cssAssets = page.locator("link[rel='stylesheet']");

    await expect(jsAssets).toHaveCount(1);
    await expect(cssAssets).toHaveCount(1);
  });
});
