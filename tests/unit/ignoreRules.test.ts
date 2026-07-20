/**
 * Unit tests for ignoreRules.ts (src/indexing/ignoreRules.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadIgnoreRules } from "../../src/indexing/ignoreRules.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ignore-rules-test-"));
}

describe("ignoreRules", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadIgnoreRules()", () => {
    it("includes ALWAYS_IGNORE patterns even with no ignore files", () => {
      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("**/node_modules/**");
      expect(rules).toContain(".git/**");
      expect(rules).toContain("dist/**");
      expect(rules).toContain(".agent/index/**");
      expect(rules).toContain(".log/**");
    });

    it("reads patterns from .agent/.agentignore", () => {
      const agentDir = path.join(tempDir, ".agent");
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, ".agentignore"), "*.log\ntemp/\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("*.log");
      expect(rules).toContain("temp/**");
    });

    it("reads patterns from .gitignore", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "*.js.map\n.env\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("*.js.map");
      expect(rules).toContain(".env");
    });

    it("reads patterns from .dockerignore", () => {
      fs.writeFileSync(path.join(tempDir, ".dockerignore"), "Dockerfile\n.git\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("Dockerfile");
      expect(rules).toContain(".git/**"); // .git is normalized to **/.git/**
    });

    it("ignores comments and empty lines", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "# This is a comment\n\n*.log\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).not.toContain("# This is a comment");
      expect(rules).toContain("*.log");
    });

    it("deduplicates patterns across files", () => {
      const agentDir = path.join(tempDir, ".agent");
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, ".agentignore"), "*.log\n", "utf-8");
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "*.log\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      // *.log should appear only once
      const logRules = rules.filter((r) => r === "*.log");
      expect(logRules).toHaveLength(1);
    });
  });

  describe("normalizePattern (internal behavior)", () => {
    it("handles directory patterns (trailing slash)", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "build/\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("**/build/**");
    });

    it("handles bare directory names", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "dist\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("**/dist/**");
    });

    it("does NOT normalize bare names with dots (files like Thumbs.db)", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "Thumbs.db\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("Thumbs.db");
      expect(rules).not.toContain("**/Thumbs.db/**");
    });

    it("does NOT normalize patterns with glob characters", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "*.log\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("*.log");
    });

    it("does NOT normalize patterns with path separators", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "src/generated/\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("**/src/generated/**");
    });

    it("leaves **/ prefixed patterns as-is", () => {
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "**/node_modules/**\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).toContain("**/node_modules/**");
    });

    it("ignores comment lines", () => {
      // Comments are filtered out in loadIgnoreRules, not normalizePattern
      fs.writeFileSync(path.join(tempDir, ".gitignore"), "# comment\n*.log\n", "utf-8");

      const rules = loadIgnoreRules(tempDir);
      expect(rules).not.toContain("# comment");
      expect(rules).toContain("*.log");
    });
  });
});
