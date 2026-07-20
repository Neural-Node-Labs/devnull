/**
 * Mock LLM client and helpers for testing the orchestrator and related components.
 */
import type { LlmClient, LlmMessage, LlmResponse, ToolCall, LlmUsage } from "../../src/core/types.js";

/** Create a ToolCall object for use in mock scripts. */
export function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

/** Create a usage object for mock responses. */
export function mockUsage(promptTokens = 10, completionTokens = 20): LlmUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    reasoningTokens: 0,
    cachedTokens: 0,
  };
}

/**
 * Scripted MockLlmClient that returns pre-programmed responses.
 * Tracks all messages seen for assertion.
 */
export class MockLlmClient implements LlmClient {
  private callIndex = 0;
  public seenMessages: LlmMessage[][] = [];

  constructor(private script: LlmResponse[]) {}

  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    this.seenMessages.push(structuredClone(messages));
    const response = this.script[this.callIndex] ?? {
      content: "(no more scripted responses)",
      toolCalls: [],
      usage: mockUsage(),
    };
    this.callIndex += 1;
    return { ...response, usage: response.usage ?? mockUsage() };
  }
}

/**
 * A mock LLM that can apply real validation logic (not just scripted responses).
 * Used for testing the goal validator's independent audit capability.
 */
export class WorkerAndRealValidatorMock implements LlmClient {
  seenMessages: LlmMessage[][] = [];
  private workerCallIndex = 0;

  constructor(private workerScript: LlmResponse[]) {}

  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    this.seenMessages.push(structuredClone(messages));
    const isValidatorCall = messages[0]?.content.includes("independent verification agent");

    if (isValidatorCall) {
      return this.realValidatorLogic(messages);
    }
    const response = this.workerScript[this.workerCallIndex] ?? {
      content: "(script exhausted)",
      toolCalls: [],
      usage: mockUsage(),
    };
    this.workerCallIndex += 1;
    return { ...response, usage: response.usage ?? mockUsage() };
  }

  /** Real (not scripted) skepticism: reject if the claim mentions something no observation supports. */
  private realValidatorLogic(messages: LlmMessage[]): LlmResponse {
    const userMsg = messages.find((m) => m.role === "user")?.content ?? "";
    const observationsMatch = userMsg.match(/OBSERVATIONS RECORDED DURING THE TASK:\n([\s\S]*?)\n\nAGENT'S CLAIMED/);
    const claimMatch = userMsg.match(/AGENT'S CLAIMED FINAL ANSWER:\n([\s\S]*)/);
    const observations = observationsMatch?.[1] ?? "";
    const claim = claimMatch?.[1] ?? "";

    const claimsTestsPassed = /tests? passed|verified|fixed/i.test(claim);
    const hasPassingObservation = /"exitCode":0/.test(observations);
    const hasFailingObservation = /"exitCode":(?!0)\d+/.test(observations);

    if (claimsTestsPassed && (!hasPassingObservation || hasFailingObservation)) {
      return {
        content: JSON.stringify({
          valid: false,
          reason: "Claim asserts success but observations show no passing run (or show a failing exit code).",
        }),
        toolCalls: [],
        usage: mockUsage(5, 10),
      };
    }
    return {
      content: JSON.stringify({ valid: true, reason: "Claim is supported by a passing observation." }),
      toolCalls: [],
      usage: mockUsage(5, 10),
    };
  }
}

/** A mock telemetry implementation for testing. */
export class MockTelemetry {
  public logs: unknown[] = [];

  async logThought(step: unknown): Promise<void> {
    this.logs.push({ type: "thought", ...step as object });
  }

  async logError(err: unknown, context?: string): Promise<void> {
    this.logs.push({ type: "error", err, context });
  }
}
