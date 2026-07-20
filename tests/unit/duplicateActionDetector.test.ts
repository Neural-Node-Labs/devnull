/**
 * Unit tests for duplicateActionDetector.ts (src/core/duplicateActionDetector.ts).
 */
import { describe, it, expect } from "vitest";
import { findDuplicateActions } from "../../src/core/duplicateActionDetector.js";
import type { ToolCallRecord } from "../../src/core/duplicateActionDetector.js";

describe("duplicateActionDetector", () => {
  describe("findDuplicateActions()", () => {
    it("returns empty for unique calls", () => {
      const calls: ToolCallRecord[] = [
        { tool: "grep_tool", args: { regex: "foo" }, observation: { matches: ["a"] } },
        { tool: "read_tool", args: { filePath: "src/main.ts" }, observation: { content: "..." } },
        { tool: "run_command_tool", args: { command: "npm test" }, observation: { exitCode: 0 } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toEqual([]);
    });

    it("flags identical (tool, args, observation) as duplicate", () => {
      const calls: ToolCallRecord[] = [
        { tool: "grep_tool", args: { regex: "foo" }, observation: { matches: ["a"] } },
        { tool: "grep_tool", args: { regex: "foo" }, observation: { matches: ["a"] } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toHaveLength(1);
      expect(violations[0].tool).toBe("grep_tool");
      expect(violations[0].occurrences).toBe(2);
      expect(violations[0].reason).toContain("no new information was gained");
    });

    it("does NOT flag same tool+args with different observations", () => {
      const calls: ToolCallRecord[] = [
        { tool: "run_command_tool", args: { command: "npm test" }, observation: { exitCode: 1, stdout: "FAIL" } },
        { tool: "run_command_tool", args: { command: "npm test" }, observation: { exitCode: 0, stdout: "PASS" } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toEqual([]);
    });

    it("flags triple duplicate", () => {
      const calls: ToolCallRecord[] = [
        { tool: "read_tool", args: { filePath: "config.json" }, observation: { content: "same" } },
        { tool: "read_tool", args: { filePath: "config.json" }, observation: { content: "same" } },
        { tool: "read_tool", args: { filePath: "config.json" }, observation: { content: "same" } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toHaveLength(1);
      expect(violations[0].occurrences).toBe(3);
    });

    it("handles empty call list", () => {
      const violations = findDuplicateActions([]);
      expect(violations).toEqual([]);
    });

    it("handles single call", () => {
      const calls: ToolCallRecord[] = [
        { tool: "grep_tool", args: { regex: "foo" }, observation: { matches: [] } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toEqual([]);
    });

    it("flags only the duplicate group, not unique calls", () => {
      const calls: ToolCallRecord[] = [
        { tool: "read_tool", args: { filePath: "unique.ts" }, observation: { content: "unique" } },
        { tool: "grep_tool", args: { regex: "dup" }, observation: { matches: ["x"] } },
        { tool: "grep_tool", args: { regex: "dup" }, observation: { matches: ["x"] } },
        { tool: "run_command_tool", args: { command: "echo hi" }, observation: { stdout: "hi" } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toHaveLength(1);
      expect(violations[0].tool).toBe("grep_tool");
    });
  });

  describe("stableStringify (internal)", () => {
    it("handles nested objects with sorted keys", () => {
      // We test this indirectly through findDuplicateActions
      const calls: ToolCallRecord[] = [
        {
          tool: "test",
          args: { b: 2, a: 1, nested: { z: 26, y: 25 } },
          observation: { result: "ok" },
        },
        {
          tool: "test",
          args: { a: 1, b: 2, nested: { y: 25, z: 26 } },
          observation: { result: "ok" },
        },
      ];

      const violations = findDuplicateActions(calls);
      // Should be flagged as duplicate because stableStringify sorts keys
      expect(violations).toHaveLength(1);
    });

    it("handles arrays", () => {
      const calls: ToolCallRecord[] = [
        { tool: "test", args: { items: [1, 2, 3] }, observation: { result: "ok" } },
        { tool: "test", args: { items: [1, 2, 3] }, observation: { result: "ok" } },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toHaveLength(1);
    });

    it("handles null and primitive values", () => {
      const calls: ToolCallRecord[] = [
        { tool: "test", args: null, observation: null },
        { tool: "test", args: null, observation: null },
      ];

      const violations = findDuplicateActions(calls);
      expect(violations).toHaveLength(1);
    });
  });
});
