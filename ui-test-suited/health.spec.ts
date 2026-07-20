import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:3001";

/**
 * Build headers with optional Bearer auth token.
 *
 * The token is resolved once per worker via `resolveApiToken()`:
 *   1. Try to register the first user (works when no users exist).
 *   2. If registration fails (users already exist), try login.
 *   3. If both fail, run without auth (tests will fail with clear error).
 */
let resolvedToken: string | null | undefined = undefined;

async function resolveApiToken(): Promise<string | null> {
  if (resolvedToken !== undefined) return resolvedToken;

  // 1. Try to register the first user
  try {
    const response = await fetch(`${API_BASE}/api/v1/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testadmin", password: "TestPass123!" }),
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

  // 2. Try login (users already exist)
  try {
    const response = await fetch(`${API_BASE}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testadmin", password: "TestPass123!" }),
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

  // 3. No auth available
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
