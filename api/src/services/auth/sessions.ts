/**
 * Sessions service — single source of truth for everything that touches
 * the `sessions` table.
 *
 * Facade — the code lives in cohesive sibling modules:
 *   • session-tokens.ts     — policy constants, refresh-token primitives, device label
 *   • session-cache.ts      — per-session validity isolate cache
 *   • session-lifecycle.ts  — create (3-device cap), list, revoke, trust, version bump
 *   • session-validation.ts — loadSessionForJwt (per-request validate + touch)
 *   • session-rotation.ts   — RFC 6749 §10.4 refresh rotation + reuse detection
 * New code should import from those modules directly.
 */
export {
  MAX_ACTIVE_SESSIONS_PER_USER,
  IDLE_TIMEOUT_MS,
  SESSION_TTL_MS,
  deriveDeviceLabel,
} from "./session-tokens.js";
export {
  type CreateSessionInput,
  type CreatedSession,
  createSession,
  getActiveSessions,
  enforceSessionCap,
  revokeSession,
  revokeSessionFamily,
  revokeAllSessionsForUser,
  trustSession,
  bumpSessionVersion,
} from "./session-lifecycle.js";
export { loadSessionForJwt } from "./session-validation.js";
export { rotateRefreshToken } from "./session-rotation.js";
