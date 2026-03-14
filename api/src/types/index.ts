import type { Context } from "hono";

// ── JWT payload ──────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;          // user id
  email: string;
  roles: string[];
  emailVerified: boolean;
  mustChangePassword: boolean;
  companyId?: string;   // active company context
  iat?: number;
  exp?: number;
}

// ── Hono context variables ───────────────────────────────────────────────────
export type Variables = {
  user: JwtPayload;
};

export type AppContext = Context<{ Variables: Variables }>;

// ── Pagination ───────────────────────────────────────────────────────────────
export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

// ── API response helpers ─────────────────────────────────────────────────────
export function success<T>(data: T, metaOrMessage?: PaginationMeta | string) {
  if (typeof metaOrMessage === "string") {
    return { success: true as const, data, message: metaOrMessage, timestamp: new Date().toISOString() };
  }
  return { data, ...(metaOrMessage ? { meta: metaOrMessage } : {}) };
}

export function apiError(
  code: string,
  message: string,
  details?: unknown,
  status = 400,
) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) }, _status: status };
}

// ── Legacy compatibility alias ───────────────────────────────────────────────
export function error(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    success: false as const,
    error: { code, message, ...(details ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}
