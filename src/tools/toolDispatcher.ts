import { ToolCall } from "../core/types.js";
import { globTool } from "./globTool.js";
import { grepTool } from "./grepTool.js";
import { readTool } from "./readTool.js";
import { writeFile, editFile } from "./writeEditTool.js";
import { runCommand } from "./runCommandTool.js";
import { sshExec, scpUpload, scpDownload, SshTarget } from "./sshTool.js";
import { scheduleCron, scheduleOnce, listScheduled, removeScheduled } from "./scheduleTool.js";
import { runPlaywrightTest } from "./playwrightTool.js";
import { crawlAndGeneratePlaywrightTest } from "./crawlPlaywrightTool.js";
import { githubClone, githubFetch, githubPull, githubStatus, githubCommit, githubPush } from "./githubTool.js";
import { deployWorkspaceViaSsh } from "./dockerDeploySshTool.js";
import { rebuildIndex, readIndexedFile } from "./indexingTool.js";
import { crawlSiteMap, formatSiteMap } from "./siteCrawlerTool.js";

export interface DispatchResult {
  toolCallId: string;
  toolName: string;
  observation: unknown;
  isError: boolean;
}

/**
 * Executes a single tool call requested by the LLM and returns the Observation
 * (or an error observation) to be fed back into the ReAct loop as a tool-role message.
 */
export async function dispatchToolCall(call: ToolCall, cwd: string = process.cwd()): Promise<DispatchResult> {
  const name = call.function.name;
  let args: Record<string, any>;

  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch (err) {
    return { toolCallId: call.id, toolName: name, observation: { error: `Invalid JSON arguments: ${err}` }, isError: true };
  }

  try {
    switch (name) {
      case "glob_tool": {
        const result = await globTool(args.pattern, cwd);
        return { toolCallId: call.id, toolName: name, observation: { files: result }, isError: false };
      }
      case "grep_tool": {
        const result = await grepTool(args.regex, args.globPattern ?? "**/*", cwd);
        return { toolCallId: call.id, toolName: name, observation: { matches: result }, isError: false };
      }
      case "read_tool": {
        const result = readTool(args.filePath, cwd);
        return { toolCallId: call.id, toolName: name, observation: { content: result }, isError: false };
      }
      case "write_edit_tool": {
        const result =
          args.mode === "write"
            ? writeFile(args.filePath, args.content ?? "", cwd)
            : editFile(args.filePath, args.oldStr, args.newStr, cwd);
        return { toolCallId: call.id, toolName: name, observation: result, isError: false };
      }
      case "run_command_tool": {
        const result = await runCommand(args.command, cwd);
        return { toolCallId: call.id, toolName: name, observation: result, isError: result.exitCode !== 0 };
      }
      case "ssh_tool": {
        const target: SshTarget = { host: args.host, user: args.user, port: args.port, keyPath: args.keyPath };
        let result;
        if (args.action === "exec") {
          result = await sshExec(target, args.command);
        } else if (args.action === "upload") {
          result = await scpUpload(target, args.localPath, args.remotePath, args.recursive);
        } else if (args.action === "download") {
          result = await scpDownload(target, args.remotePath, args.localPath, args.recursive);
        } else {
          return { toolCallId: call.id, toolName: name, observation: { error: `Unknown ssh_tool action: ${args.action}` }, isError: true };
        }
        return { toolCallId: call.id, toolName: name, observation: result, isError: result.exitCode !== 0 };
      }
      case "schedule_task_tool": {
        switch (args.action) {
          case "add": {
            const r = await scheduleCron(args.id, args.cronExpr, args.command);
            return { toolCallId: call.id, toolName: name, observation: r, isError: false };
          }
          case "once": {
            const r = await scheduleOnce(args.delaySeconds, args.command);
            return { toolCallId: call.id, toolName: name, observation: r, isError: false };
          }
          case "list": {
            const r = await listScheduled();
            return { toolCallId: call.id, toolName: name, observation: { jobs: r }, isError: false };
          }
          case "remove": {
            const r = await removeScheduled(args.id);
            return { toolCallId: call.id, toolName: name, observation: r, isError: !r.removed };
          }
          default:
            return { toolCallId: call.id, toolName: name, observation: { error: `Unknown schedule_task_tool action: ${args.action}` }, isError: true };
        }
      }
      case "playwright_run_tool": {
        const result = await runPlaywrightTest(args.scriptPath, args.cwd ?? cwd);
        return { toolCallId: call.id, toolName: name, observation: result, isError: result.exitCode !== 0 };
      }
      case "crawl_and_generate_playwright_test_tool": {
        const result = await crawlAndGeneratePlaywrightTest(args.url, args.outputPath, cwd);
        return { toolCallId: call.id, toolName: name, observation: result, isError: false };
      }
      case "github_tool": {
        let result;
        switch (args.action) {
          case "clone":
            result = await githubClone(args.repoUrl, args.repoDir ?? args.targetDir, args.branch);
            break;
          case "fetch":
            result = await githubFetch(args.repoDir, args.remote);
            break;
          case "pull":
            result = await githubPull(args.repoDir, args.remote, args.branch);
            break;
          case "status":
            result = await githubStatus(args.repoDir);
            break;
          case "commit":
            result = await githubCommit(args.repoDir, args.message, args.files);
            break;
          case "push":
            result = await githubPush(args.repoDir, args.remote, args.branch);
            break;
          default:
            return { toolCallId: call.id, toolName: name, observation: { error: `Unknown github_tool action: ${args.action}` }, isError: true };
        }
        return { toolCallId: call.id, toolName: name, observation: result, isError: result.exitCode !== 0 };
      }
      case "docker_deploy_ssh_tool": {
        const target: SshTarget = { host: args.host, user: args.user, port: args.port, keyPath: args.keyPath };
        const result = await deployWorkspaceViaSsh(target, args.remotePath, args.dockerCommand, cwd);
        const isError = result.remoteCommandResult.exitCode !== 0;
        return { toolCallId: call.id, toolName: name, observation: result, isError };
      }
      case "indexing_tool": {
        if (args.action === "rebuild") {
          const result = await rebuildIndex(cwd);
          return {
            toolCallId: call.id,
            toolName: name,
            observation: { entriesCount: result.entriesCount, generatedAt: result.generatedAt },
            isError: false,
          };
        } else if (args.action === "read") {
          if (!args.filepath) {
            return { toolCallId: call.id, toolName: name, observation: { error: "filepath is required when action='read'" }, isError: true };
          }
          const content = readIndexedFile(args.filepath, cwd);
          if (content === undefined) {
            return { toolCallId: call.id, toolName: name, observation: { error: `File '${args.filepath}' not found in index. Try rebuilding the index first.` }, isError: true };
          }
          return { toolCallId: call.id, toolName: name, observation: { content }, isError: false };
        } else {
          return { toolCallId: call.id, toolName: name, observation: { error: `Unknown indexing_tool action: ${args.action}. Use 'rebuild' or 'read'.` }, isError: true };
        }
      }
      case "crawl_site_mapper_tool": {
        const result = await crawlSiteMap(args.url, {
          maxPages: args.maxPages ?? 50,
          maxDepth: args.maxDepth ?? 5,
          sameDomain: args.sameDomain ?? true,
        });
        const formatted = formatSiteMap(result);
        return {
          toolCallId: call.id,
          toolName: name,
          observation: { siteMap: result, formatted },
          isError: false,
        };
      }
      default:
        return { toolCallId: call.id, toolName: name, observation: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolCallId: call.id, toolName: name, observation: { error: message }, isError: true };
  }
}
