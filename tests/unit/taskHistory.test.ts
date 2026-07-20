/**
 * Unit tests for taskHistory.ts (src/core/taskHistory.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { appendTaskHistory, readTaskHistory, searchTaskHistory } from "../../src/core/taskHistory.js";
import type { TaskHistoryEntry } from "../../src/core/taskHistory.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "task-history-test-"));
}

describe("taskHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("appendTaskHistory()", () => {
    it("writes to JSONL and MD files", () => {
      const entry = appendTaskHistory(tempDir, {
        task: "Fix login bug",
        summary: "Fixed the login redirect issue",
        iterations: 5,
        totalTokens: 1500,
      });

      expect(entry.id).toBeDefined();
      expect(entry.id).toMatch(/^task_/);
      expect(entry.timestamp).toBeDefined();
      expect(entry.task).toBe("Fix login bug");
      expect(entry.summary).toBe("Fixed the login redirect issue");
      expect(entry.iterations).toBe(5);
      expect(entry.totalTokens).toBe(1500);

      // Check JSONL file
      const jsonlPath = path.join(tempDir, ".agent", "task-history.jsonl");
      expect(fs.existsSync(jsonlPath)).toBe(true);
      const jsonlContent = fs.readFileSync(jsonlPath, "utf-8").trim();
      const parsed = JSON.parse(jsonlContent);
      expect(parsed.task).toBe("Fix login bug");

      // Check MD file
      const mdPath = path.join(tempDir, "tasks", "task_history.md");
      expect(fs.existsSync(mdPath)).toBe(true);
      const mdContent = fs.readFileSync(mdPath, "utf-8");
      expect(mdContent).toContain("Fix login bug");
      expect(mdContent).toContain("Fixed the login redirect issue");
      expect(mdContent).toContain("5 iterations");
      expect(mdContent).toContain("1500 tokens");
    });

    it("creates directories if they don't exist", () => {
      appendTaskHistory(tempDir, {
        task: "New task",
        summary: "Summary",
        iterations: 1,
      });

      expect(fs.existsSync(path.join(tempDir, ".agent"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "tasks"))).toBe(true);
    });

    it("appends multiple entries", () => {
      appendTaskHistory(tempDir, { task: "Task 1", summary: "First", iterations: 1 });
      appendTaskHistory(tempDir, { task: "Task 2", summary: "Second", iterations: 2 });

      const entries = readTaskHistory(tempDir, 10);
      expect(entries).toHaveLength(2);
      expect(entries[0].task).toBe("Task 2"); // newest first
      expect(entries[1].task).toBe("Task 1");
    });
  });

  describe("readTaskHistory()", () => {
    it("reads back entries", () => {
      appendTaskHistory(tempDir, { task: "Task A", summary: "Summary A", iterations: 3 });
      appendTaskHistory(tempDir, { task: "Task B", summary: "Summary B", iterations: 7, totalTokens: 2000 });

      const entries = readTaskHistory(tempDir, 10);
      expect(entries).toHaveLength(2);
      expect(entries[0].task).toBe("Task B");
      expect(entries[0].iterations).toBe(7);
      expect(entries[0].totalTokens).toBe(2000);
      expect(entries[1].task).toBe("Task A");
    });

    it("returns empty array when no history exists", () => {
      const entries = readTaskHistory(tempDir, 5);
      expect(entries).toEqual([]);
    });

    it("respects the limit parameter", () => {
      for (let i = 1; i <= 10; i++) {
        appendTaskHistory(tempDir, { task: `Task ${i}`, summary: `Summary ${i}`, iterations: i });
      }

      const entries = readTaskHistory(tempDir, 3);
      expect(entries).toHaveLength(3);
      expect(entries[0].task).toBe("Task 10");
      expect(entries[2].task).toBe("Task 8");
    });

    it("handles corrupt JSONL lines gracefully", () => {
      const jsonlPath = path.join(tempDir, ".agent", "task-history.jsonl");
      fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
      fs.writeFileSync(jsonlPath, '{"task": "Good"}\nnot-json\n{"task": "Also good"}\n', "utf-8");

      const entries = readTaskHistory(tempDir, 10);
      expect(entries).toHaveLength(2);
    });
  });

  describe("searchTaskHistory()", () => {
    it("finds by keyword in task description", () => {
      appendTaskHistory(tempDir, { task: "Fix login bug", summary: "Fixed redirect", iterations: 3 });
      appendTaskHistory(tempDir, { task: "Add logout feature", summary: "Implemented logout", iterations: 5 });
      appendTaskHistory(tempDir, { task: "Update README", summary: "Added docs", iterations: 1 });

      const results = searchTaskHistory(tempDir, "login");
      expect(results).toHaveLength(1);
      expect(results[0].task).toBe("Fix login bug");
    });

    it("finds by keyword in summary", () => {
      appendTaskHistory(tempDir, { task: "Task 1", summary: "Implemented the login feature", iterations: 3 });
      appendTaskHistory(tempDir, { task: "Task 2", summary: "Fixed the logout bug", iterations: 2 });

      const results = searchTaskHistory(tempDir, "logout");
      expect(results).toHaveLength(1);
      expect(results[0].task).toBe("Task 2");
    });

    it("returns empty array for no match", () => {
      appendTaskHistory(tempDir, { task: "Fix bug", summary: "Fixed it", iterations: 1 });

      const results = searchTaskHistory(tempDir, "nonexistent");
      expect(results).toEqual([]);
    });

    it("is case-insensitive", () => {
      appendTaskHistory(tempDir, { task: "Fix LOGIN Bug", summary: "Fixed", iterations: 1 });

      const results = searchTaskHistory(tempDir, "login");
      expect(results).toHaveLength(1);
    });

    it("respects limit parameter", () => {
      for (let i = 1; i <= 10; i++) {
        appendTaskHistory(tempDir, { task: `Task ${i}`, summary: `Common summary`, iterations: i });
      }

      const results = searchTaskHistory(tempDir, "Common", 3);
      expect(results).toHaveLength(3);
    });
  });

  describe("MAX_ENTRIES cap", () => {
    it("caps JSONL at 200 entries", () => {
      // Append 210 entries
      for (let i = 1; i <= 210; i++) {
        appendTaskHistory(tempDir, { task: `Task ${i}`, summary: `Summary ${i}`, iterations: i });
      }

      const entries = readTaskHistory(tempDir, 500);
      expect(entries.length).toBeLessThanOrEqual(200);

      // The oldest entries should have been dropped
      const tasks = entries.map((e) => e.task);
      expect(tasks).not.toContain("Task 1");
      expect(tasks).toContain("Task 210");
    });
  });
});
