import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { StoredUser } from "./auth.js";

/**
 * File-based persistence for the API's user store.
 *
 * Previously `storedUsers` was a plain array declared inline in routes.ts — never written to
 * disk, so every server restart silently wiped every registered user and re-triggered the
 * "first user becomes admin" registration flow. The code even had a comment acknowledging this
 * ("in-memory for now, but structured for DB migration") — this closes that gap using the same
 * plain-JSON-file convention already used by llmKeyStore.ts and the file*Store.ts classes,
 * without committing to a specific SQL schema/migration (which would need your input on
 * sqlite vs postgres as the default for this data).
 *
 * Store location: ~/.devnull/users.json (same home directory llmKeyStore.ts already uses).
 * Override with DEVNULL_HOME/users.json if DEVNULL_HOME is set, matching skillRegistry.ts's
 * existing DEVNULL_HOME convention.
 */

interface UserStoreFile {
  users: StoredUser[];
  nextUserId: number;
}

function storePath(): string {
  const home = process.env.DEVNULL_HOME;
  const base = home && fs.existsSync(home) ? home : path.join(os.homedir(), ".devnull");
  return path.join(base, "users.json");
}

/** Loads the user store from disk. Returns an empty store (nextUserId: 1) if the file doesn't
 *  exist yet (first run) or is unreadable/corrupt (logged, not thrown — a corrupt user store
 *  file shouldn't crash the whole API server on startup). */
export function loadUserStore(): UserStoreFile {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return { users: [], nextUserId: 1 };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!Array.isArray(parsed.users) || typeof parsed.nextUserId !== "number") {
      throw new Error("malformed users.json (missing users[]/nextUserId)");
    }
    return parsed as UserStoreFile;
  } catch (err) {
    console.error(`[fileUserStore] Failed to load ${p}, starting with an empty user store: ${err}`);
    return { users: [], nextUserId: 1 };
  }
}

/** Persists the user store to disk. mode 0600: same "owner-only, best effort" bar
 *  llmKeyStore.ts already uses for this class of local plaintext-on-disk data. */
export function saveUserStore(data: UserStoreFile): void {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
}
