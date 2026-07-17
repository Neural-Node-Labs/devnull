/**
 * API-specific types for the devnull HTTP API.
 */

/** Standard API envelope for all responses. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** POST /api/v1/chat request body. */
export interface ChatRequest {
  task: string;
  /** Optional: force plan mode on/off for this request. */
  planMode?: "auto" | "always" | "never";
}

/** POST /api/v1/chat response data. */
export interface ChatResponse {
  result: string;
  /** Number of iterations the orchestrator ran. */
  iterations: number;
  /** The generated plan, if plan mode was active. The UI can display this for user approval. */
  plan?: string;
  /** Session ID for the plan, if plan mode was active. The UI can use this with /chat/execute. */
  sessionId?: string;
}

/** POST /api/v1/chat/plan request body. */
export interface PlanRequest {
  task: string;
  planMode?: "auto" | "always" | "never";
}

/** POST /api/v1/chat/plan response data. */
export interface PlanResponse {
  sessionId: string;
  plan: string;
  task: string;
  planMode: "auto" | "always" | "never";
}

/** POST /api/v1/chat/execute request body. */
export interface ExecuteRequest {
  sessionId: string;
}

/** POST /api/v1/chat/execute response data. */
export interface ExecuteResponse {
  result: string;
  iterations: number;
}

/** GET /api/v1/health response data. */
export interface HealthResponse {
  status: "ok";
  version: string;
  uptime: number;
}

/** GET /api/v1/telemetry query params. */
export interface TelemetryQuery {
  /** Filter by log file: "thinking", "llm", "sys". Default: "thinking". */
  log?: "thinking" | "llm" | "sys";
  /** Number of most recent entries to return. Default: 50. */
  limit?: number;
}

/** GET /api/v1/telemetry response data. */
export interface TelemetryResponse {
  logFile: string;
  entries: unknown[];
}

/** GET /api/v1/skills response data. */
export interface SkillListEntry {
  name: string;
  role: string;
  description: string;
  triggers: string[];
  composes_with: string[];
}

/** A user in the system. */
export interface User {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

/** POST /api/v1/users request body. */
export interface CreateUserRequest {
  username: string;
  password: string;
  role?: "admin" | "user";
}

/** PUT /api/v1/users/:id request body. */
export interface UpdateUserRequest {
  username?: string;
  role?: "admin" | "user";
}

/** POST /api/v1/login request body. */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /api/v1/login response data. */
export interface LoginResponse {
  token: string;
  username: string;
  role: "admin" | "user";
}
