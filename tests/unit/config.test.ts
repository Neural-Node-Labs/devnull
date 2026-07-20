/**
 * Unit tests for loadConfig.ts (src/config/loadConfig.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadLlmConfig, resolveModelForSkill } from "../../src/config/loadConfig.js";
import type { LlmConfig } from "../../src/config/loadConfig.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
}

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadLlmConfig()", () => {
    it("returns defaults when no config file exists", () => {
      const config = loadLlmConfig(path.join(tempDir, "nonexistent.yaml"));

      expect(config.provider).toBe("deepseek");
      expect(config.base_url).toBe("https://api.deepseek.com/v1");
      expect(config.endpoint).toBe("/chat/completions");
      expect(config.model).toBe("deepseek-v4-flash");
      expect(config.api_key_env).toBe("DEEPSEEK_API_KEY");
      expect(config.max_tokens).toBe(4096);
      expect(config.temperature).toBe(0.0);
      expect(config.thinking).toBe(false);
    });

    it("reads config from YAML file", () => {
      const configPath = path.join(tempDir, "llm.yaml");
      fs.writeFileSync(configPath, `
provider: openai
base_url: https://api.openai.com/v1
endpoint: /chat/completions
model: gpt-4
api_key_env: OPENAI_API_KEY
max_tokens: 8192
temperature: 0.5
thinking: true
`, "utf-8");

      const config = loadLlmConfig(configPath);

      expect(config.provider).toBe("openai");
      expect(config.base_url).toBe("https://api.openai.com/v1");
      expect(config.model).toBe("gpt-4");
      expect(config.api_key_env).toBe("OPENAI_API_KEY");
      expect(config.max_tokens).toBe(8192);
      expect(config.temperature).toBe(0.5);
      expect(config.thinking).toBe(true);
    });

    it("reads config with overrides", () => {
      const configPath = path.join(tempDir, "llm.yaml");
      fs.writeFileSync(configPath, `
provider: deepseek
base_url: https://api.deepseek.com/v1
endpoint: /chat/completions
model: deepseek-v4-flash
api_key_env: DEEPSEEK_API_KEY
max_tokens: 4096
temperature: 0.0
overrides:
  programmer:
    model: deepseek-v4-flash-thinking
    temperature: 0.2
    thinking: true
    reasoning_effort: high
`, "utf-8");

      const config = loadLlmConfig(configPath);

      expect(config.overrides).toBeDefined();
      expect(config.overrides!["programmer"].model).toBe("deepseek-v4-flash-thinking");
      expect(config.overrides!["programmer"].temperature).toBe(0.2);
      expect(config.overrides!["programmer"].thinking).toBe(true);
      expect(config.overrides!["programmer"].reasoning_effort).toBe("high");
    });
  });

  describe("resolveModelForSkill()", () => {
    const baseConfig: LlmConfig = {
      provider: "deepseek",
      base_url: "https://api.deepseek.com/v1",
      endpoint: "/chat/completions",
      model: "deepseek-v4-flash",
      api_key_env: "DEEPSEEK_API_KEY",
      max_tokens: 4096,
      temperature: 0.0,
      thinking: false,
    };

    it("returns base config when no override", () => {
      const resolved = resolveModelForSkill(baseConfig, "programmer");
      expect(resolved.model).toBe("deepseek-v4-flash");
      expect(resolved.temperature).toBe(0.0);
      expect(resolved.thinking).toBe(false);
      expect(resolved.reasoningEffort).toBeUndefined();
    });

    it("returns override when skill matches", () => {
      const config: LlmConfig = {
        ...baseConfig,
        overrides: {
          programmer: {
            model: "deepseek-v4-flash-thinking",
            temperature: 0.2,
            thinking: true,
            reasoning_effort: "high",
          },
        },
      };

      const resolved = resolveModelForSkill(config, "programmer");
      expect(resolved.model).toBe("deepseek-v4-flash-thinking");
      expect(resolved.temperature).toBe(0.2);
      expect(resolved.thinking).toBe(true);
      expect(resolved.reasoningEffort).toBe("high");
    });

    it("returns base config when skillName is undefined", () => {
      const config: LlmConfig = {
        ...baseConfig,
        overrides: {
          programmer: { model: "other-model", temperature: 0.5 },
        },
      };

      const resolved = resolveModelForSkill(config, undefined);
      expect(resolved.model).toBe("deepseek-v4-flash");
      expect(resolved.temperature).toBe(0.0);
    });

    it("returns base config when overrides is undefined", () => {
      const resolved = resolveModelForSkill(baseConfig, "programmer");
      expect(resolved.model).toBe("deepseek-v4-flash");
      expect(resolved.temperature).toBe(0.0);
    });

    it("partial override only overrides specified fields", () => {
      const config: LlmConfig = {
        ...baseConfig,
        overrides: {
          tester: { model: "gpt-4" }, // only model specified
        },
      };

      const resolved = resolveModelForSkill(config, "tester");
      expect(resolved.model).toBe("gpt-4");
      // temperature should fall back to base config
      expect(resolved.temperature).toBe(0.0);
      expect(resolved.thinking).toBe(false);
    });
  });
});
