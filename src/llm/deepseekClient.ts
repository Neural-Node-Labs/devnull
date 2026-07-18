import { LlmClient, LlmMessage, LlmResponse, ToolSchema } from "../core/types.js";
import { LlmConfig, resolveModelForSkill } from "../config/loadConfig.js";
import { TelemetryInterface } from "../core/types.js";

/**
 * DeepSeek is the default LLM backend for devnull (OpenAI-compatible /chat/completions).
 * Falls back to the configured fallback provider if the API key is missing or the call fails.
 */
export class DeepSeekClient implements LlmClient {
  constructor(
    private config: LlmConfig,
    private telemetry?: TelemetryInterface,
    private skillName?: string
  ) {}

  async complete(
    messages: LlmMessage[],
    opts?: { model?: string; temperature?: number; tools?: ToolSchema[]; responseFormat?: "json_object" }
  ): Promise<LlmResponse> {
    const resolved = resolveModelForSkill(this.config, this.skillName);
    const model = opts?.model ?? resolved.model;
    const apiKey = process.env[this.config.api_key_env];

    if (!apiKey) {
      return this.fallback(messages, "missing DEEPSEEK_API_KEY");
    }

    const url = `${this.config.base_url}${this.config.endpoint}`;

    // Per DeepSeek's Thinking Mode docs: temperature/top_p/presence_penalty/frequency_penalty
    // have NO EFFECT in thinking mode (silently ignored, not an error) -- omit them entirely
    // rather than sending dead parameters. reasoning_effort is the real lever there instead.
    // The `thinking` field itself is always sent explicitly (never omitted) so behavior never
    // depends on a model's own default, which can differ between tiers.
    const samplingParams = resolved.thinking ? {} : { temperature: opts?.temperature ?? resolved.temperature };
    const thinkingParams = resolved.thinking
      ? { thinking: { type: "enabled" }, ...(resolved.reasoningEffort ? { reasoning_effort: resolved.reasoningEffort } : {}) }
      : { thinking: { type: "disabled" } };

    const body = {
      model,
      max_tokens: this.config.max_tokens,
      messages: messages.map(stripUndefined),
      ...samplingParams,
      ...thinkingParams,
      ...(opts?.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
      ...(opts?.responseFormat ? { response_format: { type: opts.responseFormat } } : {}),
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        await this.telemetry?.logError(new Error(`DeepSeek ${res.status}: ${text}`), "DeepSeekClient");
        return this.fallback(messages, `HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        choices: {
          message: { content: string | null; tool_calls?: LlmResponse["toolCalls"]; reasoning_content?: string };
        }[];
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          prompt_cache_hit_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
      };
      const message = data.choices?.[0]?.message;
      await this.telemetry?.logLlmCall(body, data);
      return {
        content: message?.content ?? "",
        toolCalls: message?.tool_calls ?? [],
        reasoningContent: message?.reasoning_content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
              reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens,
              cachedTokens: data.usage.prompt_cache_hit_tokens,
            }
          : undefined,
      };
    } catch (err) {
      await this.telemetry?.logError(err, "DeepSeekClient");
      return this.fallback(messages, "request failed");
    }
  }

  private async fallback(messages: LlmMessage[], reason: string): Promise<LlmResponse> {
    if (!this.config.fallback) {
      throw new Error(`DeepSeek call failed (${reason}) and no fallback provider configured.`);
    }
    await this.telemetry?.logError(new Error(`Falling back: ${reason}`), "DeepSeekClient.fallback");

    const { provider, model, api_key_env } = this.config.fallback;
    const apiKey = process.env[api_key_env];
    if (!apiKey) {
      // Surface the actual error first (the primary failure reason), then mention the
      // fallback as secondary context. Include the request payload for full diagnostics.
      const payload = {
        model: this.config.model,
        max_tokens: this.config.max_tokens,
        messageCount: messages.length,
        lastMessageRole: messages[messages.length - 1]?.role,
        lastMessagePreview: messages[messages.length - 1]?.content?.slice(0, 200),
      };
      throw new Error(
        `Primary LLM call failed: ${reason}. ` +
        `Fallback provider ${provider} also unavailable (missing ${api_key_env}). ` +
        `Request payload: ${JSON.stringify(payload)}`
      );
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: this.config.max_tokens,
          messages: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
          system: messages.find((m) => m.role === "system")?.content,
        }),
      });
      const data = (await res.json()) as {
        content: { type: string; text?: string }[];
        usage?: { input_tokens: number; output_tokens: number };
      };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      return {
        content: text,
        toolCalls: [],
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          : undefined,
      };
    }

    throw new Error(`Unsupported fallback provider: ${provider}`);
  }
}

function stripUndefined(message: LlmMessage): LlmMessage {
  return Object.fromEntries(Object.entries(message).filter(([, v]) => v !== undefined)) as LlmMessage;
}

