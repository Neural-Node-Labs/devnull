import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFileP = promisify(execFile);
const MARKER_PREFIX = "# devnull-schedule:";
const IS_WINDOWS = os.platform() === "win32";

export interface ScheduledJob {
  id: string;
  cronExpr: string;
  command: string;
}

// ─── crontab-backed implementation (Linux / macOS) ──────────────────────────

async function readCrontab(): Promise<string> {
  try {
    const { stdout } = await execFileP("crontab", ["-l"]);
    return stdout;
  } catch {
    return ""; // no crontab yet for this user
  }
}

async function writeCrontab(content: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("crontab", ["-"]);
    child.stdin.write(content);
    child.stdin.end();
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`crontab write failed (exit ${code})`))));
  });
}

// ─── schtasks-backed implementation (Windows) ───────────────────────────────
// Windows has no crontab/bash/sleep. We use the built-in Task Scheduler (schtasks) for
// recurring jobs and PowerShell's Start-Sleep for one-off delayed jobs, so this tool works
// out of the box on native Windows instead of requiring WSL or Git Bash.

const WIN_TASK_PREFIX = "devnull-schedule-";

/** Minimal cron -> schtasks mapping. Only supports the common daily/hourly/weekly shapes;
 *  anything more exotic (step values, ranges, multiple day-of-week lists) is rejected with a
 *  clear error rather than silently scheduling the wrong thing. */
function cronToSchtasksArgs(cronExpr: string): string[] {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${cronExpr}" (expected 5 fields)`);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    if (hour === "*") {
      // every N minutes isn't representable as MINUTE schedule directly unless minute is a step;
      // support the common "every hour at :MM" and "every day at HH:MM" shapes explicitly.
      throw new Error(`Unsupported cron shape for Windows scheduling: "${cronExpr}" (hour="*" with fixed minute)`);
    }
    return ["/sc", "DAILY", "/st", `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`];
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const dayMap: Record<string, string> = { "0": "SUN", "1": "MON", "2": "TUE", "3": "WED", "4": "THU", "5": "FRI", "6": "SAT" };
    const day = dayMap[dayOfWeek];
    if (!day) throw new Error(`Unsupported day-of-week in cron expression: "${cronExpr}"`);
    return ["/sc", "WEEKLY", "/d", day, "/st", `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`];
  }
  throw new Error(
    `Unsupported cron shape for Windows scheduling: "${cronExpr}". Windows scheduling supports daily ` +
      `("M H * * *") and weekly ("M H * * D") expressions only — for anything more complex, run devnull under WSL.`
  );
}

async function scheduleCronWindows(id: string, cronExpr: string, command: string): Promise<{ id: string; cronExpr: string }> {
  const taskName = `${WIN_TASK_PREFIX}${id}`;
  const schedArgs = cronToSchtasksArgs(cronExpr);
  await execFileP("schtasks", [
    "/create",
    "/tn", taskName,
    "/tr", command,
    ...schedArgs,
    "/f", // overwrite if it already exists (re-scheduling same id)
  ]);
  return { id, cronExpr };
}

async function listScheduledWindows(): Promise<ScheduledJob[]> {
  try {
    const { stdout } = await execFileP("schtasks", ["/query", "/fo", "CSV", "/v"]);
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const jobs: ScheduledJob[] = [];
    for (const line of lines) {
      if (!line.includes(WIN_TASK_PREFIX)) continue;
      // Best-effort parse; schtasks CSV quoting is simple enough for our own task names.
      const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ""));
      const taskNameCol = cols.find((c) => c.includes(WIN_TASK_PREFIX));
      if (!taskNameCol) continue;
      const id = taskNameCol.split(WIN_TASK_PREFIX).pop()?.split("\\").pop() ?? "";
      if (id) jobs.push({ id, cronExpr: "(see schtasks /query for full schedule)", command: "(see schtasks /query /v)" });
    }
    // De-duplicate (schtasks CSV has one row per instance/trigger sometimes)
    const seen = new Set<string>();
    return jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  } catch {
    return [];
  }
}

async function removeScheduledWindows(id: string): Promise<{ removed: boolean }> {
  try {
    await execFileP("schtasks", ["/delete", "/tn", `${WIN_TASK_PREFIX}${id}`, "/f"]);
    return { removed: true };
  } catch {
    return { removed: false };
  }
}

function scheduleOnceWindows(delaySeconds: number, command: string): { scheduledFor: string } {
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `Start-Sleep -Seconds ${delaySeconds}; ${command}`],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
  return { scheduledFor: new Date(Date.now() + delaySeconds * 1000).toISOString() };
}

// ─── Public API (dispatches by platform) ────────────────────────────────────

/** Registers a recurring OS-level scheduled job: cron-style on Linux/macOS (crontab), Task
 *  Scheduler on Windows (schtasks) — tagged with an id marker for later listing/removal. */
export async function scheduleCron(id: string, cronExpr: string, command: string): Promise<{ id: string; cronExpr: string }> {
  if (IS_WINDOWS) return scheduleCronWindows(id, cronExpr, command);

  const current = await readCrontab();
  const line = `${MARKER_PREFIX}${id}\n${cronExpr} ${command}\n`;
  await writeCrontab(current + (current.endsWith("\n") || current === "" ? "" : "\n") + line);
  return { id, cronExpr };
}

/** Schedules a one-off command to run after `delaySeconds`, surviving beyond the current process. */
export async function scheduleOnce(delaySeconds: number, command: string): Promise<{ scheduledFor: string }> {
  if (IS_WINDOWS) return scheduleOnceWindows(delaySeconds, command);

  const child = spawn("bash", ["-c", `sleep ${delaySeconds} && ${command}`], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { scheduledFor: new Date(Date.now() + delaySeconds * 1000).toISOString() };
}

export async function listScheduled(): Promise<ScheduledJob[]> {
  if (IS_WINDOWS) return listScheduledWindows();

  const content = await readCrontab();
  const lines = content.split("\n");
  const jobs: ScheduledJob[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(MARKER_PREFIX)) {
      const id = lines[i].slice(MARKER_PREFIX.length);
      const jobLine = lines[i + 1] ?? "";
      const match = jobLine.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/);
      if (match) jobs.push({ id, cronExpr: match[1], command: match[2] });
    }
  }
  return jobs;
}

export async function removeScheduled(id: string): Promise<{ removed: boolean }> {
  if (IS_WINDOWS) return removeScheduledWindows(id);

  const content = await readCrontab();
  const lines = content.split("\n");
  const out: string[] = [];
  let skipNext = false;
  let removed = false;
  for (const line of lines) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (line === `${MARKER_PREFIX}${id}`) {
      skipNext = true;
      removed = true;
      continue;
    }
    out.push(line);
  }
  await writeCrontab(out.join("\n"));
  return { removed };
}
