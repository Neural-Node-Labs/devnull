import { Router, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ReActOrchestrator, OrchestratorOptions } from "../core/orchestrator.js";
import { DeepSeekClient } from "../llm/deepseekClient.js";
import { FileTelemetry } from "../telemetry/logger.js";
import { loadLlmConfig } from "../config/loadConfig.js";
import { SkillRegistry } from "../core/skillRegistry.js";
import { authMiddleware, verifyLogin, generateToken, revokeToken, isAuthEnabled } from "./auth.js";
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

    const token = generateToken(verifiedUser, "admin");
    const data: LoginResponse = { token, username: verifiedUser, role: "admin" };
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

  // All other routes require auth
  router.use(authMiddleware);

  // ─── Health ────────────────────────────────────────────────────────────
  router.get("/health", (_req: Request, res: Response) => {
    const data: HealthResponse = {
      status: "ok",
      version: pkg.version ?? "0.1.0",
      uptime: process.uptime(),
    };
    const body: ApiResponse<HealthResponse> = { success: true, data };
    res.json(body);
  });

  // ─── Chat / Task Execution ─────────────────────────────────────────────
  router.post("/chat", async (req: Request, res: Response) => {
    const { task, planMode, leanToken } = req.body as ChatRequest;

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'task' field" };
      res.status(400).json(body);
      return;
    }

    const cwd = process.cwd();
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();
    const llm = new DeepSeekClient(llmConfig, telemetry);

    // In API context, disable interactive prompts (no TTY available).
    // Plan mode will auto-approve and the plan will be returned in the response.
    const opts: OrchestratorOptions = { cwd, interactive: false };
    if (planMode) opts.planMode = planMode;
    if (leanToken) opts.leanToken = true;

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
          leanToken: leanToken ?? false,
          createdAt: Date.now(),
        });
      }

      const result = await orchestrator.run(task.trim());
      const data: ChatResponse = { result, iterations: 0 };
      if (plan) data.plan = plan;
      if (sessionId) data.sessionId = sessionId;
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
    leanToken: boolean;
    createdAt: number;
  }
  const planSessions = new Map<string, PlanSession>();

  // ─── Plan Generation (no execution) ────────────────────────────────────
  router.post("/chat/plan", async (req: Request, res: Response) => {
    const { task, planMode, leanToken } = req.body as PlanRequest;

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      const body: ApiResponse = { success: false, error: "Missing or empty 'task' field" };
      res.status(400).json(body);
      return;
    }

    const cwd = process.cwd();
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();
    const llm = new DeepSeekClient(llmConfig, telemetry);

    const opts: OrchestratorOptions = { cwd, planMode: planMode ?? "always" };
    if (leanToken) opts.leanToken = true;
    const orchestrator = new ReActOrchestrator(llm, telemetry, opts);

    try {
      const plan = await orchestrator.generatePlan(task.trim());
      const sessionId = crypto.randomUUID();
      planSessions.set(sessionId, {
        task: task.trim(),
        plan,
        planMode: planMode ?? "always",
        leanToken: leanToken ?? false,
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

    const cwd = process.cwd();
    const telemetry = new FileTelemetry(cwd);
    const llmConfig = loadLlmConfig();
    const llm = new DeepSeekClient(llmConfig, telemetry);

    const opts: OrchestratorOptions = { cwd, planMode: "never" }; // Plan already done
    if (session.leanToken) opts.leanToken = true;
    const orchestrator = new ReActOrchestrator(llm, telemetry, opts);

    try {
      const result = await orchestrator.run(session.task);
      const data: ExecuteResponse = { result, iterations: 0 };
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

  // ─── User Management ───────────────────────────────────────────────────
  // In-memory user store (for demo/testing purposes)
  const users: User[] = [
    {
      id: "1",
      username: "admin",
      role: "admin",
      createdAt: new Date().toISOString(),
    },
  ];
  let nextUserId = 2;

  // List all users
  router.get("/users", (_req: Request, res: Response) => {
    // Return users without passwords
    const safeUsers = users.map(({ id, username, role, createdAt }) => ({
      id,
      username,
      role,
      createdAt,
    }));
    const body: ApiResponse<User[]> = { success: true, data: safeUsers };
    res.json(body);
  });

  // Create a new user
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
    if (users.some((u) => u.username === username.trim())) {
      const body: ApiResponse = { success: false, error: "Username already exists" };
      res.status(409).json(body);
      return;
    }

    const newUser: User = {
      id: String(nextUserId++),
      username: username.trim(),
      role: role === "admin" ? "admin" : "user",
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);

    const body: ApiResponse<User> = { success: true, data: newUser };
    res.status(201).json(body);
  });

  // Update a user
  router.put("/users/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as UpdateUserRequest;
    const user = users.find((u) => u.id === id);

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
    const index = users.findIndex((u) => u.id === id);

    if (index === -1) {
      const body: ApiResponse = { success: false, error: "User not found" };
      res.status(404).json(body);
      return;
    }

    // Prevent deleting the last admin
    if (users[index].role === "admin" && users.filter((u) => u.role === "admin").length <= 1) {
      const body: ApiResponse = { success: false, error: "Cannot delete the last admin user" };
      res.status(403).json(body);
      return;
    }

    const deleted = users.splice(index, 1)[0];
    const body: ApiResponse<User> = {
      success: true,
      data: { id: deleted.id, username: deleted.username, role: deleted.role, createdAt: deleted.createdAt },
    };
    res.json(body);
  });

  return router;
}

