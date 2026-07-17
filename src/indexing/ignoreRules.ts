import fs from "node:fs";
import path from "node:path";

const IGNORE_FILES = [".agent/.agentignore", ".gitignore", ".dockerignore"];
const ALWAYS_IGNORE = ["node_modules/**", ".git/**", "dist/**", ".agent/index/**", ".log/**"];

export function loadIgnoreRules(cwd: string = process.cwd()): string[] {
  const rules = new Set<string>(ALWAYS_IGNORE);

  for (const rel of IGNORE_FILES) {
    const p = path.join(cwd, rel);
    if (!fs.existsSync(p)) continue;
    const lines = fs
      .readFileSync(p, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const line of lines) {
      // normalize directory-only patterns (trailing slash) to glob form
      rules.add(line.endsWith("/") ? `${line}**` : line);
    }
  }
  return [...rules];
}
