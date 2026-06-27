/**
 * Campaign click-tracking link helpers — the single source of truth for the
 * format of the signed `/api/campaigns/click/:recipientId` redirect, shared by
 * the mint side (CampaignService.wrapBody rewrites outbound links before send)
 * and the verify side (the public click route). Keeping both ends here means
 * the HMAC payload can't drift between sign and verify.
 *
 * The signature defends the redirect endpoint against being an open redirect:
 * we only 302 to a target we ourselves emitted for that exact recipient. The
 * link carries an opaque recipient id + the target + an HMAC over both — never
 * the recipient's email.
 */
import { hmacHex } from "../auth/signing.js";

/** Stable HMAC payload: bind the signature to BOTH the recipient and the exact
 *  target, so a signature minted for one link can't be replayed onto another. */
function clickPayload(recipientId: string, target: string): string {
  return `${recipientId}\n${target}`;
}

/** Only absolute http(s) URLs are tracked + redirectable. Anything else
 *  (mailto:, tel:, #anchors, javascript:/data:) is left untouched on the mint
 *  side and rejected on the verify side. */
export function isTrackableTarget(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Sign a (recipientId, target) pair. Lowercase hex HMAC-SHA256 under the
 *  shared auth secret — same primitive as unsubscribe / 2FA-approve links. */
export async function signClickTarget(recipientId: string, target: string): Promise<string> {
  return hmacHex(clickPayload(recipientId, target));
}

/** Constant-time-ish verify (length check + full-string compare on hex). The
 *  signature is not a secret-bearing token, so a plain compare is acceptable,
 *  but we still require an exact match of the freshly-recomputed HMAC. */
export async function verifyClickTarget(
  recipientId: string,
  target: string,
  signature: string,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await signClickTarget(recipientId, target);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Build the signed click-redirect URL for one outbound target. */
export async function buildClickUrl(
  base: string,
  recipientId: string,
  target: string,
): Promise<string> {
  const sig = await signClickTarget(recipientId, target);
  return `${base}/api/campaigns/click/${recipientId}?u=${encodeURIComponent(target)}&s=${sig}`;
}

/**
 * Rewrite every trackable `<a href="…">` in `html` to route through the signed
 * click redirect. Pure + async (the HMAC is async); leaves non-http(s) hrefs,
 * and any href already pointing at our own click/open/unsubscribe endpoints,
 * untouched so we never double-wrap or wrap the footer's own links.
 */
export async function rewriteLinksForClickTracking(
  html: string,
  recipientId: string,
  base: string,
): Promise<string> {
  // Match href="..." or href='...' — capture the quote so we can preserve it.
  const HREF = /href=(["'])(.*?)\1/gi;
  const matches = [...html.matchAll(HREF)];
  if (matches.length === 0) return html;

  // Resolve all replacements first (async HMAC per link), then splice once.
  const replacements = await Promise.all(
    matches.map(async (m) => {
      const target = m[2];
      if (!isTrackableTarget(target)) return null;
      // Never wrap our own tracking/consent endpoints (idempotent + keeps the
      // footer unsubscribe/manage links direct even if order ever changes).
      if (/\/api\/campaigns\/(click|open)\b/i.test(target)) return null;
      if (/\/api\/email\/(unsubscribe|preferences)\b/i.test(target)) return null;
      const url = await buildClickUrl(base, recipientId, target);
      return { full: m[0], quote: m[1], url };
    }),
  );

  let out = "";
  let cursor = 0;
  matches.forEach((m, i) => {
    const r = replacements[i];
    const start = m.index ?? 0;
    out += html.slice(cursor, start);
    out += r ? `href=${r.quote}${r.url}${r.quote}` : m[0];
    cursor = start + m[0].length;
  });
  out += html.slice(cursor);
  return out;
}
