/**
 * Unit tests for stepScorer.ts (src/core/stepScorer.ts).
 */
import { describe, it, expect } from "vitest";
import { scoreStep, rollingHealth, createHealthState } from "../../src/core/stepScorer.js";

describe("stepScorer", () => {
  describe("scoreStep()", () => {
    it("returns baseline 70 for normal step", () => {
      const state = createHealthState();
      const result = scoreStep(state, {
        tool: "grep_tool",
        args: { regex: "foo" },
        observation: { matches: [] },
        isError: false,
      });

      expect(result.score).toBe(80); // 70 baseline + 10 for no error
      expect(result.reasons).toContain("completed without error");
    });

    it("penalizes errors (-45)", () => {
      const state = createHealthState();
      const result = scoreStep(state, {
        tool: "grep_tool",
        args: { regex: "foo" },
        observation: { error: "timeout" },
        isError: true,
      });

      expect(result.score).toBe(25); // 70 - 45
      expect(result.reasons).toContain("tool call errored");
    });

    it("penalizes duplicates (-35)", () => {
      const state = createHealthState();
      // First call
      scoreStep(state, {
        tool: "grep_tool",
        args: { regex: "foo" },
        observation: { matches: ["a"] },
        isError: false,
      });
      // Second call — identical tool, args, AND observation
      const result = scoreStep(state, {
        tool: "grep_tool",
        args: { regex: "foo" },
        observation: { matches: ["a"] },
        isError: false,
      });

      // 70 baseline + 10 no error + 10 write_edit/run_command bonus (not applicable) - 35 duplicate = 45
      expect(result.score).toBe(45);
      expect(result.reasons).toContain("repeated an identical action with an identical result — no new information gained");
    });

    it("does NOT penalize same tool+args with different observations", () => {
      const state = createHealthState();
      // First call
      scoreStep(state, {
        tool: "run_command_tool",
        args: { command: "npm test" },
        observation: { exitCode: 1, stdout: "FAIL" },
        isError: false,
      });
      // Second call — same tool+args but different observation (test now passes)
      const result = scoreStep(state, {
        tool: "run_command_tool",
        args: { command: "npm test" },
        observation: { exitCode: 0, stdout: "PASS" },
        isError: false,
      });

      // 70 baseline + 10 no error + 10 run_command_tool bonus = 90 (no duplicate penalty)
      expect(result.score).toBe(90);
      expect(result.reasons).not.toContain("repeated an identical action");
    });

    it("rewards write_edit_tool and run_command_tool (+10)", () => {
      const state = createHealthState();

      const result = scoreStep(state, {
        tool: "write_edit_tool",
        args: { filePath: "src/main.ts", mode: "edit" },
        observation: { success: true },
        isError: false,
      });

      // 70 baseline + 10 no error + 10 write_edit_tool bonus = 90
      expect(result.score).toBe(90);
      expect(result.reasons).toContain("write_edit_tool succeeded");
    });

    it("rewards run_command_tool (+10)", () => {
      const state = createHealthState();

      const result = scoreStep(state, {
        tool: "run_command_tool",
        args: { command: "npm test" },
        observation: { exitCode: 0 },
        isError: false,
      });

      // 70 baseline + 10 no error + 10 run_command_tool bonus = 90
      expect(result.score).toBe(90);
      expect(result.reasons).toContain("run_command_tool succeeded");
    });

    it("does not reward other tools with the +10 bonus", () => {
      const state = createHealthState();

      const result = scoreStep(state, {
        tool: "read_tool",
        args: { filePath: "src/main.ts" },
        observation: { content: "..." },
        isError: false,
      });

      // 70 baseline + 10 no error = 80 (no bonus for read_tool)
      expect(result.score).toBe(80);
    });

    it("score is clamped 0-100", () => {
      const state = createHealthState();

      // Error + duplicate should go below 0
      scoreStep(state, {
        tool: "grep_tool",
        args: { regex: "foo" },
        observation: { matches: [] },
        isError: true,
      });
      const result = scoreStep(state, {
        tool: "grep_tool",
        args: { regex: "foo" },
        observation: { matches: [] },
        isError: true,
      });

      // 70 - 45 (error) - 35 (duplicate) = -10, clamped to 0
      expect(result.score).toBe(0);
    });

    it("score is clamped to max 100", () => {
      const state = createHealthState();

      // Multiple bonuses should not exceed 100
      const result = scoreStep(state, {
        tool: "write_edit_tool",
        args: { filePath: "src/main.ts" },
        observation: { success: true },
        isError: false,
      });

      // 70 + 10 (no error) + 10 (write_edit_tool) = 90, well under 100
      expect(result.score).toBe(90);
    });
  });

  describe("rollingHealth()", () => {
    it("returns 100 for empty state", () => {
      const state = createHealthState();
      expect(rollingHealth(state)).toBe(100);
    });

    it("averages last N scores", () => {
      const state = createHealthState();
      state.scores.push(80, 90, 70);
      expect(rollingHealth(state, 3)).toBe(80); // (80 + 90 + 70) / 3 = 80
    });

    it("uses default window of 5", () => {
      const state = createHealthState();
      state.scores.push(100, 100, 100);
      expect(rollingHealth(state)).toBe(100);
    });

    it("averages only the last N when more scores exist", () => {
      const state = createHealthState();
      state.scores.push(50, 60, 70, 80, 90, 100);
      // Last 3: 80, 90, 100 = 90
      expect(rollingHealth(state, 3)).toBe(90);
    });

    it("rounds to nearest integer", () => {
      const state = createHealthState();
      state.scores.push(85, 86);
      expect(rollingHealth(state, 2)).toBe(86); // (85 + 86) / 2 = 85.5 -> 86
    });
  });
});
