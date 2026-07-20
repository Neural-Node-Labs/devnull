/**
 * Unit tests for auth.ts (src/api/auth.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  validateToken,
  revokeToken,
  verifyLogin,
  setUserStore,
  getUserStore,
} from "../../src/api/auth.js";
import type { StoredUser } from "../../src/api/auth.js";

describe("auth", () => {
  beforeEach(() => {
    // Reset the user store before each test
    setUserStore([]);
  });

  describe("hashPassword()", () => {
    it("produces salt:hash format", () => {
      const result = hashPassword("myPassword123");
      expect(result).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
      const [salt, hash] = result.split(":");
      expect(salt.length).toBe(32); // 16 bytes = 32 hex chars
      expect(hash.length).toBe(64); // SHA-256 = 64 hex chars
    });

    it("produces different hashes for the same password (different salt)", () => {
      const hash1 = hashPassword("samePassword");
      const hash2 = hashPassword("samePassword");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword()", () => {
    it("validates correct password", () => {
      const stored = hashPassword("correctPassword");
      expect(verifyPassword("correctPassword", stored)).toBe(true);
    });

    it("rejects wrong password", () => {
      const stored = hashPassword("correctPassword");
      expect(verifyPassword("wrongPassword", stored)).toBe(false);
    });

    it("rejects malformed stored hash", () => {
      expect(verifyPassword("password", "invalid")).toBe(false);
      expect(verifyPassword("password", "")).toBe(false);
      expect(verifyPassword("password", "onlysalt")).toBe(false);
    });

    it("rejects empty password", () => {
      const stored = hashPassword("realPassword");
      expect(verifyPassword("", stored)).toBe(false);
    });
  });

  describe("generateToken()", () => {
    it("creates UUID token", () => {
      const token = generateToken("alice");
      expect(token).toMatch(/^[a-f0-9-]+$/);
      expect(token.length).toBeGreaterThan(0);
    });

    it("defaults to user role", () => {
      const token = generateToken("bob");
      const entry = validateToken(token);
      expect(entry).not.toBeNull();
      expect(entry!.role).toBe("user");
    });

    it("accepts admin role", () => {
      const token = generateToken("admin_user", "admin");
      const entry = validateToken(token);
      expect(entry).not.toBeNull();
      expect(entry!.role).toBe("admin");
    });

    it("generates unique tokens", () => {
      const token1 = generateToken("alice");
      const token2 = generateToken("alice");
      expect(token1).not.toBe(token2);
    });
  });

  describe("validateToken()", () => {
    it("returns entry for valid token", () => {
      const token = generateToken("charlie", "admin");
      const entry = validateToken(token);
      expect(entry).not.toBeNull();
      expect(entry!.username).toBe("charlie");
      expect(entry!.role).toBe("admin");
      expect(entry!.createdAt).toBeDefined();
    });

    it("returns null for invalid token", () => {
      const entry = validateToken("nonexistent-token");
      expect(entry).toBeNull();
    });

    it("returns null for empty string", () => {
      const entry = validateToken("");
      expect(entry).toBeNull();
    });
  });

  describe("revokeToken()", () => {
    it("removes token", () => {
      const token = generateToken("dave");
      expect(validateToken(token)).not.toBeNull();

      const revoked = revokeToken(token);
      expect(revoked).toBe(true);
      expect(validateToken(token)).toBeNull();
    });

    it("returns false for non-existent token", () => {
      const revoked = revokeToken("nonexistent");
      expect(revoked).toBe(false);
    });
  });

  describe("verifyLogin()", () => {
    const testUsers: StoredUser[] = [
      {
        id: "1",
        username: "alice",
        passwordHash: hashPassword("alicePass"),
        role: "admin",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        username: "bob",
        passwordHash: hashPassword("bobPass"),
        role: "user",
        createdAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      setUserStore(testUsers);
    });

    it("returns user on success", () => {
      const user = verifyLogin("alice", "alicePass");
      expect(user).not.toBeNull();
      expect(user!.username).toBe("alice");
      expect(user!.role).toBe("admin");
    });

    it("returns null on wrong password", () => {
      const user = verifyLogin("alice", "wrongPassword");
      expect(user).toBeNull();
    });

    it("returns null on unknown user", () => {
      const user = verifyLogin("unknown", "anyPassword");
      expect(user).toBeNull();
    });

    it("is case-sensitive for username", () => {
      const user = verifyLogin("Alice", "alicePass");
      expect(user).toBeNull();
    });
  });

  describe("getUserStore / setUserStore", () => {
    it("getUserStore returns current store", () => {
      const users: StoredUser[] = [
        { id: "1", username: "test", passwordHash: "hash", role: "user", createdAt: "now" },
      ];
      setUserStore(users);
      expect(getUserStore()).toEqual(users);
    });

    it("setUserStore replaces the store", () => {
      setUserStore([]);
      expect(getUserStore()).toEqual([]);
    });
  });
});
