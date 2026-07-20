/**
 * Unit tests for workspaceManager.ts (src/core/workspaceManager.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepareWorkspace, EXCLUDED, WORKSPACE_DIR_NAME } from "../../src/core/workspaceManager.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "workspace-mgr-test-"));
}

describe("workspaceManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("prepareWorkspace()", () => {
    it("creates workspace-agent dir", () => {
      const wsPath = prepareWorkspace(tempDir);
      expect(wsPath).toBe(path.join(tempDir, WORKSPACE_DIR_NAME));
      expect(fs.existsSync(wsPath)).toBe(true);
      expect(fs.statSync(wsPath).isDirectory()).toBe(true);
    });

    it("copies files from project root to workspace-agent", () => {
      // Create some source files
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Test Project", "utf-8");
      fs.writeFileSync(path.join(tempDir, "index.js"), "console.log('hello');", "utf-8");

      const wsPath = prepareWorkspace(tempDir);

      expect(fs.existsSync(path.join(wsPath, "README.md"))).toBe(true);
      expect(fs.existsSync(path.join(wsPath, "index.js"))).toBe(true);
      expect(fs.readFileSync(path.join(wsPath, "README.md"), "utf-8")).toBe("# Test Project");
    });

    it("excludes EXCLUDED directories from copy", () => {
      // Create excluded dirs with files
      for (const dir of ["node_modules", ".git", "dist", ".agent", ".log", "tasks"]) {
        fs.mkdirSync(path.join(tempDir, dir), { recursive: true });
        fs.writeFileSync(path.join(tempDir, dir, "content.txt"), "should not be copied", "utf-8");
      }
      // Create a non-excluded dir
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "main.ts"), "export const x = 1;", "utf-8");

      const wsPath = prepareWorkspace(tempDir);

      // Excluded dirs should not exist in workspace-agent
      for (const dir of ["node_modules", ".git", "dist", ".agent", ".log", "tasks"]) {
        expect(fs.existsSync(path.join(wsPath, dir))).toBe(false);
      }
      // Non-excluded dir should exist
      expect(fs.existsSync(path.join(wsPath, "src", "main.ts"))).toBe(true);
    });

    it("excludes workspace-agent itself (nested copy prevention)", () => {
      const wsPath = prepareWorkspace(tempDir);
      // workspace-agent should not contain another workspace-agent
      expect(fs.existsSync(path.join(wsPath, WORKSPACE_DIR_NAME))).toBe(false);
    });

    it("copies nested directories", () => {
      fs.mkdirSync(path.join(tempDir, "src", "core"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "core", "index.ts"), "export {};", "utf-8");
      fs.mkdirSync(path.join(tempDir, "src", "api"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "api", "routes.ts"), "export {};", "utf-8");

      const wsPath = prepareWorkspace(tempDir);

      expect(fs.existsSync(path.join(wsPath, "src", "core", "index.ts"))).toBe(true);
      expect(fs.existsSync(path.join(wsPath, "src", "api", "routes.ts"))).toBe(true);
    });

    it("is idempotent (can be called multiple times)", () => {
      fs.writeFileSync(path.join(tempDir, "test.txt"), "content", "utf-8");

      const wsPath1 = prepareWorkspace(tempDir);
      const wsPath2 = prepareWorkspace(tempDir);

      expect(wsPath1).toBe(wsPath2);
      expect(fs.existsSync(path.join(wsPath2, "test.txt"))).toBe(true);
    });
  });

  describe("EXCLUDED set", () => {
    it("contains expected paths", () => {
      expect(EXCLUDED.has("workspace-agent")).toBe(true);
      expect(EXCLUDED.has(".agent")).toBe(true);
      expect(EXCLUDED.has(".git")).toBe(true);
      expect(EXCLUDED.has(".log")).toBe(true);
      expect(EXCLUDED.has("node_modules")).toBe(true);
      expect(EXCLUDED.has("dist")).toBe(true);
      expect(EXCLUDED.has("build")).toBe(true);
      expect(EXCLUDED.has("tasks")).toBe(true);
    });

    it("does not exclude src or tests", () => {
      expect(EXCLUDED.has("src")).toBe(false);
      expect(EXCLUDED.has("tests")).toBe(false);
      expect(EXCLUDED.has("docs")).toBe(false);
    });
  });
});
