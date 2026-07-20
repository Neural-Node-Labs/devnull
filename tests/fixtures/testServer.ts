/**
 * Test API server helper — starts a real Express server on a random port for testing.
 */
import http from "node:http";
import { startApiServer } from "../../src/api/server.js";

export interface TestServerContext {
  server: http.Server;
  baseUrl: string;
  apiToken: string | null;
}

/**
 * Start a test API server on a fixed port.
 * Returns the server instance and base URL.
 */
export async function startTestServer(port = 18991): Promise<TestServerContext> {
  const server = startApiServer({ port, host: "127.0.0.1" });
  const baseUrl = `http://127.0.0.1:${port}`;

  // Wait for server to be ready
  await new Promise<void>((resolve) => server.once("listening", resolve));
  // Small extra delay
  await new Promise((r) => setTimeout(r, 200));

  return { server, baseUrl, apiToken: null };
}

/**
 * Make an HTTP request to the test server and return parsed response.
 */
export async function fetchJson(
  url: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token !== undefined) {
    if (opts.token) {
      headers["Authorization"] = `Bearer ${opts.token}`;
    }
    // empty string = no auth
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

/**
 * Register a test user and return the auth token.
 */
export async function registerTestUser(
  baseUrl: string,
  username = "testadmin",
  password = "testpass123"
): Promise<string> {
  const { status, body } = await fetchJson(`${baseUrl}/api/v1/register`, {
    method: "POST",
    body: { username, password },
    token: undefined,
  });
  if (status !== 201) {
    throw new Error(`Failed to register test user: ${JSON.stringify(body)}`);
  }
  const data = (body as Record<string, unknown>).data as Record<string, unknown>;
  return data.token as string;
}
