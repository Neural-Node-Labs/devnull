import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

/**
 * Token-based authentication middleware for the devnull API.
 *
 * The system authenticates against a user store managed by routes.ts.
 * When the user table is empty, the first user to register becomes an admin.
 * There is no static admin password — all auth goes through the user store.
 */

// ─── Token Store ────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h — bearer tokens are no longer valid forever

interface TokenEntry {
  username: string;
  role: "admin" | "user";
  createdAt: string;
  expiresAt: number; // epoch ms
}

const tokenStore = new Map<string, TokenEntry>();

// ─── User Store (injected by routes.ts) ─────────────────────────────────────

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
}

let userStore: StoredUser[] = [];

/**
 * Set the user store reference. Called by routes.ts on startup.
 */
export function setUserStore(store: StoredUser[]): void {
  userStore = store;
}

/**
 * Get the current user store reference.
 */
export function getUserStore(): StoredUser[] {
  return userStore;
}

// ─── Token Management ───────────────────────────────────────────────────────

/**
 * Generate a new token for a user and store it. Tokens expire after TOKEN_TTL_MS —
 * previously tokens never expired, so a single leaked bearer token stayed valid forever.
 * Returns the token string.
 */
export function generateToken(username: string, role: "admin" | "user" = "user"): string {
  const token = crypto.randomUUID();
  tokenStore.set(token, {
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  return token;
}

/**
 * Validate a Bearer token. Returns the token entry if valid and unexpired, null otherwise.
 * Expired entries are evicted from the store as they're encountered.
 */
export function validateToken(token: string): Omit<TokenEntry, "expiresAt"> | null {
  const entry = tokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(token);
    return null;
  }
  const { expiresAt: _expiresAt, ...rest } = entry;
  return rest;
}

/**
 * Remove a token from the store (logout).
 */
export function revokeToken(token: string): boolean {
  return tokenStore.delete(token);
}

/**
 * Get all non-expired tokens for a given username (for admin user management).
 */
export function getTokensForUser(username: string): string[] {
  const tokens: string[] = [];
  const now = Date.now();
  for (const [token, entry] of tokenStore) {
    if (entry.username === username && now <= entry.expiresAt) {
      tokens.push(token);
    }
  }
  return tokens;
}

// ─── Password Hashing ───────────────────────────────────────────────────────
//
// Previously: salted SHA-256. SHA-256 is a fast general-purpose hash — exactly the wrong
// property for password storage, since it makes offline brute-force/GPU cracking cheap if the
// user store is ever exfiltrated. scrypt is a memory-hard KDF, deliberately expensive to
// parallelize on GPUs/ASICs, which is the standard bar for password storage.
//
// Format: "scrypt:<salt-hex>:<hash-hex>" — the algorithm tag lets us support migrating old
// "salt:hash" (SHA-256) entries without breaking existing stored credentials.

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash. Uses a constant-time comparison so response timing
 * doesn't leak how many bytes of the hash matched. Also accepts the legacy salt:hash
 * (SHA-256) format for backward compatibility with existing stored credentials — callers
 * should re-hash (via hashPassword) and persist the upgraded hash on a successful legacy
 * verification, so accounts migrate to scrypt the next time they log in.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");

  if (parts.length === 3 && parts[0] === "scrypt") {
    const [, salt, hashHex] = parts;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  }

  if (parts.length === 2) {
    // Legacy SHA-256 format: "salt:hash"
    const [salt, hashHex] = parts;
    if (!salt || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.createHash("sha256").update(salt + password).digest();
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  }

  return false;
}

/** True if `stored` is in the legacy SHA-256 format and should be upgraded on next successful login. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith("scrypt:");
}

// ─── Login Verification ─────────────────────────────────────────────────────

/**
 * Verify login credentials against the user store.
 * Returns the user on success, null on failure.
 */
export function verifyLogin(username: string, password: string): StoredUser | null {
  const user = userStore.find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

// ─── Express Middleware ─────────────────────────────────────────────────────

/**
 * Express middleware that validates the Authorization header.
 *
 * Requires a valid, unexpired Bearer token from the token store for all routes
 * except /login and /register.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for login and register endpoints
  if ((req.path === "/login" && req.method === "POST") ||
      (req.path === "/register" && req.method === "POST") ||
      (req.path === "/users/count" && req.method === "GET")) {
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
