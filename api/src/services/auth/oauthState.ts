/**
 * OAuth handshake state — the HMAC-signed `state` parameter carried from
 * /api/auth/oauth/:provider to its callback. It binds the post-login
 * redirect, the connect-flow user, inbound attribution and signup intent so
 * none can be tampered with in between. 10-minute lifetime.
 */

import { isPublicSignupRole } from "../../../../shared/user-roles.js";
import { hexToBytes, hmacSha256Hex, hmacSha256Verify, randomHex } from "../../utils/crypto.js";
import { getJwtSecret } from "../../utils/jwt.js";

const STATE_TTL_MS = 10 * 60 * 1000;

/** Inbound attribution carried through the OAuth handshake so "Continue with
 *  Google" signups credit the affiliate + persist campaign UTMs the same way
 *  password signups do (gaps #1683). */
export interface OAuthAttribution {
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  landingReferrer?: string;
}

/** Signup intent forwarded by the affiliate / creator landing pages so a
 *  "Continue with Google" signup lands on the right role + auto-creates the
 *  affiliate profile — the OAuth analogue of the password register's
 *  `role` + `enableAffiliate` fields. Only consulted on NEW-user creation;
 *  an existing user logging in via OAuth keeps their stored role. */
export interface SignupIntent {
  role?: string;
  enableAffiliate?: boolean;
}

export interface OAuthStateData {
  redirect: string;
  linkUserId?: string;
  attr?: OAuthAttribution;
  intent?: SignupIntent;
}

/** Strip empties + cap lengths so a tampered/oversized start URL can't bloat
 *  the signed state. Mirrors the 64/128-char ceilings used on the user row. */
function sanitizeAttribution(a: OAuthAttribution | undefined): OAuthAttribution | undefined {
  if (!a) return undefined;
  const clip = (v: string | undefined, n: number) => (v ? String(v).slice(0, n) : undefined);
  const out: OAuthAttribution = {
    ref: clip(a.ref, 64),
    utmSource: clip(a.utmSource, 128),
    utmMedium: clip(a.utmMedium, 128),
    utmCampaign: clip(a.utmCampaign, 128),
    utmTerm: clip(a.utmTerm, 128),
    utmContent: clip(a.utmContent, 128),
    landingReferrer: clip(a.landingReferrer, 512),
  };
  const hasAny = Object.values(out).some((v) => v);
  return hasAny ? out : undefined;
}

/** Keep only a whitelisted role; drop anything else (incl. `employee`/`admin`)
 *  so a tampered start URL can't self-assign a privileged role. */
function sanitizeIntent(i: SignupIntent | undefined): SignupIntent | undefined {
  if (!i) return undefined;
  const role = isPublicSignupRole(i.role) ? i.role : undefined;
  const enableAffiliate = i.enableAffiliate === true ? true : undefined;
  if (!role && !enableAffiliate) return undefined;
  return { ...(role ? { role } : {}), ...(enableAffiliate ? { enableAffiliate } : {}) };
}

export async function createOAuthState(redirect: string, linkUserId?: string, attribution?: OAuthAttribution, intent?: SignupIntent): Promise<string> {
  const secret = getJwtSecret();
  const nonce = randomHex(16);
  const attr = sanitizeAttribution(attribution);
  const intentClean = sanitizeIntent(intent);
  const payload = JSON.stringify({ nonce, redirect: redirect || "/dashboard", ts: Date.now(), ...(linkUserId ? { linkUserId } : {}), ...(attr ? { attr } : {}), ...(intentClean ? { intent: intentClean } : {}) });
  const sigHex = await hmacSha256Hex(secret, payload);
  return btoa(payload + "|" + sigHex);
}

export async function verifyOAuthState(state: string): Promise<OAuthStateData | null> {
  try {
    const secret = getJwtSecret();
    const decoded = atob(state);
    const sepIdx = decoded.lastIndexOf("|");
    const payload = decoded.slice(0, sepIdx);
    const sigHex = decoded.slice(sepIdx + 1);
    const valid = await hmacSha256Verify(secret, payload, hexToBytes(sigHex));
    if (!valid) return null;
    const { redirect, ts, linkUserId, attr, intent } = JSON.parse(payload);
    if (Date.now() - ts > STATE_TTL_MS) return null;
    return { redirect: redirect || "/dashboard", linkUserId, attr, intent: sanitizeIntent(intent) };
  } catch {
    return null;
  }
}
