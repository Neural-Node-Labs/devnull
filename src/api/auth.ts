import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

/**
 * Token-based authentication middleware for the devnull API.
 *
 * The system supports two modes:
 *
 * **Login mode (default):** When `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set,
 *   clients must call `POST /api/v1/login` with those credentials to receive a
 *   Bearer token. That token is then used for all subsequent API calls.
 *
 * **Open-access mode (legacy):** If neither `ADMIN_USERNAME` nor `ADMIN_PASSWORD`
 *   is set, the API runs without authentication (for local development).
 *
 * The default admin credentials are created from environment variables:
 *   - `ADMIN_USERNAME` (default: "admin")
 *   - `ADMIN_PASSWORD` (default: "admin")
 *
 * On startup, a default admin user is created and a token is pre-generated
 * so the admin can immediately use the API.
 */

// ─── Token Store ────────────────────────────────────────────────────────────

interface TokenEntry {
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

const tokenStore = new Map<string, TokenEntry>();

// ─── Admin Credentials ──────────────────────────────────────────────────────

const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim() || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "admin";

/** Whether the API is running in authenticated mode. */
export const isAuthEnabled = (): boolean => {
  return !!(process.env.ADMIN_PASSWORD?.trim());
};

/**
 * Generate a new token for a user and store it.
 * Returns the token string.
 */
export function generateToken(username: string, role: "admin" | "user" = "user"): string {
  const token = crypto.randomUUID();
  tokenStore.set(token, {
    username,
    role,
    createdAt: new Date().toISOString(),
  });
  return token;
}

/**
 * Validate a Bearer token. Returns the token entry if valid, null otherwise.
 */
export function validateToken(token: string): TokenEntry | null {
  return tokenStore.get(token) ?? null;
}

/**
 * Remove a token from the store (logout).
 */
export function revokeToken(token: string): boolean {
  return tokenStore.delete(token);
}

/**
 * Get all tokens for a given username (for admin user management).
 */
export function getTokensForUser(username: string): string[] {
  const tokens: string[] = [];
  for (const [token, entry] of tokenStore) {
    if (entry.username === username) {
      tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Initialize the default admin user and generate a startup token.
 * Called once when the server starts.
 */
export function initDefaultAdmin(): { username: string; token: string } {
  const username = ADMIN_USERNAME;
  const token = generateToken(username, "admin");
  return { username, token };
}

/**
 * Verify login credentials against the configured admin credentials.
 * Returns the username on success, null on failure.
 */
export function verifyLogin(username: string, password: string): string | null {
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return ADMIN_USERNAME;
  }
  return null;
}

// ─── Express Middleware ─────────────────────────────────────────────────────

/**
 * Express middleware that validates the Authorization header.
 *
 * - If auth is disabled (no ADMIN_PASSWORD set), allows all requests.
 * - If auth is enabled, requires a valid Bearer token from the token store.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for the login endpoint itself
  if (req.path === "/login" && req.method === "POST") {
    next();
    return;
  }

  // No auth configured — allow open access (dev mode).
  if (!isAuthEnabled()) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[devnull API] WARNING: ADMIN_PASSWORD is not set. API is running without authentication."
      );
    }
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ success: false, error: "Missing Authorization header" });
    return;
  }

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ success: false, error: "Authorization header must be: Bearer <token>" });
    return;
  }

  const token = parts[1];
  const entry = validateToken(token);
  if (!entry) {
    res.status(403).json({ success: false, error: "Invalid or expired API token" });
    return;
  }

  // Attach user info to request for downstream use
  (req as any).user = entry;

  next();
}
