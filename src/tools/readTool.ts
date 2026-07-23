import fs from "node:fs";
import path from "node:path";
import { logToolError } from "./toolLogger.js";

export function readTool(filePath: string, cwd: string = process.cwd()): string {
  try {
    const full = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    return fs.readFileSync(full, "utf-8");
  } catch (err) {
    logToolError("read_tool", err, `filePath=${filePath}, cwd=${cwd}`);
    throw err;
  }
}
