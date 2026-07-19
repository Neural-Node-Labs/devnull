import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export interface StoredProject {
  id: string;
  name: string;
  path: string;
  active: boolean;
  includeInLlm: boolean;
  createdAt: string;
}

const STORE_PATH = path.join(os.homedir(), ".devnull", "projects.json");

function load(): StoredProject[] {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return []; // corrupt store shouldn't take the whole API down
  }
}

function save(projects: StoredProject[]): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(projects, null, 2), "utf-8");
}

export function listProjects(): StoredProject[] {
  return load();
}

export function getProject(id: string): StoredProject | undefined {
  return load().find((p) => p.id === id);
}

export interface AddProjectResult {
  project?: StoredProject;
  error?: string;
  /** True when the directory didn't exist yet and was created as part of this call, so callers
   *  can tell the user rather than silently creating folders on their filesystem. */
  created?: boolean;
}

/** Creates the directory if it doesn't exist yet (mkdir -p) rather than rejecting — this is
 *  meant to double as "set up a fresh workspace for a new project", not just "point at an
 *  existing one". Still rejects if the path exists but is a file, since that can't become a
 *  project root. */
export function addProject(name: string, dirPath: string): AddProjectResult {
  const trimmedName = name.trim();
  const trimmedPath = dirPath.trim();
  if (!trimmedName) return { error: "Project name is required" };
  if (!trimmedPath) return { error: "Project path is required" };

  let created = false;
  if (!fs.existsSync(trimmedPath)) {
    try {
      fs.mkdirSync(trimmedPath, { recursive: true });
      created = true;
    } catch (err) {
      return { error: `Could not create directory: ${err instanceof Error ? err.message : String(err)}` };
    }
  } else if (!fs.statSync(trimmedPath).isDirectory()) {
    return { error: `Path exists but is not a directory: ${trimmedPath}` };
  }

  const projects = load();
  if (projects.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
    return { error: `A project named "${trimmedName}" already exists` };
  }

  const project: StoredProject = {
    id: crypto.randomUUID(),
    name: trimmedName,
    path: trimmedPath,
    active: projects.length === 0, // first project added becomes active by default
    includeInLlm: false,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  save(projects);
  return { project, created };
}

export interface UpdateProjectInput {
  name?: string;
  path?: string;
  includeInLlm?: boolean;
}

export function updateProject(id: string, updates: UpdateProjectInput): AddProjectResult {
  const projects = load();
  const project = projects.find((p) => p.id === id);
  if (!project) return { error: "Project not found" };

  let created = false;
  if (updates.path !== undefined) {
    const trimmedPath = updates.path.trim();
    if (!fs.existsSync(trimmedPath)) {
      try {
        fs.mkdirSync(trimmedPath, { recursive: true });
        created = true;
      } catch (err) {
        return { error: `Could not create directory: ${err instanceof Error ? err.message : String(err)}` };
      }
    } else if (!fs.statSync(trimmedPath).isDirectory()) {
      return { error: `Path exists but is not a directory: ${trimmedPath}` };
    }
    project.path = trimmedPath;
  }
  if (updates.name !== undefined) project.name = updates.name.trim();
  if (updates.includeInLlm !== undefined) project.includeInLlm = updates.includeInLlm;

  save(projects);
  return { project, created };
}

export function setActiveProject(id: string): AddProjectResult {
  const projects = load();
  const target = projects.find((p) => p.id === id);
  if (!target) return { error: "Project not found" };
  for (const p of projects) p.active = p.id === id;
  save(projects);
  return { project: target };
}

export function deleteProject(id: string): { deleted: boolean; error?: string } {
  const projects = load();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return { deleted: false, error: "Project not found" };
  const [removed] = projects.splice(index, 1);
  // If the active project was removed, promote another one so there's always an active
  // project when at least one exists (matches the single-active-project UI expectation).
  if (removed.active && projects.length > 0) projects[0].active = true;
  save(projects);
  return { deleted: true };
}
