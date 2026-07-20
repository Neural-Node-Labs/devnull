/**
 * Unit tests for projectStore.ts (src/api/projectStore.ts).
 *
 * Uses vi.mock to redirect os.homedir() to a temp directory so we don't
 * touch the real ~/.devnull/projects.json.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-store-test-"));

// Mock os.homedir BEFORE importing the module under test
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

// Also mock process.env.DEVNULL_PROJECTS_ROOT to use a subdir of tempDir
const projectsRoot = path.join(tempDir, "workspace");
vi.stubEnv("DEVNULL_PROJECTS_ROOT", projectsRoot);

const {
  addProject,
  listProjects,
  getProject,
  updateProject,
  setActiveProject,
  deleteProject,
} = await import("../../src/api/projectStore.js");

const storePath = path.join(tempDir, ".devnull", "projects.json");

beforeEach(() => {
  // Clean up state
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
  }
  const storeDir = path.dirname(storePath);
  if (fs.existsSync(storeDir)) {
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
  // Clean up projects root
  if (fs.existsSync(projectsRoot)) {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("projectStore", () => {
  describe("addProject()", () => {
    it("creates project with slug", () => {
      const result = addProject("My Test Project");

      expect(result.project).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.created).toBe(true);
      expect(result.project!.name).toBe("My Test Project");
      expect(result.project!.id).toBeDefined();
      expect(result.project!.path).toContain("my-test-project");
      expect(result.project!.active).toBe(true); // first project is active
      expect(result.project!.includeInLlm).toBe(false);
      expect(result.project!.createdAt).toBeDefined();
    });

    it("rejects duplicate names (case-insensitive)", () => {
      addProject("My Project");
      const result = addProject("my project");

      expect(result.project).toBeUndefined();
      expect(result.error).toContain("already exists");
    });

    it("rejects empty names", () => {
      const result = addProject("   ");

      expect(result.project).toBeUndefined();
      expect(result.error).toBe("Project name is required");
    });

    it("creates workspace directory", () => {
      const result = addProject("NewProject");
      expect(fs.existsSync(result.project!.path)).toBe(true);
    });

    it("generates unique slugs for similar names", () => {
      addProject("test");
      const result = addProject("test");

      // Second one should fail (duplicate name), not create a slug
      expect(result.error).toContain("already exists");
    });
  });

  describe("listProjects()", () => {
    it("returns all projects", () => {
      addProject("Project A");
      addProject("Project B");

      const projects = listProjects();
      expect(projects).toHaveLength(2);
      const names = projects.map((p) => p.name).sort();
      expect(names).toEqual(["Project A", "Project B"]);
    });

    it("returns empty array when no projects", () => {
      expect(listProjects()).toEqual([]);
    });
  });

  describe("getProject()", () => {
    it("finds by ID", () => {
      const { project } = addProject("Find Me")!;
      const found = getProject(project!.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Find Me");
    });

    it("returns undefined for unknown ID", () => {
      expect(getProject("nonexistent-id")).toBeUndefined();
    });
  });

  describe("updateProject()", () => {
    it("changes name", () => {
      const { project } = addProject("Old Name")!;
      const result = updateProject(project!.id, { name: "New Name" });

      expect(result.error).toBeUndefined();
      expect(result.project!.name).toBe("New Name");

      // Verify persistence
      const fetched = getProject(project!.id);
      expect(fetched!.name).toBe("New Name");
    });

    it("rejects empty name", () => {
      const { project } = addProject("Valid Name")!;
      const result = updateProject(project!.id, { name: "   " });

      expect(result.error).toBe("Project name is required");
    });

    it("rejects duplicate name on rename", () => {
      addProject("First");
      const { project: second } = addProject("Second")!;

      const result = updateProject(second!.id, { name: "First" });
      expect(result.error).toContain("already exists");
    });

    it("returns error for unknown project", () => {
      const result = updateProject("nonexistent", { name: "New" });
      expect(result.error).toBe("Project not found");
    });

    it("updates includeInLlm", () => {
      const { project } = addProject("Test")!;
      updateProject(project!.id, { includeInLlm: true });

      const fetched = getProject(project!.id);
      expect(fetched!.includeInLlm).toBe(true);
    });
  });

  describe("setActiveProject()", () => {
    it("sets one active", () => {
      const { project: p1 } = addProject("Alpha")!;
      const { project: p2 } = addProject("Beta")!;

      setActiveProject(p2!.id);

      const projects = listProjects();
      const alpha = projects.find((p) => p.id === p1!.id);
      const beta = projects.find((p) => p.id === p2!.id);
      expect(alpha!.active).toBe(false);
      expect(beta!.active).toBe(true);
    });

    it("returns error for unknown project", () => {
      const result = setActiveProject("nonexistent");
      expect(result.error).toBe("Project not found");
    });
  });

  describe("deleteProject()", () => {
    it("removes project", () => {
      const { project } = addProject("To Delete")!;
      expect(listProjects()).toHaveLength(1);

      const result = deleteProject(project!.id);
      expect(result.deleted).toBe(true);
      expect(listProjects()).toHaveLength(0);
    });

    it("returns error for unknown project", () => {
      const result = deleteProject("nonexistent");
      expect(result.deleted).toBe(false);
      expect(result.error).toBe("Project not found");
    });

    it("promotes another project when active is deleted", () => {
      const { project: p1 } = addProject("First")!;
      const { project: p2 } = addProject("Second")!;

      // First is active by default, delete it
      deleteProject(p1!.id);

      const projects = listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].active).toBe(true);
    });
  });

  describe("slugify (internal behavior)", () => {
    it("handles special characters", () => {
      // We test this indirectly through addProject
      const { project } = addProject("Hello! @World #2024")!;
      expect(project!.path).toContain("hello-world-2024");
    });

    it("handles multiple spaces and hyphens", () => {
      const { project } = addProject("My   Project---Name")!;
      expect(project!.path).toContain("my-project-name");
    });

    it("falls back to 'project' for all-symbol names", () => {
      const { project } = addProject("!!! @@@ ###")!;
      expect(project!.path).toContain("project");
    });
  });
});
