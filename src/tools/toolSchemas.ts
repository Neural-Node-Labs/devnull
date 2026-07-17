import { ToolSchema } from "../core/types.js";

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "glob_tool",
      description: "Find files in the workspace matching a glob pattern, respecting .agentignore/.gitignore/.dockerignore.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.ts'" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_tool",
      description: "Search file contents by regex across the workspace, respecting ignore rules.",
      parameters: {
        type: "object",
        properties: {
          regex: { type: "string", description: "Regular expression to search for" },
          globPattern: { type: "string", description: "Glob to restrict the search to, defaults to '**/*'" },
        },
        required: ["regex"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_tool",
      description: "Read the full contents of a single file.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the file, relative to the workspace root" },
        },
        required: ["filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_edit_tool",
      description:
        "Write a new file (mode='write') or perform a unique exact-match string replace on an existing file (mode='edit').",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", description: "'write' or 'edit'" },
          filePath: { type: "string", description: "Path to the file, relative to the workspace root" },
          content: { type: "string", description: "Full file content, required when mode='write'" },
          oldStr: { type: "string", description: "Exact string to replace, required when mode='edit'" },
          newStr: { type: "string", description: "Replacement string, required when mode='edit'" },
        },
        required: ["mode", "filePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command_tool",
      description:
        "Execute a shell command in the workspace (tests, linter, type-checker, kubectl, docker build, repro steps). Returns exit code, stdout, stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ssh_tool",
      description: "Run a command on a remote host over SSH, or upload/download a file via scp.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "'exec', 'upload', or 'download'" },
          host: { type: "string" },
          user: { type: "string" },
          port: { type: "number", description: "defaults to 22" },
          keyPath: { type: "string", description: "path to private key; omit to use ssh-agent/default keys" },
          command: { type: "string", description: "required when action='exec'" },
          localPath: { type: "string", description: "required for upload/download" },
          remotePath: { type: "string", description: "required for upload/download" },
          recursive: { type: "boolean", description: "for upload/download of a directory" },
        },
        required: ["action", "host", "user"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_task_tool",
      description:
        "Schedule a shell command to run later: recurring via OS cron ('add' with cronExpr), one-off after a delay ('once'), or list/remove existing devnull-managed cron jobs.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "'add', 'once', 'list', or 'remove'" },
          id: { type: "string", description: "job id, required for 'add' and 'remove'" },
          cronExpr: { type: "string", description: "standard 5-field cron expression, required for 'add'" },
          delaySeconds: { type: "number", description: "required for 'once'" },
          command: { type: "string", description: "shell command to run, required for 'add' and 'once'" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "playwright_run_tool",
      description: "Run a Playwright test file (or the whole suite) via `npx playwright test` and return pass/fail results.",
      parameters: {
        type: "object",
        properties: {
          scriptPath: { type: "string", description: "path to a specific spec file, relative to cwd; omit to run the whole suite" },
          cwd: { type: "string", description: "workspace containing the Playwright project; defaults to current workspace" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crawl_and_generate_playwright_test_tool",
      description:
        "Fetch a URL, extract its links/buttons/forms, and write a Playwright test skeleton (@playwright/test) covering those elements to outputPath.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to crawl" },
          outputPath: { type: "string", description: "where to write the generated .spec.ts file, relative to cwd" },
        },
        required: ["url", "outputPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_tool",
      description: "Clone, fetch, pull, check status, commit, or push a git/GitHub repository. Uses GITHUB_TOKEN env var if set for HTTPS auth.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "'clone', 'fetch', 'pull', 'status', 'commit', or 'push'" },
          repoUrl: { type: "string", description: "required for 'clone'" },
          repoDir: { type: "string", description: "local path to the repo, required for fetch/pull/status/commit/push" },
          branch: { type: "string" },
          remote: { type: "string", description: "defaults to 'origin'" },
          message: { type: "string", description: "commit message, required for 'commit'" },
          files: { type: "array", items: { type: "string" }, description: "files to stage for 'commit', defaults to ['.']" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docker_deploy_ssh_tool",
      description:
        "Package the current workspace, ship it to a remote host over SSH/scp, and run a Docker command there (default: docker compose up -d --build).",
      parameters: {
        type: "object",
        properties: {
          host: { type: "string" },
          user: { type: "string" },
          port: { type: "number", description: "defaults to 22" },
          keyPath: { type: "string" },
          remotePath: { type: "string", description: "target directory on the remote host" },
          dockerCommand: { type: "string", description: "defaults to 'docker compose up -d --build'" },
        },
        required: ["host", "user", "remotePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_tool",
      description:
        "Delegate a focused research/exploration/analysis task to a fresh sub-agent with its own isolated context. Only the sub-agent's final summary comes back — its intermediate tool calls and reasoning never enter your context window. Use this for parallel investigation, large searches, or any sub-task whose detail you don't need to carry forward.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "A focused, self-contained task description for the sub-agent" },
        },
        required: ["task"],
      },
    },
  },
];
