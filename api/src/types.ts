import type { Context } from "hono";

// ============================================================================
// ENVIRONMENT BINDINGS
// ============================================================================

/**
 * Cloudflare Worker environment bindings and secrets.
 * Secrets are set via `wrangler secret put <KEY>`.
 */
export interface Env {
  // Neon Postgres connection string
  DATABASE_URL: string;
  // HS256 secret for signing JWTs
  JWT_SECRET: string;
  // YouTube OAuth2 credentials
  YOUTUBE_CLIENT_ID: string;
  YOUTUBE_CLIENT_SECRET: string;
  YOUTUBE_REFRESH_TOKEN: string;
  // OpenRouter API key for AI storyboard generation
  OPENROUTER_API_KEY: string;
  // R2 bucket for temporary video storage
  VIDEO_BUCKET: R2Bucket;
}

// ============================================================================
// HONO CONTEXT
// ============================================================================

/**
 * Variables stored in Hono context during a request lifecycle.
 */
export interface Variables {
  user: JwtPayload;
}

/**
 * Full Hono environment type used throughout the app.
 */
export type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};

/**
 * Typed Hono context alias for convenience.
 */
export type HonoContext = Context<AppEnv>;

// ============================================================================
// JWT
// ============================================================================

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  name: string;
  role: string;
  iat?: number;
  exp?: number;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function success<T>(data: T, message?: string) {
  return {
    success: true as const,
    data,
    ...(message ? { message } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function error(code: string, message: string, details?: Record<string, unknown>) {
  return {
    success: false as const,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    timestamp: new Date().toISOString(),
  };
}
