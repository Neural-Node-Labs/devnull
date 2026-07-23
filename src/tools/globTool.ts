import fg from "fast-glob";
import { loadIgnoreRules } from "../indexing/ignoreRules.js";
import { logToolError } from "./toolLogger.js";

export async function globTool(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  try {
    const ignore = loadIgnoreRules(cwd);
    return fg(pattern, { cwd, ignore, dot: false, onlyFiles: true });
  } catch (err) {
    logToolError("glob_tool", err, `pattern=${pattern}, cwd=${cwd}`);
    throw err;
  }
}
