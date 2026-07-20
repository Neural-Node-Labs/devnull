import { Router, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ReActOrchestrator, OrchestratorOptions } from "../core/orchestrator.js";
import { DeepSeekClient } from "../llm/deepseekClient.js";
import { FileTelemetry } from "../telemetry/logger.js";
import { loadLlmConfig } from "../config/loadConfig.js";
import { SkillRegistry } from "../core/skillRegistry.js";
import { authMiddleware, verifyLogin, generateToken, revokeToken, setUserStore, getUserStore, hashPassword, StoredUser } from "./auth.js";
import { registerProjectRoutes } from "./projectRoutes.js";
import { registerPlanRoutes } from "./planRoutes.js";
import { listProjects, getProject } from "./projectStore.js";
import { hasStoredApiKey, setStoredApiKey, clearStoredApiKey, applyStoredApiKey } from "./llmKeyStore.js";
import { readTaskHistory } from "../core/taskHistory.js";
import type {
  ApiResponse,
  ChatRequest,
  ChatResponse,
  PlanRequest,
  PlanResponse,
  ExecuteRequest,
  ExecuteResponse,
  CreateUserRequest,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  TelemetryQuery,
  TelemetryResponse,
  SkillListEntry,
  UpdateUserRequest,
  User,
} from "./types.js";

const pkg = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8")
);

export function createRouter(): Router {
  const router = Router();
  registerProjectRoutes(router);
  registerPlanRoutes(router);

  /**
   * Resolves which directory a task should run against: the explicitly requested project, else
   * the currently active project, else the server's own cwd as a legacy fallback for anyone
   * running devnull without ever having added a project. Previously this was just hardcoded to
   * process.cwd() everywhere, silently ignoring whatever the user had picked in the Projects UI.
   */
  function resolveProjectCwd(projectId?: string): { cwd: string; error?: string } {
    if (projectId) {
      const project = getProject(projectId);
      if (!project) return { cwd: process.cwd(), error: `Project not found: ${projectId}` };
      return { cwd: project.path };
    }
    const active = listProjects().find((p) => p.active);
    if (active) return { cwd: active.path };
    return { cwd: process.cwd() };
  }

  // ─── Login (no auth required) ──────────────────────────────────────────
  router.post("/login", (req: Request, res: Response) => {
    const { username, password } = req.body as LoginRequest;

    if (!username || typeof username !== "string" || username.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'username' field" };
      res.status(400).json(body);
      return;
    }

    if (!password || typeof password !== "string" || password.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'password' field" };
      res.status(400).json(body);
      return;
    }

    const verifiedUser = verifyLogin(username.trim(), password);
    if (!verifiedUser) {
      const body: ApiResponse = { success: false, error: "Invalid username or password" };
      res.status(401).json(body);
      return;
    }

    const token = generateToken(verifiedUser.username, verifiedUser.role);
    const data: LoginResponse = { token, username: verifiedUser.username, role: verifiedUser.role };
    const body: ApiResponse<LoginResponse> = { success: true, data };
    res.json(body);
  });

  // ─── Logout (no auth required — we read the token from the header) ──────
  router.post("/logout", (req: Request, res: Response) => {
    const header = req.headers.authorization;
    if (!header) {
      const body: ApiResponse = { success: true, data: { message: "No token to revoke" } };
      res.json(body);
      return;
    }

    const parts = header.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      const revoked = revokeToken(parts[1]);
      const body: ApiResponse = {
        success: true,
        data: { message: revoked ? "Token revoked" : "Token not found or already revoked" },
      };
      res.json(body);
      return;
    }

    const body: ApiResponse = { success: true, data: { message: "No valid token to revoke" } };
    res.json(body);
  });

  // ─── Health (no auth required — used by Docker healthcheck) ────────────
  router.get("/health", (_req: Request, res: Response) => {
    const data: HealthResponse = {
      status: "ok",
      version: pkg.version ?? "0.1.0",
      uptime: process.uptime(),
    };
    const body: ApiResponse<HealthResponse> = { success: true, data };
    res.json(body);
  });

  // All other routes require auth
  router.use(authMiddleware);

  // ─── Chat / Task Execution ─────────────────────────────────────────────
  router.post("/chat", async (req: Request, res: Response) => {
    const { task, planMode, fullContextToken, projectId, maxIterations, isolatedWorkspace, continueOnLimit, phasePlanning } = req.body as ChatRequest;

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'task' field" };
      res.status(400).json(body);
      return;
    }

    const { cwd, error: projectError } = resolveProjectCwd(projectId);
    if (projectError) {
      res.status(404).json({ success: false, error: projectError } as ApiResponse);
      return;
    }
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();
    applyStoredApiKey(llmConfig);
    const llm = new DeepSeekClient(llmConfig, telemetry);

    // In API context, disable interactive prompts (no TTY available). Plan mode auto-approves
    // and the plan is returned in the response. Iteration-limit hits stop and report rather
    // than auto-continuing forever (the CLI's default) — an API caller has no way to answer an
    // interactive "continue?" prompt, so silently looping is the wrong default here.
    // When continueOnLimit is true (UI's "Continue" button), the orchestrator auto-continues
    // past the iteration limit instead of stopping.
    const opts: OrchestratorOptions = {
      cwd,
      interactive: false,
      onIterationLimitReached: async () => false,
    };
    if (planMode) opts.planMode = planMode;
    if (fullContextToken) opts.fullContextToken = true;
    if (maxIterations) opts.maxIterations = maxIterations;
    if (isolatedWorkspace) opts.isolatedWorkspace = true;
    if (continueOnLimit) opts.continueOnLimit = true;
    if (phasePlanning) opts.phasePlanning = true;

    const orchestrator = new ReActOrchestrator(llm, telemetry, opts);

    try {
      // If plan mode is active, generate the plan first and return it in the response
      // so the UI can display it. The UI should use /chat/plan + /chat/execute for
      // the two-phase approval flow, but /chat also supports it for backward compatibility.
      const skills = orchestrator.selectSkills(task.trim());
      const shouldPlan =
        planMode === "always" || (planMode !== "never" && skills.length >= 2);

      let plan: string | undefined;
      let sessionId: string | undefined;

      if (shouldPlan) {
        plan = await orchestrator.generatePlan(task.trim());
        sessionId = crypto.randomUUID();
        planSessions.set(sessionId, {
          task: task.trim(),
          plan,
          planMode: planMode ?? "always",
          fullContextToken: fullContextToken ?? false,
          projectId,
          maxIterations,
          isolatedWorkspace: isolatedWorkspace ?? false,
          continueOnLimit: continueOnLimit ?? false,
          phasePlanning: phasePlanning ?? false,
          createdAt: Date.now(),
        });
      }

      const result = await orchestrator.run(task.trim());
      const outcome = orchestrator.getLastOutcome();
      const data: ChatResponse = {
        result,
        iterations: 0,
        usage: orchestrator.getCumulativeUsage(),
        healthScore: orchestrator.getHealthScore(),
      };
      if (plan) data.plan = plan;
      if (sessionId) data.sessionId = sessionId;
      if (outcome !== "completed") {
        data.limitation =
          outcome === "iteration_limit"
            ? "The task did not finish within the iteration limit."
            : "The plan was not approved, so no changes were made.";
      }
      const body: ApiResponse<ChatResponse> = { success: true, data };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await telemetry.logError(err, "api/chat");
      const body: ApiResponse = { success: false, error: message };
      res.status(500).json(body);
    }
  });

  // ─── Plan Session Store ────────────────────────────────────────────────
  // In-memory store for plan sessions. Each session holds the task, plan text,
  // and orchestrator options needed to execute the plan after user approval.
  interface PlanSession {
    task: string;
    plan: string;
    planMode: "auto" | "always" | "never";
    fullContextToken: boolean;
    projectId?: string;
    maxIterations?: number;
    isolatedWorkspace: boolean;
    continueOnLimit?: boolean;
    createdAt: number;
  }
  const planSessions = new Map<string, PlanSession>();

  // ─── Plan Generation (no execution) ────────────────────────────────────
  router.post("/chat/plan", async (req: Request, res: Response) => {
    const { task, planMode, fullContextToken, projectId, maxIterations, isolatedWorkspace, continueOnLimit, phasePlanning } = req.body as PlanRequest;

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'task' field" };
      res.status(400).json(body);
      return;
    }

    const { cwd, error: projectError } = resolveProjectCwd(projectId);
    if (projectError) {
      res.status(404).json({ success: false, error: projectError } as ApiResponse);
      return;
    }
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();
    applyStoredApiKey(llmConfig);
    const llm = new DeepSeekClient(llmConfig, telemetry);

    const opts: OrchestratorOptions = { cwd, planMode: planMode ?? "always" };
    if (fullContextToken) opts.fullContextToken = true;
    if (maxIterations) opts.maxIterations = maxIterations;
    if (isolatedWorkspace) opts.isolatedWorkspace = true;
    if (phasePlanning) opts.phasePlanning = true;
    const orchestrator = new ReActOrchestrator(llm, telemetry, opts);

    try {
      const plan = await orchestrator.generatePlan(task.trim());
      const sessionId = crypto.randomUUID();
      planSessions.set(sessionId, {
        task: task.trim(),
        plan,
        planMode: planMode ?? "always",
        fullContextToken: fullContextToken ?? false,
        projectId,
        maxIterations,
        isolatedWorkspace: isolatedWorkspace ?? false,
        continueOnLimit: continueOnLimit ?? false,
        phasePlanning: phasePlanning ?? false,
        createdAt: Date.now(),
      });

      const data: PlanResponse = { sessionId, plan, task: task.trim(), planMode: planMode ?? "always" };
      const body: ApiResponse<PlanResponse> = { success: true, data };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await telemetry.logError(err, "api/chat/plan");
      const body: ApiResponse = { success: false, error: message };
      res.status(500).json(body);
    }
  });

  // ─── Execute an approved plan ──────────────────────────────────────────
  router.post("/chat/execute", async (req: Request, res: Response) => {
    const { sessionId } = req.body as ExecuteRequest;

    if (!sessionId || typeof sessionId !== "string" || sessionId.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'sessionId' field" };
      res.status(400).json(body);
      return;
    }

    const session = planSessions.get(sessionId);
    if (!session) {
      const body: ApiResponse = { success: false, error: "Invalid or expired sessionId" };
      res.status(404).json(body);
      return;
    }

    // Clean up the session so it can't be executed twice
    planSessions.delete(sessionId);

    const { cwd, error: projectError } = resolveProjectCwd(session.projectId);
    if (projectError) {
      res.status(404).json({ success: false, error: projectError } as ApiResponse);
      return;
    }
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();
    applyStoredApiKey(llmConfig);
    const llm = new DeepSeekClient(llmConfig, telemetry);

    const opts: OrchestratorOptions = {
      cwd,
      planMode: "never", // Plan already done
      interactive: false,
      onIterationLimitReached: async () => false,
    };
    if (session.fullContextToken) opts.fullContextToken = true;
    if (session.maxIterations) opts.maxIterations = session.maxIterations;
    if (session.isolatedWorkspace) opts.isolatedWorkspace = true;
    if (session.continueOnLimit) opts.continueOnLimit = true;
    if (session.phasePlanning) opts.phasePlanning = true;
    const orchestrator = new ReActOrchestrator(llm, telemetry, opts);

    try {
      const result = await orchestrator.run(session.task);
      const outcome = orchestrator.getLastOutcome();
      const data: ExecuteResponse = { result, iterations: 0 };
      if (outcome !== "completed") {
        data.limitation =
          outcome === "iteration_limit"
            ? "The task did not finish within the iteration limit."
            : "The plan was not approved, so no changes were made.";
      }
      const body: ApiResponse<ExecuteResponse> = { success: true, data };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await telemetry.logError(err, "api/chat/execute");
      const body: ApiResponse = { success: false, error: message };
      res.status(500).json(body);
    }
  });

  // ─── Telemetry ─────────────────────────────────────────────────────────
  router.get("/telemetry", (req: Request, res: Response) => {
    const query = req.query as unknown as TelemetryQuery;
    const logFile = query.log ?? "thinking";
    const limit = query.limit ?? 50;

    const allowed = ["thinking", "llm", "sys"];
    if (!allowed.includes(logFile)) {
      const body: ApiResponse = {
        success: false,
        error: `Invalid log file '${logFile}'. Allowed: ${allowed.join(", ")}`,
      };
      res.status(400).json(body);
      return;
    }

    const logPath = path.join(process.cwd(), ".log", `${logFile}.log`);
    if (!fs.existsSync(logPath)) {
      const body: ApiResponse<TelemetryResponse> = {
        success: true,
        data: { logFile, entries: [] },
      };
      res.json(body);
      return;
    }

    const raw = fs.readFileSync(logPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const entries = lines
      .slice(-limit)
      .map((line) => {
        // Each line is: ISO timestamp + JSON
        const spaceIdx = line.indexOf(" ");
        if (spaceIdx === -1) return { raw: line };
        const timestamp = line.slice(0, spaceIdx);
        const json = line.slice(spaceIdx + 1);
        try {
          return { timestamp, data: JSON.parse(json) };
        } catch {
          return { timestamp, raw: json };
        }
      });

    const data: TelemetryResponse = { logFile, entries };
    const body: ApiResponse<TelemetryResponse> = { success: true, data };
    res.json(body);
  });

  // ─── Skills ────────────────────────────────────────────────────────────
  router.get("/skills", (_req: Request, res: Response) => {
    const registry = new SkillRegistry();
    const headers = registry.loadHeaders();
    const skills: SkillListEntry[] = headers.map((h) => ({
      name: h.name,
      role: h.role,
      description: h.description,
      triggers: h.triggers,
      composes_with: h.composes_with,
    }));
    const body: ApiResponse<SkillListEntry[]> = { success: true, data: skills };
    res.json(body);
  });

  // ─── Task History (read-only; the agent queries this itself via task_history_tool —
  // this endpoint is purely so the UI can also show it, e.g. a "recent tasks" list) ───────
  router.get("/task-history", (req: Request, res: Response) => {
    const { cwd } = resolveProjectCwd(req.query.projectId as string | undefined);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const tasks = readTaskHistory(cwd, limit);
    const body: ApiResponse = { success: true, data: { tasks } };
    res.json(body);
  });

  // ─── Task History Logs — get telemetry logs for a specific task ───────────────────────
  router.get("/task-history/:taskId/logs", async (req: Request, res: Response) => {
    const taskId = String(req.params.taskId);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    // Try to get logs from PostgreSQL if available
    try {
      const { PostgresTelemetry } = await import("../telemetry/postgresTelemetry.js");
      const pgTelemetry = new PostgresTelemetry();
      const logs = await pgTelemetry.getLogsForTask(taskId, limit);
      const body: ApiResponse = { success: true, data: { taskId, logs } };
      res.json(body);
    } catch {
      // Fallback: return empty — file-based telemetry doesn't have task-level indexing
      const body: ApiResponse = { success: true, data: { taskId, logs: [], note: "PostgreSQL telemetry not available. Enable DATABASE_URL for task-level log queries." } };
      res.json(body);
    }
  });

  // ─── LLM API Key ────────────────────────────────────────────────────────
  // Never returns the actual key — only whether one is set — so a GET can't leak it back out
  // over the wire to anyone who can read the response.
  router.get("/settings/llm-key", (_req: Request, res: Response) => {
    const body: ApiResponse = { success: true, data: { hasKey: hasStoredApiKey() } };
    res.json(body);
  });

  router.put("/settings/llm-key", (req: Request, res: Response) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      res.status(400).json({ success: false, error: "'apiKey' is required" } as ApiResponse);
      return;
    }
    setStoredApiKey(apiKey.trim());
    res.json({ success: true, data: { hasKey: true } } as ApiResponse);
  });

  router.delete("/settings/llm-key", (_req: Request, res: Response) => {
    clearStoredApiKey();
    res.json({ success: true, data: { hasKey: false } } as ApiResponse);
  });

  // ─── User Management ───────────────────────────────────────────────────
  // Persistent user store with password hashing (in-memory for now, but structured for DB migration)
  const storedUsers: StoredUser[] = [];
  let nextUserId = 1;

  // Initialize the auth module's reference to our user store
  setUserStore(storedUsers);

  // ─── Register (no auth required — only works when no users exist) ──────
  router.post("/register", (req: Request, res: Response) => {
    const { username, password } = req.body as CreateUserRequest;

    // Validate inputs first (before checking user count, so validation errors return 400 not 403)
    if (!username || typeof username !== "string" || username.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'username' field" };
      res.status(400).json(body);
      return;
    }

    if (!password || typeof password !== "string" || password.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'password' field" };
      res.status(400).json(body);
      return;
    }

    if (password.length < 4) {
      const body: ApiResponse = { success: false, error: "Password must be at least 4 characters" };
      res.status(400).json(body);
      return;
    }

    // Only allow registration when no users exist
    if (storedUsers.length > 0) {
      const body: ApiResponse = { success: false, error: "Registration is closed. Users can only be added by an admin." };
      res.status(403).json(body);
      return;
    }

    // First user becomes admin
    const newUser: StoredUser = {
      id: String(nextUserId++),
      username: username.trim(),
      passwordHash: hashPassword(password),
      role: "admin",
      createdAt: new Date().toISOString(),
    };

    storedUsers.push(newUser);

    // Auto-login after registration
    const token = generateToken(newUser.username, newUser.role);
    const data: LoginResponse = { token, username: newUser.username, role: newUser.role };
    const body: ApiResponse<LoginResponse> = { success: true, data };
    res.status(201).json(body);
  });

  // ─── User count (no auth required — used by UI to check if registration is needed) ──
  router.get("/users/count", (_req: Request, res: Response) => {
    const body: ApiResponse<{ count: number }> = { success: true, data: { count: storedUsers.length } };
    res.json(body);
  });

  // List all users
  router.get("/users", (_req: Request, res: Response) => {
    // Return users without password hashes
    const safeUsers: User[] = storedUsers.map(({ id, username, role, createdAt }) => ({
      id,
      username,
      role,
      createdAt,
    }));
    const body: ApiResponse<User[]> = { success: true, data: safeUsers };
    res.json(body);
  });

  // Create a new user (admin only — protected by authMiddleware)
  router.post("/users", (req: Request, res: Response) => {
    const { username, password, role } = req.body as CreateUserRequest;

    if (!username || typeof username !== "string" || username.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'username' field" };
      res.status(400).json(body);
      return;
    }

    if (!password || typeof password !== "string" || password.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'password' field" };
      res.status(400).json(body);
      return;
    }

    // Check for duplicate username
    if (storedUsers.some((u) => u.username === username.trim())) {
      const body: ApiResponse = { success: false, error: "Username already exists" };
      res.status(409).json(body);
      return;
    }

    const newUser: StoredUser = {
      id: String(nextUserId++),
      username: username.trim(),
      passwordHash: hashPassword(password),
      role: role === "admin" ? "admin" : "user",
      createdAt: new Date().toISOString(),
    };

    storedUsers.push(newUser);

    const safeUser: User = {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };
    const body: ApiResponse<User> = { success: true, data: safeUser };
    res.status(201).json(body);
  });

  // Update a user
  router.put("/users/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as UpdateUserRequest;
    const user = storedUsers.find((u) => u.id === id);

    if (!user) {
      const body: ApiResponse = { success: false, error: "User not found" };
      res.status(404).json(body);
      return;
    }

    if (updates.username !== undefined) {
      user.username = updates.username.trim();
    }
    if (updates.role !== undefined) {
      user.role = updates.role === "admin" ? "admin" : "user";
    }

    const body: ApiResponse<User> = {
      success: true,
      data: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt },
    };
    res.json(body);
  });

  // Delete a user
  router.delete("/users/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const index = storedUsers.findIndex((u) => u.id === id);

    if (index === -1) {
      const body: ApiResponse = { success: false, error: "User not found" };
      res.status(404).json(body);
      return;
    }

    // Prevent deleting the last admin
    if (storedUsers[index].role === "admin" && storedUsers.filter((u) => u.role === "admin").length <= 1) {
      const body: ApiResponse = { success: false, error: "Cannot delete the last admin user" };
      res.status(403).json(body);
      return;
    }

    const deleted = storedUsers.splice(index, 1)[0];
    const body: ApiResponse<User> = {
      success: true,
      data: { id: deleted.id, username: deleted.username, role: deleted.role, createdAt: deleted.createdAt },
    };
    res.json(body);
  });

  return router;
}

