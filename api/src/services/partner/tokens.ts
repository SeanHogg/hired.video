/**
 * Partner embed tokens — short-lived, stateless, HMAC-signed tokens that let a
 * partner render a job seeker's profile/resume inside an iframe WITHOUT exposing
 * the partner's system-to-system key to the browser.
 *
 * Flow: the partner's backend calls POST /api/partner/v1/embed-tokens (partner
 * key auth, active connection required) → receives an embedUrl on the canonical
 * /embedded/resume/:id?pt=<token> page → passes it to their frontend → the
 * iframe loads it; GET /api/resumes/embedded/:id verifies the token here (via
 * partnerEmbedViewer) and re-checks the connection is still active.
 *
 * Format: `<base64url(payload)>.<hmacHex>` where payload = {p,u,k,exp}.
 * Reuses the shared HMAC primitive (keyed by JWT_SECRET) so mint/verify can't
 * drift — same pattern as the 2FA one-tap link.
 */
import { hmacHex, getAuthSecret } from "../auth/signing.js";
import {
  PARTNER_EMBED_TOKEN_TTL_SECONDS,
  type PartnerEmbedKind,
} from "../../../../shared/partner.js";

interface EmbedTokenPayload {
  p: string; // partnerId
  u: string; // userId
  k: PartnerEmbedKind; // kind
  exp: number; // unix seconds
}

function b64urlEncode(input: string): string {
  // btoa is available in the Workers runtime.
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

/** Constant-time-ish string compare (lengths already fixed hex). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function mintEmbedToken(
  partnerId: string,
  userId: string,
  kind: PartnerEmbedKind,
  ttlSeconds = PARTNER_EMBED_TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: Date }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: EmbedTokenPayload = { p: partnerId, u: userId, k: kind, exp };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacHex(body);
  return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000) };
}

export class EmbedTokenError extends Error {}

export async function verifyEmbedToken(token: string | null | undefined): Promise<EmbedTokenPayload> {
  if (!getAuthSecret()) throw new EmbedTokenError("Signing secret not configured.");
  if (!token || !token.includes(".")) throw new EmbedTokenError("Malformed embed token.");
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new EmbedTokenError("Malformed embed token.");
  const expected = await hmacHex(body);
  if (!safeEqual(sig, expected)) throw new EmbedTokenError("Invalid embed token signature.");
  let payload: EmbedTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body));
  } catch {
    throw new EmbedTokenError("Corrupt embed token payload.");
  }
  if (!payload.p || !payload.u || !payload.exp) throw new EmbedTokenError("Incomplete embed token.");
  if (payload.exp * 1000 < Date.now()) throw new EmbedTokenError("Embed token has expired.");
  return payload;
}
