/**
 * Unit tests for llmKeyStore.ts (src/api/llmKeyStore.ts).
 *
 * Uses vi.mock to redirect os.homedir() to a temp directory so we don't
 * touch the real ~/.devnull/llm-key.json.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-keystore-test-"));

// Mock os.homedir BEFORE importing the module under test
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

// Now import the module under test (it will use the mocked os.homedir)
const { getStoredApiKey, setStoredApiKey, clearStoredApiKey, hasStoredApiKey } = await import("../../src/api/llmKeyStore.js");

const storePath = path.join(tempDir, ".devnull", "llm-key.json");

beforeEach(() => {
  // Clean up any state from previous tests
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }
  // Clean up the directory too
  const dir = path.dirname(storePath);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("llmKeyStore", () => {
  describe("getStoredApiKey()", () => {
    it("returns undefined when no file", () => {
      expect(getStoredApiKey()).toBeUndefined();
    });

    it("returns the API key when file exists", () => {
      setStoredApiKey("my-secret-key");
      expect(getStoredApiKey()).toBe("my-secret-key");
    });

    it("returns undefined for corrupt JSON", () => {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, "not-valid-json", "utf-8");
      expect(getStoredApiKey()).toBeUndefined();
    });

    it("returns undefined for non-string apiKey value", () => {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify({ apiKey: 123 }), "utf-8");
      expect(getStoredApiKey()).toBeUndefined();
    });
  });

  describe("setStoredApiKey()", () => {
    it("writes to file", () => {
      setStoredApiKey("test-key-123");

      expect(fs.existsSync(storePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      expect(content.apiKey).toBe("test-key-123");
    });

    it("creates the .devnull directory", () => {
      setStoredApiKey("key");
      expect(fs.existsSync(path.dirname(storePath))).toBe(true);
    });

    it("overwrites existing key", () => {
      setStoredApiKey("old-key");
      setStoredApiKey("new-key");

      const content = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      expect(content.apiKey).toBe("new-key");
    });
  });

  describe("clearStoredApiKey()", () => {
    it("removes file", () => {
      setStoredApiKey("key-to-clear");
      expect(fs.existsSync(storePath)).toBe(true);

      clearStoredApiKey();
      expect(fs.existsSync(storePath)).toBe(false);
    });

    it("does not throw when file doesn't exist", () => {
      expect(() => clearStoredApiKey()).not.toThrow();
    });
  });

  describe("hasStoredApiKey()", () => {
    it("returns false when no file", () => {
      expect(hasStoredApiKey()).toBe(false);
    });

    it("returns true when file exists with key", () => {
      setStoredApiKey("some-key");
      expect(hasStoredApiKey()).toBe(true);
    });

    it("returns false after clearing", () => {
      setStoredApiKey("temp-key");
      clearStoredApiKey();
      expect(hasStoredApiKey()).toBe(false);
    });
  });
});
