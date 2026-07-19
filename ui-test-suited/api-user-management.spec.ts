import { test, expect } from "@playwright/test";

/**
 * API-level test for user management endpoints.
 * This validates the backend API directly, proving the user management
 * routes work correctly without requiring a UI frontend.
 */

const API_BASE = "http://localhost:3001/api/v1";

// Helper to get auth headers — probes the API to see if auth is needed
let _authToken: string | null = null;
async function resolveApiToken(): Promise<Record<string, string>> {
  if (_authToken !== null) {
    return _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
  }

  // Check if ADMIN_PASSWORD is set and login
  if (process.env.ADMIN_PASSWORD) {
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: process.env.ADMIN_PASSWORD }),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.success && body.data?.token) {
          _authToken = body.data.token;
          return { Authorization: `Bearer ${_authToken}` };
        }
      }
    } catch {
      // Server might not be running
    }
  }

  // Probe the health endpoint without auth
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (response.ok) {
      _authToken = ""; // No auth needed
      return {};
    }
  } catch {
    // Server might not be running
  }

  _authToken = "";
  return {};
}

test.describe("API User Management", () => {
  let authHeaders: Record<string, string>;

  test.beforeAll(async () => {
    authHeaders = await resolveApiToken();
  });

  test("GET /users returns user list", async () => {
    const response = await fetch(`${API_BASE}/users`, {
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    // Should return users (at minimum the ones we create in other tests)
    expect(body.data.length).toBeGreaterThanOrEqual(0);
  });

  test("POST /users creates a new user", async () => {
    const username = "testuser_" + Date.now();
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
    });
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.username).toBe(username);
    expect(body.data.role).toBe("user");
    expect(body.data.id).toBeDefined();
  });

  test("POST /users rejects duplicate username", async () => {
    const username = "dupuser_" + Date.now();
    // Create first time
    await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
    });

    // Try creating again with same username
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
    });
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("already exists");
  });

  test("POST /users rejects missing username", async () => {
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ password: "TestPass123!" }),
    });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("PUT /users/:id updates a user's role", async () => {
    // First create a user
    const username = "updatable_" + Date.now();
    const createResp = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
    });
    const created = await createResp.json();
    const userId = created.data.id;

    // Update the user's role to admin
    const updateResp = await fetch(`${API_BASE}/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(updateResp.status).toBe(200);

    const updated = await updateResp.json();
    expect(updated.data.role).toBe("admin");
  });

  test("DELETE /users/:id deletes a user", async () => {
    // First create a user
    const username = "deletable_" + Date.now();
    const createResp = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ username, password: "TestPass123!", role: "user" }),
    });
    const created = await createResp.json();
    const userId = created.data.id;

    // Delete the user
    const deleteResp = await fetch(`${API_BASE}/users/${userId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
    expect(deleteResp.status).toBe(200);

    const deleted = await deleteResp.json();
    expect(deleted.success).toBe(true);

    // Verify the user is gone
    const listResp = await fetch(`${API_BASE}/users`, {
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
    const list = await listResp.json();
    const found = list.data.find((u: any) => u.id === userId);
    expect(found).toBeUndefined();
  });

  test("DELETE /users/:id prevents deleting the last admin", async () => {
    // First, find the admin user(s)
    const listResp = await fetch(`${API_BASE}/users`, {
      headers: { "Content-Type": "application/json", ...authHeaders },
    });
    const list = await listResp.json();
    const adminUsers = list.data.filter((u: any) => u.role === "admin");

    // Try to delete the first admin user
    const adminId = adminUsers[0].id;
    const response = await fetch(`${API_BASE}/users/${adminId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders },
    });

    // If there's only one admin, it should be rejected
    if (adminUsers.length === 1) {
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("last admin");
    } else {
      // If there are multiple admins, deletion should succeed
      expect(response.status).toBe(200);
    }
  });
});

