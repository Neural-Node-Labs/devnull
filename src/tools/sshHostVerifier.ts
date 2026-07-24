import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { restrictFileToCurrentUser } from "../util/filePermissions.js";

/**
 * Trust-on-first-use (TOFU) host key verification for ssh2's password-auth connections.
 *
 * Previously these connections used `hostVerifier: () => true`, which accepts ANY host key
 * unconditionally -- meaning ssh2 provided zero protection against a machine-in-the-middle
 * silently swapping out the remote host's key. That's a real gap: the shell-out (key-based)
 * path right next to it already uses `StrictHostKeyChecking=accept-new`, so ssh2's password
 * path should offer the same guarantee, not less.
 *
 * accept-new semantics:
 *   - First connection to host:port -> record the key, accept.
 *   - Later connection, same key -> accept.
 *   - Later connection, DIFFERENT key -> reject (this is the actual MITM/host-rotation signal).
 *
 * Store is a plain JSON file at ~/.devnull/ssh-known-hosts.json, keyed by "host:port".
 */

const STORE_PATH = path.join(os.homedir(), ".devnull", "ssh-known-hosts.json");

function loadStore(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, string>): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { encoding: "utf-8", mode: 0o600 });
  restrictFileToCurrentUser(STORE_PATH);
}

/**
 * Returns a hostVerifier function for ssh2's Client#connect(). `hashedKey` is the hex-encoded
 * hash ssh2 passes in (MD5 by default, matching ssh2's built-in `hostHash` behavior) -- we
 * leave `hostHash` unset in the connect config and let ssh2 default it, so this receives that
 * same default hash consistently across calls.
 */
export function createTofuHostVerifier(host: string, port: number): (hashedKey: string) => boolean {
  const key = `${host}:${port}`;
  return (hashedKey: string): boolean => {
    const store = loadStore();
    const known = store[key];
    if (!known) {
      store[key] = hashedKey;
      saveStore(store);
      return true; // first time seeing this host — trust and record (TOFU)
    }
    if (known === hashedKey) {
      return true; // matches what we recorded before
    }
    // Key changed since we last connected — reject. This is exactly the case that
    // `hostVerifier: () => true` was silently letting through.
    console.error(
      `[ssh] REJECTED: host key for ${key} does not match the one recorded on first connect. ` +
        `This could mean the host was legitimately re-keyed, or it could be a machine-in-the-middle. ` +
        `If you trust this change, remove the "${key}" entry from ${STORE_PATH} and reconnect.`
    );
    return false;
  };
}
