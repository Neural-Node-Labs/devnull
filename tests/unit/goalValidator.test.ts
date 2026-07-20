/**
 * Unit tests for goalValidator.ts (src/core/goalValidator.ts).
 */
import { describe, it, expect } from "vitest";
import { buildObservationTranscript, validateGoal } from "../../src/core/goalValidator.js";
import { MockLlmClient, mockUsage } from "../fixtures/mockLlm.js";
import type { LlmMessage } from "../../src/core/types.js";

describe("goalValidator", () => {
  describe("buildObservationTranscript()", () => {
    it("extracts tool messages", () => {
      const messages: LlmMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Fix the bug" },
        { role: "assistant", content: "I'll fix it.", tool_calls: [{ id: "c1", type: "function", function: { name: "read_tool", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", name: "read_tool", content: '{"content": "file contents"}' },
        { role: "assistant", content: "Done." },
        { role: "tool", tool_call_id: "c2", name: "run_command_tool", content: '{"exitCode": 0}' },
      ];

      const transcript = buildObservationTranscript(messages);
      expect(transcript).toContain("[read_tool]");
      expect(transcript).toContain("[run_command_tool]");
      expect(transcript).toContain('{"content": "file contents"}');
      expect(transcript).toContain('{"exitCode": 0}');
    });

    it("returns empty string for no tool messages", () => {
      const messages: LlmMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const transcript = buildObservationTranscript(messages);
      expect(transcript).toBe("");
    });

    it("returns empty string for empty array", () => {
      const transcript = buildObservationTranscript([]);
      expect(transcript).toBe("");
    });

    it("separates tool messages with double newlines", () => {
      const messages: LlmMessage[] = [
        { role: "tool", tool_call_id: "c1", name: "read_tool", content: "first" },
        { role: "tool", tool_call_id: "c2", name: "grep_tool", content: "second" },
      ];

      const transcript = buildObservationTranscript(messages);
      expect(transcript).toBe("[read_tool] first\n\n[grep_tool] second");
    });
  });

  describe("validateGoal()", () => {
    it("returns valid=true when LLM confirms the claim", async () => {
      const mockLlm = new MockLlmClient([
        {
          content: JSON.stringify({ valid: true, reason: "Claim is supported by observations." }),
          toolCalls: [],
          usage: mockUsage(10, 5),
        },
      ]);

      const result = await validateGoal(
        mockLlm,
        "Fix the bug in main.ts",
        "[read_tool] file contents\n\n[write_edit_tool] success",
        "Fixed the bug by editing main.ts"
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBe("Claim is supported by observations.");
      expect(result.usage).toBeDefined();
    });

    it("returns valid=false when LLM rejects the claim", async () => {
      const mockLlm = new MockLlmClient([
        {
          content: JSON.stringify({ valid: false, reason: "No observation shows a passing test run." }),
          toolCalls: [],
          usage: mockUsage(10, 5),
        },
      ]);

      const result = await validateGoal(
        mockLlm,
        "Run tests and verify they pass",
        "[run_command_tool] exitCode: 1",
        "All tests pass"
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("No observation shows a passing test run.");
    });

    it("strips markdown fences from LLM response", async () => {
      const mockLlm = new MockLlmClient([
        {
          content: "```json\n{\"valid\": true, \"reason\": \"All good.\"}\n```",
          toolCalls: [],
          usage: mockUsage(10, 5),
        },
      ]);

      const result = await validateGoal(
        mockLlm,
        "Test task",
        "[read_tool] data",
        "Done"
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBe("All good.");
    });

    it("fail-opens (returns valid=true) when LLM response is unparseable", async () => {
      const mockLlm = new MockLlmClient([
        {
          content: "This is not JSON at all",
          toolCalls: [],
          usage: mockUsage(10, 5),
        },
      ]);

      const result = await validateGoal(
        mockLlm,
        "Test task",
        "[read_tool] data",
        "Done"
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toContain("unparseable");
    });

    it("passes the task description and observations to the LLM", async () => {
      const mockLlm = new MockLlmClient([
        {
          content: JSON.stringify({ valid: true, reason: "OK." }),
          toolCalls: [],
          usage: mockUsage(10, 5),
        },
      ]);

      await validateGoal(
        mockLlm,
        "My specific task",
        "[tool] observation data",
        "My final answer"
      );

      expect(mockLlm.seenMessages).toHaveLength(1);
      const userMsg = mockLlm.seenMessages[0].find((m) => m.role === "user");
      expect(userMsg?.content).toContain("My specific task");
      expect(userMsg?.content).toContain("observation data");
      expect(userMsg?.content).toContain("My final answer");
    });
  });
});
