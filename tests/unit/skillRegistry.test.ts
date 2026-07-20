/**
 * Unit tests for SkillRegistry (src/core/skillRegistry.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SkillRegistry } from "../../src/core/skillRegistry.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-registry-test-"));
}

function writeSkill(dir: string, skillName: string, frontmatter: Record<string, unknown>, body: string): void {
  const skillDir = path.join(dir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((i: string) => `  - ${i}`).join("\n")}`;
      return `${k}: ${v}`;
    })
    .join("\n");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\n${yaml}\n---\n\n${body}`, "utf-8");
}

describe("SkillRegistry", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadHeaders()", () => {
    it("returns empty array when skill dir doesn't exist", () => {
      const registry = new SkillRegistry(path.join(tempDir, "nonexistent"));
      const headers = registry.loadHeaders();
      expect(headers).toEqual([]);
    });

    it("parses YAML frontmatter correctly", () => {
      writeSkill(tempDir, "programmer", {
        name: "programmer",
        role: "Software Engineer",
        description: "Writes correct, minimal, idiomatic code",
        triggers: ["code", "implement", "fix bug"],
        version: "1.0.0",
        requires_tools: ["write_edit_tool", "run_command_tool"],
        composes_with: ["tester"],
      }, "## Process\n1. Locate context\n2. Implement smallest correct change");

      const registry = new SkillRegistry(tempDir);
      const headers = registry.loadHeaders();

      expect(headers).toHaveLength(1);
      expect(headers[0].name).toBe("programmer");
      expect(headers[0].role).toBe("Software Engineer");
      expect(headers[0].triggers).toEqual(["code", "implement", "fix bug"]);
      expect(headers[0].requires_tools).toEqual(["write_edit_tool", "run_command_tool"]);
      expect(headers[0].composes_with).toEqual(["tester"]);
    });

    it("skips directories without SKILL.md", () => {
      const emptyDir = path.join(tempDir, "empty-skill");
      fs.mkdirSync(emptyDir, { recursive: true });
      // No SKILL.md in this directory

      writeSkill(tempDir, "programmer", {
        name: "programmer",
        role: "Software Engineer",
        description: "Writes code",
        triggers: ["code"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");

      const registry = new SkillRegistry(tempDir);
      const headers = registry.loadHeaders();
      expect(headers).toHaveLength(1);
      expect(headers[0].name).toBe("programmer");
    });

    it("skips files without valid frontmatter", () => {
      const skillDir = path.join(tempDir, "noskill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "no frontmatter here", "utf-8");

      const registry = new SkillRegistry(tempDir);
      const headers = registry.loadHeaders();
      expect(headers).toEqual([]);
    });
  });

  describe("loadSkill()", () => {
    it("returns full skill with header + body", () => {
      writeSkill(tempDir, "tester", {
        name: "tester",
        role: "QA / Test Engineer",
        description: "Owns correctness proof",
        triggers: ["test", "verify"],
        version: "1.0.0",
        requires_tools: ["run_command_tool"],
        composes_with: ["programmer"],
      }, "## Process\n1. Derive cases from spec\n2. Write tests\n3. Run and read output");

      const registry = new SkillRegistry(tempDir);
      registry.loadHeaders();
      const skill = registry.loadSkill("tester");

      expect(skill).toBeDefined();
      expect(skill!.header.name).toBe("tester");
      expect(skill!.header.role).toBe("QA / Test Engineer");
      expect(skill!.body).toBe("## Process\n1. Derive cases from spec\n2. Write tests\n3. Run and read output");
      expect(skill!.path).toContain("tester/SKILL.md");
    });

    it("returns undefined for unknown skill name", () => {
      const registry = new SkillRegistry(tempDir);
      registry.loadHeaders();
      const skill = registry.loadSkill("nonexistent");
      expect(skill).toBeUndefined();
    });

    it("returns undefined when headers not loaded yet and skill doesn't exist", () => {
      const registry = new SkillRegistry(tempDir);
      const skill = registry.loadSkill("anything");
      expect(skill).toBeUndefined();
    });
  });

  describe("route()", () => {
    it("matches triggers correctly", () => {
      writeSkill(tempDir, "programmer", {
        name: "programmer",
        role: "Software Engineer",
        description: "Writes code",
        triggers: ["code", "implement", "fix bug"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");
      writeSkill(tempDir, "tester", {
        name: "tester",
        role: "QA",
        description: "Tests code",
        triggers: ["test", "verify"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");

      const registry = new SkillRegistry(tempDir);
      const result = registry.route("I need to implement a fix for this bug and then test it");

      expect(result).toHaveLength(2);
      // programmer matches "implement" + "fix bug" (2 matches), tester matches "test" (1 match)
      expect(result[0].name).toBe("programmer");
      expect(result[1].name).toBe("tester");
    });

    it("returns empty for no match", () => {
      writeSkill(tempDir, "programmer", {
        name: "programmer",
        role: "Software Engineer",
        description: "Writes code",
        triggers: ["code", "implement"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");

      const registry = new SkillRegistry(tempDir);
      const result = registry.route("deploy the application to production");
      expect(result).toEqual([]);
    });

    it("is case-insensitive in matching", () => {
      writeSkill(tempDir, "programmer", {
        name: "programmer",
        role: "Software Engineer",
        description: "Writes code",
        triggers: ["Code", "IMPLEMENT"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");

      const registry = new SkillRegistry(tempDir);
      const result = registry.route("write some code and implement the feature");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("programmer");
    });
  });

  describe("list()", () => {
    it("returns all headers", () => {
      writeSkill(tempDir, "programmer", {
        name: "programmer",
        role: "Software Engineer",
        description: "Writes code",
        triggers: ["code"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");
      writeSkill(tempDir, "tester", {
        name: "tester",
        role: "QA",
        description: "Tests code",
        triggers: ["test"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");

      const registry = new SkillRegistry(tempDir);
      const list = registry.list();
      expect(list).toHaveLength(2);
      const names = list.map((h) => h.name).sort();
      expect(names).toEqual(["programmer", "tester"]);
    });

    it("returns empty when no skills exist", () => {
      const registry = new SkillRegistry(tempDir);
      const list = registry.list();
      expect(list).toEqual([]);
    });
  });

  describe("DEVNULL_HOME fallback", () => {
    it("uses DEVNULL_HOME when cwd skills dir doesn't exist", () => {
      const homeDir = makeTempDir();
      const homeSkills = path.join(homeDir, "agent", "skills");
      fs.mkdirSync(homeSkills, { recursive: true });
      writeSkill(homeSkills, "devops", {
        name: "devops",
        role: "DevOps Engineer",
        description: "Owns deployment pipeline",
        triggers: ["deploy", "ci"],
        version: "1.0.0",
        requires_tools: [],
        composes_with: [],
      }, "body");

      const origHome = process.env.DEVNULL_HOME;
      const origCwd = process.cwd();
      process.env.DEVNULL_HOME = homeDir;

      try {
        // Temporarily chdir to tempDir (which has no agent/skills dir) so the constructor
        // falls through to DEVNULL_HOME
        process.chdir(tempDir);
        const registry = new SkillRegistry();
        const headers = registry.loadHeaders();
        expect(headers).toHaveLength(1);
        expect(headers[0].name).toBe("devops");
      } finally {
        process.chdir(origCwd);
        if (origHome === undefined) {
          delete process.env.DEVNULL_HOME;
        } else {
          process.env.DEVNULL_HOME = origHome;
        }
        fs.rmSync(homeDir, { recursive: true, force: true });
      }
    });
  });
});
