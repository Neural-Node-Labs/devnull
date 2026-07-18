const API_BASE = "/api/v1";

// ─── Token Management ───────────────────────────────────────────────────────

const TOKEN_KEY = "devnull_auth_token";
const USER_KEY = "devnull_auth_user";

export interface AuthUser {
  username: string;
  role: "admin" | "user";
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Alias for storeAuth — used by api/AuthContext.tsx */
export const setAuth = storeAuth;

/** Get the current user from localStorage. */
export function getCurrentUser(): AuthUser | null {
  return getStoredUser();
}

/** Check if the user is authenticated (has a stored token). */
export function isAuthenticated(): boolean {
  return getStoredToken() !== null;
}

/** Check if the stored user has admin role. */
export function isAdmin(): boolean {
  const user = getStoredUser();
  return user?.role === "admin";
}

// ─── API Response Types ─────────────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface LoginResponse {
  token: string;
  username: string;
  role: "admin" | "user";
}

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export interface User {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

export interface SkillListEntry {
  name: string;
  role: string;
  description: string;
  triggers: string[];
  composes_with: string[];
}

// ─── HTTP Helpers ───────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const json: ApiResponse<T> = await res.json();

  // If we get a 401/403, clear auth state (token expired/invalid)
  if ((res.status === 401 || res.status === 403) && token) {
    clearAuth();
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }

  return json;
}

// ─── API Methods ────────────────────────────────────────────────────────────

export const api = {
  /** Login with username/password. Returns token + user info. */
  async login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
    return request<LoginResponse>("POST", "/login", { username, password });
  },

  /** Check API health. */
  async health(): Promise<ApiResponse<HealthResponse>> {
    return request<HealthResponse>("GET", "/health");
  },

  /** List all users (admin only). */
  async listUsers(): Promise<ApiResponse<User[]>> {
    return request<User[]>("GET", "/users");
  },

  /** Create a new user (admin only). */
  async createUser(username: string, password: string, role?: "admin" | "user"): Promise<ApiResponse<User>> {
    return request<User>("POST", "/users", { username, password, role });
  },

  /** Update a user (admin only). */
  async updateUser(id: string, updates: { username?: string; role?: "admin" | "user" }): Promise<ApiResponse<User>> {
    return request<User>("PUT", `/users/${id}`, updates);
  },

  /** Delete a user (admin only). */
  async deleteUser(id: string): Promise<ApiResponse<User>> {
    return request<User>("DELETE", `/users/${id}`);
  },

  /** Send a chat message. */
  async chat(task: string, planMode?: "auto" | "always" | "never", signal?: AbortSignal): Promise<ApiResponse> {
    return request("POST", "/chat", { task, planMode }, signal);
  },

  /** Generate a plan without executing. */
  async generatePlan(task: string, planMode?: "auto" | "always" | "never"): Promise<ApiResponse> {
    return request("POST", "/chat/plan", { task, planMode });
  },

  /** Execute an approved plan. */
  async executePlan(sessionId: string): Promise<ApiResponse> {
    return request("POST", "/chat/execute", { sessionId });
  },

  /** Get telemetry entries. */
  async getTelemetry(log?: string, limit?: number): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (log) params.set("log", log);
    if (limit) params.set("limit", String(limit));
    return request("GET", `/telemetry?${params.toString()}`);
  },

  /** List available skills. */
  async listSkills(): Promise<ApiResponse> {
    return request("GET", "/skills");
  },

  /** Alias for listSkills — used by DiagnosticsPage. */
  async skills(): Promise<ApiResponse> {
    return this.listSkills();
  },

  /** Alias for getTelemetry — used by DiagnosticsPage. */
  async telemetry(log?: string, limit?: number): Promise<ApiResponse> {
    return this.getTelemetry(log, limit);
  },

  /** Logout — revoke the current token on the server. */
  async logout(): Promise<ApiResponse> {
    return request("POST", "/logout");
  },
};


