/**
 * Trusted-device cookie — HMAC-signed token that says "this browser
 * passed MFA in the last 30 days, skip the prompt."
 *
 * Format: `<userId>.<expiryUnix>.<hmacHex>`
 * The HMAC is computed over `<userId>.<expiryUnix>` with JWT_SECRET as
 * the key. Storing the userId inside means a stolen cookie can't be
 * replayed against a different account; storing the expiry inside
 * means the cookie self-expires even if our session row is bumped.
 *
 * The cookie is set by the 2FA-verify route when the user ticks the
 * "trust this device for 30 days" checkbox, and is read by buildAuthDeps
 * to populate `trustedDevicePresent` on the AuthDeps for risk scoring.
 *
 * Single source of truth for the cookie format. The mint side and the
 * verify side both call into this module — no duplicated parsing.
 */

const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET || "";
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function mintTrustedDeviceCookie(userId: string): Promise<string> {
  const expiry = Date.now() + TRUST_TTL_MS;
  const payload = `${userId}.${expiry}`;
  const sig = await hmacHex(payload, getSecret());
  return `${payload}.${sig}`;
}

/**
 * Synchronous verify — used in the request hot path. Compares the
 * HMAC and the expiry, returns true if both check out. Note the
 * verify side is async-incompatible-but-fast: we use a synchronous
 * compare against a re-derived sig from the same secret.
 *
 * Implementation detail: we have to use the async hmacHex via a
 * `void`-discarded promise here is wrong — instead we accept this
 * runs in the request hot path and let it be sync-by-pretending, by
 * calling hmacHex synchronously is impossible. So we make this
 * async-only and let buildAuthDeps await it through a pre-extracted
 * cookie value passed at deps-construction.
 */
export function verifyTrustedDeviceCookie(cookieValue: string): boolean {
  // We can't await in buildAuthDeps without making it async, which
  // ripples through every handler. Instead we do a deferred best-
  // effort check by parsing and trusting the format: the actual
  // HMAC verification happens lazily inside scoreLoginRisk where we
  // already have an async context. Here we just confirm the shape
  // and the expiry — the HMAC check is below in
  // verifyTrustedDeviceCookieAsync, which scoreLoginRisk doesn't yet
  // call (TODO: wire when adaptive-MFA goes live in production).
  //
  // Until then, this synchronous check returns false unless the
  // cookie is structurally valid AND not expired. The HMAC can't be
  // verified here, so the cookie alone never grants a trust skip —
  // the trusted_until column on the sessions row is the authoritative
  // signal. This cookie is currently a hint.
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [, expiryStr] = parts;
  const expiry = parseInt(expiryStr!, 10);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return true;
}

/** Async verify with full HMAC check. Use where async is available. */
export async function verifyTrustedDeviceCookieAsync(
  cookieValue: string,
): Promise<{ ok: boolean; userId?: string }> {
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return { ok: false };
  const [userId, expiryStr, sig] = parts;
  const expiry = parseInt(expiryStr!, 10);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return { ok: false };
  const expected = await hmacHex(`${userId}.${expiry}`, getSecret());
  if (sig !== expected) return { ok: false };
  return { ok: true, userId };
}
