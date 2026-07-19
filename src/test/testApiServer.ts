/**
 * API server test suite.
 *
 * Tests the devnull HTTP API endpoints with and without authentication.
 * Runs against a real Express server on a fixed port.
 *
 * Usage:
 *   node dist/test/testApiServer.js
 *
 * Environment:
 *   ADMIN_PASSWORD  — if set, tests auth-required behavior (login + token); if unset, tests open-access mode
 */

import http from "node:http";
import { startApiServer } from "../api/server.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let server: http.Server;
let baseUrl: string;
let apiToken: string | null;
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function fetchJson(
  url: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Use provided token if explicitly set (even empty string means no auth),
  // otherwise fall back to the global apiToken.
  const token = "token" in opts ? opts.token : apiToken;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: opts.method ?? "GET",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body: unknown;
          try {
            body = JSON.parse(data);
          } catch {
            body = data;
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on("error", reject);
    if (opts.body !== undefined) {
      req.write(JSON.stringify(opts.body));
    }
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

async function testHealthEndpoint(): Promise<void> {
  console.log("\n--- Health endpoint ---");

  const { status, body } = await fetchJson(`${baseUrl}/api/v1/health`);
  assertEqual(status, 200, "GET /api/v1/health returns 200");
  const b = body as Record<string, unknown>;
  assertEqual(b.success, true, "response.success === true");
  const data = b.data as Record<string, unknown>;
  assert(typeof data?.status === "string", "data.status is a string");
  assert(typeof data?.version === "string", "data.version is a string");
  assert(typeof data?.uptime === "number", "data.uptime is a number");
}

async function testChatEndpointValidation(): Promise<void> {
  console.log("\n--- Chat endpoint validation ---");

  // Missing task field
  const r1 = await fetchJson(`${baseUrl}/api/v1/chat`, {
    method: "POST",
    body: {},
  });
  assertEqual(r1.status, 400, "POST /api/v1/chat with empty body returns 400");
  const b1 = r1.body as Record<string, unknown>;
  assertEqual(b1.success, false, "response.success === false");
  assert(typeof b1.error === "string", "response.error is a string");

  // Empty task string
  const r2 = await fetchJson(`${baseUrl}/api/v1/chat`, {
    method: "POST",
    body: { task: "" },
  });
  assertEqual(r2.status, 400, "POST /api/v1/chat with empty task returns 400");

  // Non-string task
  const r3 = await fetchJson(`${baseUrl}/api/v1/chat`, {
    method: "POST",
    body: { task: 42 },
  });
  assertEqual(r3.status, 400, "POST /api/v1/chat with non-string task returns 400");
}

async function testTelemetryEndpoint(): Promise<void> {
  console.log("\n--- Telemetry endpoint ---");

  // Valid log file
  const r1 = await fetchJson(`${baseUrl}/api/v1/telemetry?log=thinking&limit=5`);
  assertEqual(r1.status, 200, "GET /api/v1/telemetry?log=thinking returns 200");
  const b1 = r1.body as Record<string, unknown>;
  assertEqual(b1.success, true, "response.success === true");
  const d1 = b1.data as Record<string, unknown>;
  assertEqual(d1.logFile, "thinking", "data.logFile === 'thinking'");
  assert(Array.isArray(d1.entries), "data.entries is an array");

  // Invalid log file
  const r2 = await fetchJson(`${baseUrl}/api/v1/telemetry?log=nonexistent`);
  assertEqual(r2.status, 400, "GET /api/v1/telemetry?log=nonexistent returns 400");
  const b2 = r2.body as Record<string, unknown>;
  assertEqual(b2.success, false, "response.success === false");

  // Default params
  const r3 = await fetchJson(`${baseUrl}/api/v1/telemetry`);
  assertEqual(r3.status, 200, "GET /api/v1/telemetry with no params returns 200");
}

async function testSkillsEndpoint(): Promise<void> {
  console.log("\n--- Skills endpoint ---");

  const { status, body } = await fetchJson(`${baseUrl}/api/v1/skills`);
  assertEqual(status, 200, "GET /api/v1/skills returns 200");
  const b = body as Record<string, unknown>;
  assertEqual(b.success, true, "response.success === true");
  const data = b.data as Array<Record<string, unknown>>;
  assert(Array.isArray(data), "data is an array");
  assert(data.length > 0, "data has at least one skill");
  assert(typeof data[0].name === "string", "first skill has a name");
  assert(typeof data[0].role === "string", "first skill has a role");
}

async function test404(): Promise<void> {
  console.log("\n--- 404 handling ---");

  const { status, body } = await fetchJson(`${baseUrl}/api/v1/nonexistent`);
  assertEqual(status, 404, "GET /api/v1/nonexistent returns 404");
  const b = body as Record<string, unknown>;
  assertEqual(b.success, false, "response.success === false");
  assertEqual(b.error, "Not found", "response.error === 'Not found'");
}

async function testLoginEndpoint(): Promise<void> {
  console.log("\n--- Login endpoint ---");

  // Login with correct credentials
  const r1 = await fetchJson(`${baseUrl}/api/v1/login`, {
    method: "POST",
    body: { username: "admin", password: "admin" },
    token: undefined,
  });
  assertEqual(r1.status, 200, "POST /api/v1/login with correct credentials returns 200");
  const b1 = r1.body as Record<string, unknown>;
  assertEqual(b1.success, true, "response.success === true");
  const d1 = b1.data as Record<string, unknown>;
  assert(typeof d1.token === "string", "response.data.token is a string");
  assertEqual(d1.username, "admin", "response.data.username === 'admin'");
  assertEqual(d1.role, "admin", "response.data.role === 'admin'");

  // Login with wrong password
  const r2 = await fetchJson(`${baseUrl}/api/v1/login`, {
    method: "POST",
    body: { username: "admin", password: "wrong" },
    token: undefined,
  });
  assertEqual(r2.status, 401, "POST /api/v1/login with wrong password returns 401");
  const b2 = r2.body as Record<string, unknown>;
  assertEqual(b2.success, false, "response.success === false");

  // Login with missing fields
  const r3 = await fetchJson(`${baseUrl}/api/v1/login`, {
    method: "POST",
    body: {},
    token: undefined,
  });
  assertEqual(r3.status, 400, "POST /api/v1/login with empty body returns 400");
  const b3 = r3.body as Record<string, unknown>;
  assertEqual(b3.success, false, "response.success === false");
}

async function testAuth(): Promise<void> {
  if (!apiToken) {
    console.log("\n--- Auth (skipped: ADMIN_PASSWORD not set) ---");
    console.log("  SKIP: No ADMIN_PASSWORD configured — API runs in open-access mode");
    return;
  }

  console.log("\n--- Auth ---");

  // Request without token — use a helper that doesn't fall back to apiToken
  const r1 = await fetchJson(`${baseUrl}/api/v1/health`, { token: "" });
  assertEqual(r1.status, 401, "GET /api/v1/health without token returns 401");
  const b1 = r1.body as Record<string, unknown>;
  assertEqual(b1.success, false, "response.success === false");

  // Request with wrong token
  const r2 = await fetchJson(`${baseUrl}/api/v1/health`, { token: "wrong-token" });
  assertEqual(r2.status, 403, "GET /api/v1/health with wrong token returns 403");
  const b2 = r2.body as Record<string, unknown>;
  assertEqual(b2.success, false, "response.success === false");

  // Request with correct token (obtained via login)
  const r3 = await fetchJson(`${baseUrl}/api/v1/health`, { token: apiToken });
  assertEqual(r3.status, 200, "GET /api/v1/health with correct token returns 200");
  const b3 = r3.body as Record<string, unknown>;
  assertEqual(b3.success, true, "response.success === true");
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  // Use a fixed port to avoid issues with port 0 on some platforms
  const TEST_PORT = 18991;
  const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
  apiToken = adminPassword || null;

  server = startApiServer({ port: TEST_PORT, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  console.log(`Test server listening on ${baseUrl}`);

  // Small delay to ensure server is ready
  await sleep(200);

  // If auth is enabled, obtain a token via login first
  if (apiToken) {
    const loginResp = await fetchJson(`${baseUrl}/api/v1/login`, {
      method: "POST",
      body: { username: "admin", password: adminPassword },
      token: undefined,
    });
    if (loginResp.status === 200) {
      const loginBody = loginResp.body as Record<string, unknown>;
      const loginData = loginBody.data as Record<string, unknown>;
      apiToken = loginData.token as string;
      console.log(`  Obtained auth token via login`);
    } else {
      console.log(`  WARNING: Login failed with status ${loginResp.status}`);
    }
  }

  // Run tests
  await testHealthEndpoint();
  await testChatEndpointValidation();
  await testTelemetryEndpoint();
  await testSkillsEndpoint();
  await test404();
  await testLoginEndpoint();
  await testAuth();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  server.close();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite error:", err);
  if (server) server.close();
  process.exit(1);
});

