/**
 * Unit tests for context compaction logic (src/core/contextCompaction.ts).
 * Tests the compactStaleFileReads function that collapses stale read_tool observations.
 */
import { describe, it, expect } from "vitest";
import { compactStaleFileReads, STALE_READ_MARKER } from "../../src/core/contextCompaction.js";
import type { LlmMessage } from "../../src/core/types.js";

describe("compactStaleFileReads", () => {
  it("collapses an earlier read_tool observation for the same file path", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "old content here" }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "new content here" }) },
    ];

    compactStaleFileReads(messages, "src/main.ts", "c2");

    const collapsed = JSON.parse(messages[1].content as string);
    expect(collapsed.content).toContain(STALE_READ_MARKER);
    expect(collapsed.content).toContain("src/main.ts");
  });

  it("does not collapse read_tool observations for different file paths", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/other.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: JSON.stringify({ filePath: "src/other.ts", content: "other content" }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "new content" }) },
    ];

    compactStaleFileReads(messages, "src/main.ts", "c2");

    // The first message should NOT be collapsed (different file path)
    const first = JSON.parse(messages[1].content as string);
    expect(first.filePath).toBe("src/other.ts");
    expect(first.content).toBe("other content");
  });

  it("does not collapse non-read_tool messages", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "run_command_tool", arguments: JSON.stringify({ command: "npm test" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "run_command_tool", content: JSON.stringify({ command: "npm test", exitCode: 0 }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "content" }) },
    ];

    compactStaleFileReads(messages, "src/main.ts", "c2");

    // The first message should remain unchanged
    expect(messages[1].content).toBe(JSON.stringify({ command: "npm test", exitCode: 0 }));
  });

  it("handles write_edit_tool as a trigger for collapsing stale reads", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "old content" }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "write_edit_tool", arguments: JSON.stringify({ filePath: "src/main.ts", mode: "edit" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "write_edit_tool", content: JSON.stringify({ filePath: "src/main.ts", mode: "edit" }) },
    ];

    compactStaleFileReads(messages, "src/main.ts", "c2");

    const collapsed = JSON.parse(messages[1].content as string);
    expect(collapsed.content).toContain(STALE_READ_MARKER);
  });

  it("collapses all stale reads, not just the most recent one", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "first read" }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "second read" }) },
      { role: "assistant", tool_calls: [{ id: "c3", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c3", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "third read" }) },
    ];

    compactStaleFileReads(messages, "src/main.ts", "c3");

    // c1 should be collapsed (stale relative to c3)
    const first = JSON.parse(messages[1].content as string);
    expect(first.content).toContain(STALE_READ_MARKER);

    // c2 should also be collapsed
    const second = JSON.parse(messages[3].content as string);
    expect(second.content).toContain(STALE_READ_MARKER);

    // c3 should remain intact
    const third = JSON.parse(messages[5].content as string);
    expect(third.content).toBe("third read");
  });

  it("handles messages with non-JSON content gracefully", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: "plain text content" },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "new" }) },
    ];

    // Should not throw — the function collapses regardless of content format
    compactStaleFileReads(messages, "src/main.ts", "c2");

    // The stale message gets collapsed even if it was plain text (no JSON.parse needed)
    const collapsed = JSON.parse(messages[1].content as string);
    expect(collapsed.content).toContain(STALE_READ_MARKER);
  });

  it("does not collapse the current tool call's observation", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "stale" }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "fresh" }) },
    ];

    compactStaleFileReads(messages, "src/main.ts", "c2");

    // c2 (current) should NOT be collapsed
    const current = JSON.parse(messages[3].content as string);
    expect(current.content).toBe("fresh");
  });

  it("does not re-collapse an already-collapsed message", () => {
    const messages: LlmMessage[] = [
      { role: "assistant", tool_calls: [{ id: "c1", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c1", name: "read_tool", content: JSON.stringify({ content: `${STALE_READ_MARKER}: "src/main.ts" was read or modified again after this point` }) },
      { role: "assistant", tool_calls: [{ id: "c2", function: { name: "read_tool", arguments: JSON.stringify({ filePath: "src/main.ts" }) } }] },
      { role: "tool", tool_call_id: "c2", name: "read_tool", content: JSON.stringify({ filePath: "src/main.ts", content: "new" }) },
    ];

    // Should not throw or change anything
    compactStaleFileReads(messages, "src/main.ts", "c2");

    expect(messages[1].content).toContain(STALE_READ_MARKER);
  });
});
