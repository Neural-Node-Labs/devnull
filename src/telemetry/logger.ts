import fs from "node:fs";
import path from "node:path";
import { TelemetryInterface, ReActStep } from "../core/types.js";

/**
 * Default telemetry implementation: flat log files under .log/.
 * This satisfies the TelemetryInterface stub so devnull works with zero config.
 * Swap this out (Postgres/SQLite) by implementing TelemetryInterface and wiring
 * it in core/orchestrator instead of FileTelemetry.
 */
export class FileTelemetry implements TelemetryInterface {
  private logDir: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.logDir = path.join(workspaceRoot, ".log");
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  private append(file: string, line: unknown) {
    const p = path.join(this.logDir, file);
    const entry = `${new Date().toISOString()} ${JSON.stringify(line)}\n`;
    fs.appendFileSync(p, entry, "utf-8");
  }

  async logThought(step: ReActStep): Promise<void> {
    this.append("thinking.log", step);
  }

  async logLlmCall(request: unknown, response: unknown): Promise<void> {
    this.append("llm.log", { request, response });
  }

  async logError(err: unknown, context?: string): Promise<void> {
    const serialized =
      err instanceof Error ? { message: err.message, stack: err.stack } : { err };
    this.append("sys.log", { context, ...serialized });
  }
}

/** No-op telemetry, useful for tests or when logging is explicitly disabled. */
export class NullTelemetry implements TelemetryInterface {
  async logThought(): Promise<void> {}
  async logLlmCall(): Promise<void> {}
  async logError(): Promise<void> {}
}
