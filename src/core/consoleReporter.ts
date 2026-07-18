/**
 * Live console reporting for the ReAct loop. Purely presentational — never affects control
 * flow. Telemetry (src/telemetry/logger.ts) remains the source of truth for the persisted
 * record; this module just mirrors what's happening to stdout as it happens, instead of the
 * terminal going silent for the duration of every LLM call and tool execution.
 *
 * Degrades gracefully when stdout isn't a TTY (piped output, CI logs, etc.): the animated
 * spinner is skipped in favor of a single static line, and ANSI color codes are omitted.
 */

const isTTY = Boolean(process.stdout.isTTY);

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function color(text: string, code: string): string {
  return isTTY ? `${code}${text}${ANSI.reset}` : text;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Shows an animated "thinking" spinner while an async operation (an LLM call) is in flight,
 * then clears the line. No-ops the animation (falls back to a single static line) when stdout
 * isn't a TTY, since carriage-return redraws don't make sense in piped/log output.
 */
export class Spinner {
  private frame = 0;
  private timer: NodeJS.Timeout | null = null;
  private startedAt = 0;

  start(label: string): void {
    this.startedAt = Date.now();
    if (!isTTY) {
      console.log(color(`… ${label}`, ANSI.dim));
      return;
    }
    process.stdout.write(`${SPINNER_FRAMES[0]} ${label}`);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
      process.stdout.write(`\r${color(SPINNER_FRAMES[this.frame], ANSI.cyan)} ${label} ${color(`(${elapsed}s)`, ANSI.dim)}\x1b[K`);
    }, 90);
  }

  /** Clears the spinner line. Pass a message to leave a short summary in its place. */
  stop(message?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (isTTY) {
      process.stdout.write("\r\x1b[K");
    }
    if (message) console.log(message);
  }
}

/** Indent prefix so subagent output is visually distinguishable from the parent run. */
function prefix(indent: number): string {
  return indent > 0 ? "  ".repeat(indent) + color("↳ ", ANSI.dim) : "";
}

/**
 * Prints the model's reasoning/thought for this step. `reasoningContent` is DeepSeek's
 * thinking-mode chain-of-thought (see deepseekClient.ts); falls back to `content` when
 * thinking mode is off or the model didn't return one, so there's always something shown.
 */
export function reportThought(text: string | undefined, indent = 0): void {
  if (!text || !text.trim()) return;
  const label = color("💭 Thought", ANSI.magenta);
  const body = text.trim();
  console.log(`${prefix(indent)}${label}${isTTY ? "" : ":"} ${color(truncate(body, 500), ANSI.dim)}`);
}

export function reportAction(tool: string, input: unknown, indent = 0): void {
  const label = color("🔧 Action", ANSI.cyan);
  console.log(`${prefix(indent)}${label}${isTTY ? "" : ":"} ${color(tool, ANSI.bold)} ${color(summarizeInput(input), ANSI.dim)}`);
}

export function reportObservation(observation: unknown, isError: boolean, indent = 0): void {
  const label = isError ? color("✖ Observation", ANSI.red) : color("👁 Observation", ANSI.green);
  console.log(`${prefix(indent)}${label}${isTTY ? "" : ":"} ${color(summarizeInput(observation), ANSI.dim)}`);
}

export function reportSubagentStart(task: string, indent = 0): void {
  console.log(`${prefix(indent)}${color("🧩 Subagent", ANSI.yellow)} ${color(truncate(task, 200), ANSI.dim)}`);
}

/** Per-call token usage, printed right after the Thought for that same LLM call. */
export function reportUsage(
  usage: { promptTokens: number; completionTokens: number; reasoningTokens?: number; cachedTokens?: number } | undefined,
  runningTotal: number,
  indent = 0
): void {
  if (!usage) return;
  const bits = [`${usage.promptTokens.toLocaleString()} in`, `${usage.completionTokens.toLocaleString()} out`];
  if (usage.reasoningTokens) bits.push(`${usage.reasoningTokens.toLocaleString()} reasoning`);
  if (usage.cachedTokens) bits.push(`${usage.cachedTokens.toLocaleString()} cached`);
  const line = `${bits.join(" · ")} — ${runningTotal.toLocaleString()} total this run`;
  console.log(`${prefix(indent)}${color("🪙", ANSI.yellow)} ${color(line, ANSI.dim)}`);
}

/** End-of-run summary, printed once after the final answer. */
export function reportTotalUsage(
  cumulative: { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens?: number },
  callCount: number,
  indent = 0
): void {
  if (callCount === 0) return;
  const reasoningBit = cumulative.reasoningTokens ? ` (${cumulative.reasoningTokens.toLocaleString()} reasoning)` : "";
  console.log(
    `${prefix(indent)}${color("🪙 Total", ANSI.bold)} ${color(
      `${cumulative.totalTokens.toLocaleString()} tokens${reasoningBit} — ${cumulative.promptTokens.toLocaleString()} in · ${cumulative.completionTokens.toLocaleString()} out across ${callCount} LLM call${callCount === 1 ? "" : "s"}`,
      ANSI.dim
    )}`
  );
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function summarizeInput(value: unknown): string {
  try {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    return truncate(json, 300);
  } catch {
    return String(value);
  }
}
