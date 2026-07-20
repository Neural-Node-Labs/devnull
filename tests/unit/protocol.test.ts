/**
 * Unit tests for protocol.ts (src/core/protocol.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadProtocol, loadLessons, recordLesson, buildProtocolPrompt } from "../../src/core/protocol.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "protocol-test-"));
}

describe("protocol", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadProtocol()", () => {
    it("returns undefined when file doesn't exist", () => {
      const result = loadProtocol(tempDir);
      expect(result).toBeUndefined();
    });

    it("reads file content", () => {
      const protocolDir = path.join(tempDir, "agent");
      fs.mkdirSync(protocolDir, { recursive: true });
      fs.writeFileSync(path.join(protocolDir, "devnull.md"), "# Engineering Protocol\n\nBe thorough.", "utf-8");

      const result = loadProtocol(tempDir);
      expect(result).toBe("# Engineering Protocol\n\nBe thorough.");
    });

    it("trims whitespace from file content", () => {
      const protocolDir = path.join(tempDir, "agent");
      fs.mkdirSync(protocolDir, { recursive: true });
      fs.writeFileSync(path.join(protocolDir, "devnull.md"), "  \n# Protocol\n\nContent.\n  \n", "utf-8");

      const result = loadProtocol(tempDir);
      expect(result).toBe("# Protocol\n\nContent.");
    });

    it("falls back to DEVNULL_HOME when not in cwd", () => {
      const homeDir = makeTempDir();
      const homeAgent = path.join(homeDir, "agent");
      fs.mkdirSync(homeAgent, { recursive: true });
      fs.writeFileSync(path.join(homeAgent, "devnull.md"), "# Home Protocol", "utf-8");

      const origHome = process.env.DEVNULL_HOME;
      process.env.DEVNULL_HOME = homeDir;

      try {
        const result = loadProtocol(tempDir);
        expect(result).toBe("# Home Protocol");
      } finally {
        if (origHome === undefined) {
          delete process.env.DEVNULL_HOME;
        } else {
          process.env.DEVNULL_HOME = origHome;
        }
        fs.rmSync(homeDir, { recursive: true, force: true });
      }
    });
  });

  describe("loadLessons()", () => {
    it("returns undefined when file doesn't exist", () => {
      const result = loadLessons(tempDir);
      expect(result).toBeUndefined();
    });

    it("reads file content", () => {
      const tasksDir = path.join(tempDir, "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(path.join(tasksDir, "lessons.md"), "# Lessons\n\n- Don't repeat mistakes", "utf-8");

      const result = loadLessons(tempDir);
      expect(result).toBe("# Lessons\n\n- Don't repeat mistakes");
    });

    it("returns undefined when tasks dir doesn't exist", () => {
      const result = loadLessons(tempDir);
      expect(result).toBeUndefined();
    });
  });

  describe("recordLesson()", () => {
    it("appends to lessons.md", () => {
      recordLesson("Always validate before marking done.", tempDir);

      const content = fs.readFileSync(path.join(tempDir, "tasks", "lessons.md"), "utf-8");
      expect(content).toContain("Always validate before marking done.");
      expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}T/); // starts with ISO timestamp heading
    });

    it("creates tasks directory if it doesn't exist", () => {
      recordLesson("New lesson in fresh workspace.", tempDir);

      expect(fs.existsSync(path.join(tempDir, "tasks", "lessons.md"))).toBe(true);
      const content = fs.readFileSync(path.join(tempDir, "tasks", "lessons.md"), "utf-8");
      expect(content).toContain("New lesson in fresh workspace.");
    });

    it("appends multiple lessons", () => {
      recordLesson("Lesson one.", tempDir);
      recordLesson("Lesson two.", tempDir);

      const content = fs.readFileSync(path.join(tempDir, "tasks", "lessons.md"), "utf-8");
      expect(content).toContain("Lesson one.");
      expect(content).toContain("Lesson two.");
    });
  });

  describe("buildProtocolPrompt()", () => {
    it("returns empty string when neither protocol nor lessons exist", () => {
      const result = buildProtocolPrompt(tempDir);
      expect(result).toBe("");
    });

    it("wraps protocol in XML tags", () => {
      const protocolDir = path.join(tempDir, "agent");
      fs.mkdirSync(protocolDir, { recursive: true });
      fs.writeFileSync(path.join(protocolDir, "devnull.md"), "Be thorough.", "utf-8");

      const result = buildProtocolPrompt(tempDir);
      expect(result).toContain("<system_directive>");
      expect(result).toContain("</system_directive>");
      expect(result).toContain("<engineering_protocol>");
      expect(result).toContain("</engineering_protocol>");
      expect(result).toContain("Be thorough.");
    });

    it("wraps lessons in XML tags", () => {
      const tasksDir = path.join(tempDir, "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(path.join(tasksDir, "lessons.md"), "Check before acting.", "utf-8");

      const result = buildProtocolPrompt(tempDir);
      expect(result).toContain("<lessons_learned>");
      expect(result).toContain("</lessons_learned>");
      expect(result).toContain("Check before acting.");
    });

    it("includes both protocol and lessons when both exist", () => {
      const protocolDir = path.join(tempDir, "agent");
      fs.mkdirSync(protocolDir, { recursive: true });
      fs.writeFileSync(path.join(protocolDir, "devnull.md"), "Protocol content.", "utf-8");

      const tasksDir = path.join(tempDir, "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(path.join(tasksDir, "lessons.md"), "Lesson content.", "utf-8");

      const result = buildProtocolPrompt(tempDir);
      expect(result).toContain("<engineering_protocol>");
      expect(result).toContain("Protocol content.");
      expect(result).toContain("<lessons_learned>");
      expect(result).toContain("Lesson content.");
    });
  });
});
