import { spawn } from "node:child_process";

export interface SshTarget {
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
}

export interface SshResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function sshBaseArgs(target: SshTarget, extra: string[] = []): string[] {
  const args = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];
  if (target.port) args.push("-p", String(target.port));
  if (target.keyPath) args.push("-i", target.keyPath);
  return [...args, ...extra];
}

function run(cmd: string, args: string[], timeoutMs = 60_000): Promise<SshResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { timeout: timeoutMs });
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
  return run("ssh", args);
}

/** Uploads a local file/dir to the remote host via scp (-r for directories). */
export async function scpUpload(target: SshTarget, localPath: string, remotePath: string, recursive = false): Promise<SshResult> {
  const scpArgs = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];
  if (target.port) scpArgs.push("-P", String(target.port));
  if (target.keyPath) scpArgs.push("-i", target.keyPath);
  if (recursive) scpArgs.push("-r");
  scpArgs.push(localPath, `${target.user}@${target.host}:${remotePath}`);
  return run("scp", scpArgs, 300_000);
}

/** Downloads a remote file/dir to a local path via scp. */
export async function scpDownload(target: SshTarget, remotePath: string, localPath: string, recursive = false): Promise<SshResult> {
  const scpArgs = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];
  if (target.port) scpArgs.push("-P", String(target.port));
  if (target.keyPath) scpArgs.push("-i", target.keyPath);
  if (recursive) scpArgs.push("-r");
  scpArgs.push(`${target.user}@${target.host}:${remotePath}`, localPath);
  return run("scp", scpArgs, 300_000);
}

