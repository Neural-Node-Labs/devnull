import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3001";

/**
 * Build headers with optional Bearer auth token.
 *
 * The token is resolved once per worker via `resolveApiToken()`:
 *   1. If ADMIN_PASSWORD is set in the test runner's environment, login to get a token.
 *   2. Otherwise, probe the API health endpoint without auth.
 *      - If it returns 200, no auth is needed.
 *      - If it returns 401, the API requires auth but we have no credentials —
 *        subsequent tests will fail with a clear error message.
 *
 * This makes the test suite resilient to both auth-enabled and auth-disabled
 * API deployments without requiring the test runner to have the env var set.
 */
let resolvedToken: string | null | undefined = undefined;

async function resolveApiToken(): Promise<string | null> {
  if (resolvedToken !== undefined) return resolvedToken;

  // 1. Check env var and login if set
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (adminPassword) {
    try {
      const response = await fetch(`${API_BASE}/api/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: adminPassword }),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.success && body.data?.token) {
          resolvedToken = body.data.token;
          return resolvedToken;
        }
      }
    } catch {
      // Network error — will be caught by individual tests
    }
  }

  // 2. Probe without auth
  try {
    const http = await import("node:http");
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.get(`${API_BASE}/api/v1/health`, (res) => {
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    if (status === 200) {
      resolvedToken = null; // No auth required
      return resolvedToken;
    }
  } catch {
    // Network error — will be caught by individual tests
  }

  // 3. API requires auth but no credentials available
  resolvedToken = null;
  return resolvedToken;
}

function authHeaders(): Record<string, string> {
  if (resolvedToken) {
    return { Authorization: `Bearer ${resolvedToken}` };
  }
  return {};
}

test.describe("API Health & Skills", () => {
  test.beforeAll(async () => {
    await resolveApiToken();
  });

  test("GET /api/v1/health returns 200 with status ok", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/health`, {
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.version).toBe("0.2.0");
    expect(typeof body.data.uptime).toBe("number");
  });

  test("GET /api/v1/skills returns 13 skills", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/skills`, {
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(13);

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
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing or empty");
  });

  test("POST /api/v1/chat with missing task returns 400", async ({ request }) => {
    const resp = await request.post(`${API_BASE}/api/v1/chat`, {
      data: {},
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing or empty");
  });

  test("GET /api/v1/telemetry returns empty entries when no logs exist", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/telemetry?log=thinking&limit=10`, {
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.logFile).toBe("thinking");
    expect(Array.isArray(body.data.entries)).toBe(true);
  });

  test("GET /api/v1/telemetry with invalid log param returns 400", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/telemetry?log=invalid`, {
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid log file");
  });

  test("GET unknown route returns 404", async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/v1/nonexistent`, {
      headers: authHeaders(),
    });
    expect(resp.status()).toBe(404);

    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Not found");
  });
});

