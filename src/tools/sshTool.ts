import { spawn } from "node:child_process";

export interface SshTarget {
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
  password?: string;
}

export interface SshResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Build the base SSH args array.
 * When a password is provided, we omit BatchMode=yes (which disables password auth)
 * and use sshpass to pass the password non-interactively.
 */
function sshBaseArgs(target: SshTarget, extra: string[] = []): string[] {
  const args = ["-o", "StrictHostKeyChecking=accept-new"];
  if (!target.password) args.push("-o", "BatchMode=yes");
  if (target.port) args.push("-p", String(target.port));
  if (target.keyPath) args.push("-i", target.keyPath);
  return [...args, ...extra];
}

/**
 * Build the full command + args array, optionally wrapping with sshpass when a
 * password is set. This keeps the password out of the process argv (sshpass reads
 * it from the SSHPASS env var) so it won't appear in logs or /proc.
 */
function buildSshCommand(cmd: string, args: string[], target: SshTarget): { cmd: string; args: string[] } {
  if (target.password) {
    return {
      cmd: "sshpass",
      args: ["-e", cmd, ...args],
    };
  }
  return { cmd, args };
}

function run(cmd: string, args: string[], target?: SshTarget, timeoutMs = 60_000): Promise<SshResult> {
  return new Promise((resolve) => {
    const { cmd: resolvedCmd, args: resolvedArgs } = target ? buildSshCommand(cmd, args, target) : { cmd, args };
    const child = spawn(resolvedCmd, resolvedArgs, {
      timeout: timeoutMs,
      env: target?.password ? { ...process.env, SSHPASS: target.password } : process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
    child.on("error", (err) => resolve({ exitCode: -1, stdout, stderr: String(err) }));
  });
}

/** Runs a single command on the remote host over SSH. */
export async function sshExec(target: SshTarget, command: string): Promise<SshResult> {
  const args = [...sshBaseArgs(target), `${target.user}@${target.host}`, command];
  return run("ssh", args, target);
}

/** Uploads a local file/dir to the remote host via scp (-r for directories). */
export async function scpUpload(target: SshTarget, localPath: string, remotePath: string, recursive = false): Promise<SshResult> {
  const scpArgs = ["-o", "StrictHostKeyChecking=accept-new"];
  if (!target.password) scpArgs.push("-o", "BatchMode=yes");
  if (target.port) scpArgs.push("-P", String(target.port));
  if (target.keyPath) scpArgs.push("-i", target.keyPath);
  if (recursive) scpArgs.push("-r");
  scpArgs.push(localPath, `${target.user}@${target.host}:${remotePath}`);
  return run("scp", scpArgs, target, 300_000);
}

/** Downloads a remote file/dir to a local path via scp. */
export async function scpDownload(target: SshTarget, remotePath: string, localPath: string, recursive = false): Promise<SshResult> {
  const scpArgs = ["-o", "StrictHostKeyChecking=accept-new"];
  if (!target.password) scpArgs.push("-o", "BatchMode=yes");
  if (target.port) scpArgs.push("-P", String(target.port));
  if (target.keyPath) scpArgs.push("-i", target.keyPath);
  if (recursive) scpArgs.push("-r");
  scpArgs.push(`${target.user}@${target.host}:${remotePath}`, localPath);
  return run("scp", scpArgs, target, 300_000);
}

