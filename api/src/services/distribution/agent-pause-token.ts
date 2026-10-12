/**
 * HMAC token for the posting-agent digest's one-tap pause link.
 * Format: `userId.exp.hexsig` (7-day TTL). The HMAC body is prefixed
 * `pause:` so this token cannot be swapped for another HMAC-signed
 * artefact. Secret comes from getJwtSecret() — fail closed in production.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getJwtSecret } from "../../utils/jwt.js";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PURPOSE = "pause:";

function signBody(userId: string, expStr: string): string {
  return `${PURPOSE}${userId}.${expStr}`;
}

export function mintAgentPauseToken(userId: string, now = new Date()): string {
  const exp = Math.floor((now.getTime() + TTL_MS) / 1000);
  const expStr = String(exp);
  const sig = createHmac("sha256", getJwtSecret()).update(signBody(userId, expStr)).digest("hex");
  return `${userId}.${expStr}.${sig}`;
}

/** Absolute pause-link URL for digest emails. */
export function buildAgentPauseUrl(origin: string, userId: string, now = new Date()): string {
  const token = mintAgentPauseToken(userId, now);
  return `${origin.replace(/\/$/, "")}/api/distribution/posting-agent/pause-link?token=${encodeURIComponent(token)}`;
}

export function verifyAgentPauseToken(token: string, now = new Date()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  if (!userId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now.getTime()) return null;
  const expected = createHmac("sha256", getJwtSecret()).update(signBody(userId, expStr)).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return userId;
}
