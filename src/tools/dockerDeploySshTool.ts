import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { globTool } from "./globTool.js";
import { sshExec, scpUpload, SshTarget, SshResult } from "./sshTool.js";

export interface DeployResult {
  tarBytes: number;
  uploadResult: SshResult;
  remoteExtractResult: SshResult;
  remoteCommandResult: SshResult;
}

function tarWorkspace(cwd: string, fileList: string[], outTarPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", outTarPath, "-T", "-"], { cwd });
    child.stdin.write(fileList.join("\n"));
    child.stdin.end();
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`tar exited with code ${code}`));
      resolve(fs.statSync(outTarPath).size);
    });
    child.on("error", reject);
  });
}

/**
 * Ships the current workspace (respecting .agentignore/.gitignore/.dockerignore, via
 * globTool) to a remote host over SSH, then builds/runs it with Docker on the remote side.
 */
export async function deployWorkspaceViaSsh(
  target: SshTarget,
  remotePath: string,
  dockerCommand = "docker compose up -d --build",
  cwd: string = process.cwd()
): Promise<DeployResult> {
  const files = await globTool("**/*", cwd);
  const tarPath = path.join(os.tmpdir(), `devnull-deploy-${Date.now()}.tar.gz`);
  const tarBytes = await tarWorkspace(cwd, files, tarPath);

  const mkdirResult = await sshExec(target, `mkdir -p ${remotePath}`);
  if (mkdirResult.exitCode !== 0) {
    fs.unlinkSync(tarPath);
    return { tarBytes, uploadResult: mkdirResult, remoteExtractResult: mkdirResult, remoteCommandResult: mkdirResult };
  }

  const remoteTarPath = `${remotePath}/.devnull-deploy.tar.gz`;
  const uploadResult = await scpUpload(target, tarPath, remoteTarPath);
  fs.unlinkSync(tarPath);
  if (uploadResult.exitCode !== 0) {
    return { tarBytes, uploadResult, remoteExtractResult: uploadResult, remoteCommandResult: uploadResult };
  }

  const remoteExtractResult = await sshExec(
    target,
    `tar -xzf ${remoteTarPath} -C ${remotePath} && rm ${remoteTarPath}`
  );
  if (remoteExtractResult.exitCode !== 0) {
    return { tarBytes, uploadResult, remoteExtractResult, remoteCommandResult: remoteExtractResult };
  }

  const remoteCommandResult = await sshExec(target, `cd ${remotePath} && ${dockerCommand}`);
  return { tarBytes, uploadResult, remoteExtractResult, remoteCommandResult };
}

