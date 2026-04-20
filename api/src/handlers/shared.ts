/**
 * Shared primitives for the pure handler layer.
 *
 * Before this module existed every `routes/*-handlers.ts` redefined the
 * same HandlerResult envelope, ok()/fail() helpers, and inline auth
 * guards. That was the drift surface that produced the 2026-04-20
 * blank-title / NOT_FOUND bugs (seven separate copies means seven chances
 * for field names and error codes to diverge).
 *
 * Anyone writing a new handler should import from here. Do NOT re-define
 * HandlerResult locally; extending it means changing one file, not seven.
 */

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface HandlerResult<T = unknown> {
  status: number;
  body: T;
}

type SuccessEnvelope<T> = { success: true; data: T; timestamp: string };
type ErrorEnvelope = {
  success: false;
  error: { code: string; message: string; details?: unknown };
  timestamp: string;
};

export function ok<T>(data: T, status = 200): HandlerResult<SuccessEnvelope<T>> {
  return {
    status,
    body: { success: true, data, timestamp: new Date().toISOString() },
  };
}

export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): HandlerResult<ErrorEnvelope> {
  return {
    status,
    body: {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Auth guard — collapses the 27 copies of
//   `if (!viewerId) return fail(401, "UNAUTHORIZED", "Authentication required");`
// that used to live at the top of every write handler.
//
// The guard either hands back a `{ userId }` envelope (authed) or the
// ready-to-return 401 HandlerResult (anonymous). We discriminate with the
// `in` operator because this project's tsconfig disables strictNullChecks,
// and `if (!x.ok)` narrowing depends on strict mode. The `in` narrowing
// works everywhere.
//
// Usage at the handler boundary:
//   const auth = requireAuth(viewerId);
//   if ("status" in auth) return auth;              // 401 path
//   // From here on `auth.userId` is a non-null string.
// ---------------------------------------------------------------------------

export type AuthResult =
  | { userId: string }
  | HandlerResult<ErrorEnvelope>;

export function requireAuth(viewerId: string | null | undefined): AuthResult {
  if (!viewerId) {
    return fail(401, "UNAUTHORIZED", "Authentication required");
  }
  return { userId: viewerId };
}
