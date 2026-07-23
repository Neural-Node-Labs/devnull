import fs from "node:fs";
import path from "node:path";

/**
 * Shared error logging utility for all tool implementations.
 *
 * Writes structured error entries to `.log/tools.log` following the same
 * convention as FileTelemetry (ISO timestamp + JSON line). This creates the
 * observability layer needed to debug tool failures without relying on
 * console output or uncaught exception handlers.
 *
 * Log format (one line per entry):
 *   <ISO timestamp> {"tool":"<name>","error":"<message>","stack":"<stack>","context":"<optional>"}
 *
 * The log directory respects DEVNULL_LOG_DIR env var, consistent with
 * FileTelemetry, filePhaseReportStore, fileTaskHistoryStore, fileWbsStore.
 */

function getLogDir(): string {
  return process.env.DEVNULL_LOG_DIR ?? path.join(process.cwd(), ".log");
}

/**
 * Log a tool error to `.log/tools.log`.
 *
 * @param toolName - The name of the tool that encountered the error
 * @param error - The error object or string description
 * @param context - Optional additional context (e.g. arguments, file path)
 */
export function logToolError(toolName: string, error: unknown, context?: string): void {
  try {
    const logDir = getLogDir();
    fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(logDir, "tools.log");
    const serialized =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };

    const entry = {
      tool: toolName,
      ...serialized,
      ...(context ? { context } : {}),
    };

    const line = `${new Date().toISOString()} ${JSON.stringify(entry)}\n`;
    fs.appendFileSync(logFile, line, "utf-8");
  } catch {
    // If logging itself fails, silently ignore — we don't want a logging
    // failure to cascade into further errors. The tool's own error will
    // still propagate to the caller via the normal error path.
  }
}
