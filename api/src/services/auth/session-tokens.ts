/**
 * Session policy constants + refresh-token primitives + device labelling.
 * Split out of sessions.ts (now a re-export facade).
 */

// 3-device cap — when a 4th login arrives, the oldest *active* session
// is revoked with reason 'replaced_by_cap'. Configurable per deployment
// later; lives here so login + magic-link + OAuth all read the same
// number.
export const MAX_ACTIVE_SESSIONS_PER_USER = 3;

// Sliding inactivity window. Sessions whose last_seen_at is older than
// this are revoked at next-touch with reason 'idle_timeout'. The
// absolute expiry (expires_at) is independent and longer.
export const IDLE_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

// Absolute session lifetime when a non-trusted device logs in.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Refresh tokens are opaque base64url secrets; we only ever store their
// SHA-256 hash so a DB leak doesn't hand attackers usable bearers.
export async function hashRefreshToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Best-effort UA → human label. Intentionally loose — we just want
 * "Chrome on macOS" / "Safari on iPhone" for the sessions UI. Wrong-but-
 * close is fine; this is operator-facing not security-critical.
 */
export function deriveDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  let browser = "Browser";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome/") && !ua.includes("edg/")) browser = "Chrome";
  else if (ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os x") || ua.includes("macos")) os = "macOS";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("linux")) os = "Linux";

  return `${browser} on ${os}`;
}
