export interface SkillHeader {
  name: string;
  role: string;
  description: string;
  triggers: string[];
  version: string;
  requires_tools: string[];
  composes_with: string[];
}

export interface LoadedSkill {
  header: SkillHeader;
  body: string; // full markdown body (Process/Strategies/Instructions/Planning/Experience)
  path: string;
}

export type Phase = "search" | "action" | "validation";

export interface ReActStep {
  iteration: number;
  phase: Phase;
  thought: string;
  action?: { tool: string; input: unknown };
  observation?: unknown;
}

export interface TelemetryInterface {
  logThought(step: ReActStep): Promise<void>;
  logLlmCall(request: unknown, response: unknown): Promise<void>;
  logError(err: unknown, context?: string): Promise<void>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[]; // present on assistant messages that requested tool use
  tool_call_id?: string; // present on tool-role messages (the Observation being returned)
  name?: string; // tool name, present on tool-role messages
  reasoning_content?: string; // thinking-mode: must be echoed back on the next turn's assistant message
}

/** OpenAI-compatible function-calling tool schema (DeepSeek uses the same shape). */
export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; items?: unknown }>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string }; // arguments is a JSON string
}

export interface LlmResponse {
  content: string;
  toolCalls: ToolCall[];
  reasoningContent?: string; // present in thinking mode; must be carried into the next assistant message
}

export interface LlmClient {
  complete(
    messages: LlmMessage[],
    opts?: { model?: string; temperature?: number; tools?: ToolSchema[]; responseFormat?: "json_object" }
  ): Promise<LlmResponse>;
}

export interface IndexEntry {
  filename: string;
  filepath: string;
  fileVersion: string;
  dumpFile: string;
  startLine: number;
  endLine: number;
}

export interface IndexFile {
  generatedAt: string;
  entries: IndexEntry[];
}
