#!/usr/bin/env node
import { Command } from "commander";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadLlmConfig } from "../config/loadConfig.js";
import { DeepSeekClient } from "../llm/deepseekClient.js";
import { FileTelemetry } from "../telemetry/logger.js";
import { ReActOrchestrator, OrchestratorOptions } from "../core/orchestrator.js";
import { SkillRegistry } from "../core/skillRegistry.js";
import { buildIndex } from "../indexing/indexer.js";
import { recordLesson } from "../core/protocol.js";
import { auditReactLoop } from "../core/reactAuditor.js";
import { runLiveDiagnostics } from "../core/liveDiagnostics.js";
import { startApiServer } from "../api/server.js";
import fs from "node:fs";
import path from "node:path";

const program = new Command();
program.name("devnull").description("devnull — ReAct CLI agent with hot-pluggable role skills").version("0.1.0");

program
  .option("--chat", "enter interactive chat mode (workspace = current folder)")
  .option("--task <description>", "execute a single task, asking for clarification if needed")
  .option("--index", "index the current workspace into .agent/index/")
  .option("--skills", "list all loaded skills and their trigger keywords")
  .option("--lesson <text>", "record a lesson to tasks/lessons.md (see devnull.md Self-Improvement Loop)")
  .option("--plan", "force Plan Mode on, regardless of task complexity heuristic")
  .option("--no-plan", "force Plan Mode off, regardless of task complexity heuristic")
  .option("--lean-token", "collapse stale/superseded read_tool file snapshots in context instead of keeping every historical copy (see src/core/contextCompaction.ts); default: off, full history is kept")
  .option("--isolated-workspace", "run tool operations against an isolated ./workspace-agent copy instead of the live project files (see src/core/workspaceManager.ts); default: off")
  .option("--audit-react", "run the built-in bug-fixing scenario battery through the real orchestrator and report on how it performed")
  .option("--audit-out <path>", "where to write the audit report markdown (default: reports/react-audit-<timestamp>.md)")
  .option("--diagnose-live", "run the 7-point ReAct diagnostic suite against the real configured LLM: iteration stopping, restart-approval, duplicate-action avoidance, tool/skill usage, ground-up deployable app, bug fixing, and full SDLC")
  .option("--diagnose-out <path>", "where to write the live diagnostics report markdown (default: reports/live-diagnostics-<timestamp>.md)")
  .option("--serve", "start the devnull HTTP API server")
  .option("--port <number>", "port for the API server (default: 3001)", parseInt)
  .option("--host <address>", "host for the API server (default: 0.0.0.0)")
  .action(async (opts) => {
    const cwd = process.cwd();
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();

    if (opts.index) {
      const result = await buildIndex(cwd);
      console.log(`Indexed ${result.entries.length} files into .agent/index/`);
      return;
    }

    if (opts.skills) {
      const registry = new SkillRegistry();
      const headers = registry.loadHeaders();
      for (const h of headers) {
        console.log(`- ${h.name} (${h.role}) — triggers: ${h.triggers.join(", ")}`);
      }
      return;
    }

    if (opts.lesson) {
      recordLesson(opts.lesson, cwd);
      console.log(`Lesson recorded to tasks/lessons.md`);
      return;
    }

    if (opts.auditReact) {
      const llm = new DeepSeekClient(llmConfig, telemetry);
      console.log(`Running ReAct bug-fixing audit against ${llmConfig.model}...\n`);
      const report = await auditReactLoop(llm, llmConfig.model);

      const outPath = opts.auditOut ?? path.join(cwd, "reports", `react-audit-${Date.now()}.md`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, report.markdown, "utf-8");

      console.log(report.markdown);
      console.log(`\nFull report written to ${outPath}`);
      console.log(
        `Result: ${report.summary.passed}/${report.summary.total} scenarios passed (independently verified), ` +
          `${report.summary.totalInvariantViolations} invariant violation(s) across all scenarios.`
      );
      return;
    }

    if (opts.diagnoseLive) {
      const llm = new DeepSeekClient(llmConfig, telemetry);
      console.log(`Running the 7-point live ReAct diagnostic suite against ${llmConfig.model}...\n`);
      console.log(`This makes real API calls and may take several minutes (diagnostic 7 alone can need 15-25 LLM calls).\n`);
      const report = await runLiveDiagnostics(llm, llmConfig.model);

      const outPath = opts.diagnoseOut ?? path.join(cwd, "reports", `live-diagnostics-${Date.now()}.md`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, report.markdown, "utf-8");

      console.log(report.markdown);
      console.log(`\nFull report written to ${outPath}`);
      console.log(`Result: ${report.summary.passed}/${report.summary.total} diagnostics passed.`);
      return;
    }

    if (opts.serve) {
      startApiServer({ port: opts.port, host: opts.host });
      return;
    }

    const maxIterations = process.env.MAX_ITERATIONS ? parseInt(process.env.MAX_ITERATIONS, 10) : undefined;
    const orchestratorOpts: OrchestratorOptions = { cwd, maxIterations };
    if (opts.plan === true) orchestratorOpts.planMode = "always";
    if (opts.plan === false) orchestratorOpts.planMode = "never";
    if (opts.leanToken) orchestratorOpts.leanToken = true;
    if (opts.isolatedWorkspace) orchestratorOpts.isolatedWorkspace = true;

    const llm = new DeepSeekClient(llmConfig, telemetry);
    const orchestrator = new ReActOrchestrator(llm, telemetry, orchestratorOpts);

    if (opts.task) {
      await orchestrator.run(opts.task);
      return;
    }

    if (opts.chat) {
      await chatLoop(orchestrator);
      return;
    }

    program.help();
  });

async function chatLoop(orchestrator: ReActOrchestrator): Promise<void> {
  const rl = readline.createInterface({ input, output });
  console.log("devnull chat mode. Type 'quit', 'exit', or 'bye' to leave.");

  while (true) {
    const line = await rl.question("\n> ");
    const trimmed = line.trim();
    if (/^(quit|exit|bye)$/i.test(trimmed)) break;
    if (!trimmed) continue;

    await orchestrator.run(trimmed);
  }
  rl.close();
}

program.parseAsync(process.argv);

