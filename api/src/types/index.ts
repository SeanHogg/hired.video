// ── Cloudflare Worker Bindings ───────────────────────────────────────────────
export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  OPENROUTER_API_KEY?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  VIDEO_BUCKET: R2Bucket;
  // YouTube company OAuth
  YOUTUBE_COMPANY_CLIENT_ID?: string;
  YOUTUBE_COMPANY_CLIENT_SECRET?: string;
}

// ── Hono context variables ───────────────────────────────────────────────────
import type { Context } from "hono";

export interface Variables {
  user: JwtPayload;
}

export type AppEnv = { Bindings: Env; Variables: Variables };

export type AppContext = Context<AppEnv>;

// ── JWT payload ──────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  emailVerified: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  iat?: number;
  exp?: number;
}

// ── Pagination ───────────────────────────────────────────────────────────────
export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

// ── API response helpers ─────────────────────────────────────────────────────
export function success<T>(data: T): { data: T };
export function success<T>(data: T, message: string): { data: T; message: string };
export function success<T>(data: T, meta: PaginationMeta): { data: T; meta: PaginationMeta };
export function success<T>(data: T, messageOrMeta?: string | PaginationMeta) {
  if (typeof messageOrMeta === "string") {
    return { data, message: messageOrMeta };
  }
  if (messageOrMeta) {
    return { data, meta: messageOrMeta };
  }
  return { data };
}

export function apiError(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

// Legacy export for common error response shape
export const error = apiError;
