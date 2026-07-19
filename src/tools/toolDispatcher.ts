import { ToolCall } from "../core/types.js";
import { TOOL_SCHEMAS } from "./toolSchemas.js";
import { globTool } from "./globTool.js";
import { grepTool } from "./grepTool.js";
import { readTool } from "./readTool.js";
import { writeFile, editFile } from "./writeEditTool.js";
import { runCommand } from "./runCommandTool.js";
import { sshExec, scpUpload, scpDownload, SshTarget } from "./sshTool.js";
import { scheduleCron, scheduleOnce, listScheduled, removeScheduled } from "./scheduleTool.js";
import { runPlaywrightTest } from "./playwrightTool.js";
import { crawlAndGeneratePlaywrightTest } from "./crawlPlaywrightTool.js";
import { summarizeUrl } from "./summarizeUrlTool.js";
import { testApiEndpoint } from "./apiTestTool.js";
import { sshCopy } from "./sshCopyTool.js";
import { sshRunCommand } from "./sshRunCommandTool.js";
import { crawlSiteMap, formatSiteMap } from "./siteCrawlerTool.js";
import { loadRemoteConfig } from "../remote/config.js";
import { githubClone, githubFetch, githubPull, githubStatus, githubCommit, githubPush } from "./githubTool.js";
import { deployWorkspaceViaSsh } from "./dockerDeploySshTool.js";
import { dockerComposeUp } from "./dockerComposeDeployTool.js";
import { rebuildIndex, readIndexedFile } from "./indexingTool.js";
import { readTaskHistory, searchTaskHistory } from "../core/taskHistory.js";

export interface DispatchResult {
  toolCallId: string;
  toolName: string;
  observation: unknown;
  isError: boolean;
}

/**
 * Checks the call's arguments against that tool's declared `required` fields in
 * TOOL_SCHEMAS — reused rather than duplicated, so this can't drift out of sync with the
 * schemas the model actually sees. Catches cases like a `run_command_tool` call with `{}`
 * (missing `command`) before it reaches the tool implementation, where it would otherwise
 * crash with a raw, unhelpful runtime error (e.g. Node's "The \"file\" argument must be of
 * type string. Received undefined" from spawn()) that doesn't tell the model what it did wrong
 * or that it should retry with the missing field.
 */
function findMissingRequiredArgs(name: string, args: Record<string, unknown>): string[] {
  const schema = TOOL_SCHEMAS.find((s) => s.function.name === name);
  const required = schema?.function.parameters.required ?? [];
  return required.filter((key) => args[key] === undefined || args[key] === null || args[key] === "");
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

  const missing = findMissingRequiredArgs(name, args);
  if (missing.length > 0) {
    return {
      toolCallId: call.id,
      toolName: name,
      observation: {
        error: `Missing required argument(s) for ${name}: ${missing.join(", ")}. The tool was not run — retry the call with all required fields filled in.`,
        providedArgs: args,
      },
      isError: true,
    };
  }

  try {
    switch (name) {
        case "conversation_tool": {
          // Print the response directly to the console so the user sees it immediately
          console.log(`\n🤖 devnull: ${args.reply}`);

          return {
            toolCallId: call.id,
            toolName: name,
            observation: {
              status: "success",
              message: "Message successfully relayed to the user via terminal interface.",
              timestamp: new Date().toISOString()
            },
            isError: false,
          };
        }
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
        if (args.mode === "edit" && (args.oldStr === undefined || args.newStr === undefined)) {
          return {
            toolCallId: call.id,
            toolName: name,
            observation: { error: "write_edit_tool with mode='edit' requires both 'oldStr' and 'newStr'. The tool was not run.", providedArgs: args },
            isError: true,
          };
        }
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
      case "ssh_copy_tool": {
        const remoteConfig = loadRemoteConfig();
        if (!remoteConfig) {
          return {
            toolCallId: call.id,
            toolName: name,
            observation: {
              error:
                "No remote fleet configured. Set XCODER_SSH_TARGETS (and XCODER_SSH_USER/XCODER_SSH_PASSWORD) to use ssh_copy_tool.",
            },
            isError: true,
          };
        }
        const result = await sshCopy(remoteConfig, cwd, { localPath: args.localPath, remotePath: args.remotePath, target: args.target });
        return { toolCallId: call.id, toolName: name, observation: result, isError: !result.ok };
      }
      case "ssh_run_command": {
        const remoteConfig = loadRemoteConfig();
        if (!remoteConfig) {
          return {
            toolCallId: call.id,
            toolName: name,
            observation: {
              error:
                "No remote fleet configured. Set XCODER_SSH_TARGETS (and XCODER_SSH_USER/XCODER_SSH_PASSWORD) to use ssh_run_command.",
            },
            isError: true,
          };
        }
        const result = await sshRunCommand(remoteConfig, { command: args.command, target: args.target });
        return { toolCallId: call.id, toolName: name, observation: result, isError: !result.ok };
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
      case "docker_compose_deploy_tool": {
        const result = await dockerComposeUp(args.projectDir, cwd);
        return { toolCallId: call.id, toolName: name, observation: result, isError: result.exitCode !== 0 };
      }
      case "docker_deploy_ssh_tool": {
        const result = await deployWorkspaceViaSsh({
          host: args.host,
          user: args.user,
          port: args.port,
          keyPath: args.keyPath,
          remotePath: args.remotePath,
          dockerCommand: args.dockerCommand,
          composeFile: args.composeFile,
          envFile: args.envFile,
          pullFromRegistry: args.pullFromRegistry,
          skipValidation: args.skipValidation,
          skipHealthCheck: args.skipHealthCheck,
          skipRollback: args.skipRollback,
          healthCheckTimeoutMs: args.healthCheckTimeoutMs,
          dockerCommandTimeoutMs: args.dockerCommandTimeoutMs,
        }, cwd);
        const isError = !result.success;
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
      case "task_history_tool": {
        if (args.action === "recent") {
          const tasks = readTaskHistory(cwd, args.limit ?? 5);
          return { toolCallId: call.id, toolName: name, observation: { tasks, count: tasks.length }, isError: false };
        } else if (args.action === "search") {
          if (!args.query) {
            return { toolCallId: call.id, toolName: name, observation: { error: "query is required when action='search'" }, isError: true };
          }
          const tasks = searchTaskHistory(cwd, args.query, args.limit ?? 5);
          return { toolCallId: call.id, toolName: name, observation: { tasks, count: tasks.length }, isError: false };
        } else {
          return { toolCallId: call.id, toolName: name, observation: { error: `Unknown task_history_tool action: ${args.action}. Use 'recent' or 'search'.` }, isError: true };
        }
      }
      case "save_plan_tool": {
        const { PlanStore } = await import("../api/planStore.js");
        const planStore = new PlanStore();
        try {
          const plan = await planStore.savePlan(args.taskDescription, args.planContent, args.tasks ?? []);
          return { toolCallId: call.id, toolName: name, observation: { plan, status: "saved" }, isError: false };
        } finally {
          await planStore.close();
        }
      }
      case "update_task_status_tool": {
        const { PlanStore } = await import("../api/planStore.js");
        const planStore = new PlanStore();
        try {
          const updated = await planStore.updateTaskStatus(args.taskId, args.status);
          if (!updated) {
            return { toolCallId: call.id, toolName: name, observation: { error: "Task not found" }, isError: true };
          }
          return { toolCallId: call.id, toolName: name, observation: { updated: true, taskId: args.taskId, status: args.status }, isError: false };
        } finally {
          await planStore.close();
        }
      }
      case "add_plan_task_tool": {
        const { PlanStore } = await import("../api/planStore.js");
        const planStore = new PlanStore();
        try {
          const task = await planStore.addTask(args.planId, args.description);
          if (!task) {
            return { toolCallId: call.id, toolName: name, observation: { error: "Plan not found" }, isError: true };
          }
          return { toolCallId: call.id, toolName: name, observation: { task, status: "added" }, isError: false };
        } finally {
          await planStore.close();
        }
      }
      case "delete_plan_task_tool": {
        const { PlanStore } = await import("../api/planStore.js");
        const planStore = new PlanStore();
        try {
          const deleted = await planStore.deleteTask(args.taskId);
          if (!deleted) {
            return { toolCallId: call.id, toolName: name, observation: { error: "Task not found" }, isError: true };
          }
          return { toolCallId: call.id, toolName: name, observation: { deleted: true, taskId: args.taskId }, isError: false };
        } finally {
          await planStore.close();
        }
      }
      case "summarize_url_tool": {
        const result = await summarizeUrl(args.url);
        return { toolCallId: call.id, toolName: name, observation: result, isError: false };
      }
      case "api_test_tool": {
        const result = await testApiEndpoint({
          url: args.url,
          method: args.method,
          queryParams: args.queryParams,
          headers: args.headers,
          body: args.body,
          bodyType: args.bodyType,
          maxBodyLength: args.maxBodyLength,
          timeout: args.timeout,
          expectStatus: args.expectStatus,
          expectBodyContains: args.expectBodyContains,
        });

        // If expectStatus was set and doesn't match, return as error
        if (args.expectStatus !== undefined && result.statusCode !== args.expectStatus) {
          return {
            toolCallId: call.id,
            toolName: name,
            observation: {
              error: `Expected status ${args.expectStatus} but got ${result.statusCode}`,
              result,
            },
            isError: true,
          };
        }

        // If expectBodyContains was set and body doesn't contain it, return as error
        if (args.expectBodyContains !== undefined) {
          const bodyStr = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
          if (!bodyStr.includes(args.expectBodyContains)) {
            return {
              toolCallId: call.id,
              toolName: name,
              observation: {
                error: `Expected body to contain "${args.expectBodyContains}" but it did not`,
                result,
              },
              isError: true,
            };
          }
        }

        return { toolCallId: call.id, toolName: name, observation: result, isError: false };
      }
      default:
        return { toolCallId: call.id, toolName: name, observation: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolCallId: call.id, toolName: name, observation: { error: message }, isError: true };
  }
}
