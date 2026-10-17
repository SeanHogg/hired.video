/**
 * Inbound social webhooks (#2048): each network's documented signature
 * scheme and subscription handshake. Pure WebCrypto, no I/O; secrets are
 * passed in (webhook-secrets.ts reads them from env).
 *
 *   facebook / instagram  X-Hub-Signature-256: sha256=<hex HMAC-SHA256(app secret, raw body)>
 *                         GET hub.mode=subscribe&hub.verify_token=…&hub.challenge=… → echo
 *   tiktok                TikTok-Signature: t=<unix>,s=<hex HMAC-SHA256(client secret, "<t>.<raw body>")>
 *                         (rejected when t is more than 5 minutes off)
 *   x                     X-Twitter-Webhooks-Signature: sha256=<base64 HMAC-SHA256(consumer secret, raw body)>
 *                         GET crc_token=… → { response_token: "sha256=<base64 HMAC(consumer secret, crc_token)>" }
 *   linkedin              X-LI-Signature: <hex HMAC-SHA256(client secret, body)>, optionally
 *                         "hmacsha256="-prefixed (both documented readings are accepted)
 *                         GET challengeCode=… → { challengeCode, challengeResponse: <hex HMAC(client secret, code)> }
 *   youtube (WebSub)      X-Hub-Signature: sha1=<hex HMAC-SHA1(hub.secret, raw body)>
 *                         GET hub.mode=subscribe&hub.challenge=… → echo
 *
 * Every comparison is constant-time.
 */
import type { VideoPublishPlatform } from "../../../../../shared/social-platforms.js";
import {
  bytesToBase64 as toBase64,
  bytesToHex as toHex,
  hmac,
  timingSafeEqual as safeEqual,
} from "../../../utils/crypto.js";

/** The raw request as the verifier needs it. */
export interface SignedRequest {
  header: (name: string) => string | undefined;
  body: string;
}

/** How far a TikTok signature's timestamp may be from now. */
export const TIKTOK_SIGNATURE_TOLERANCE_SEC = 5 * 60;

export async function verifyMetaSignature(req: SignedRequest, appSecret: string): Promise<boolean> {
  const sig = req.header("x-hub-signature-256") ?? "";
  if (!sig.startsWith("sha256=")) return false;
  return safeEqual(sig.slice(7).toLowerCase(), toHex(await hmac("SHA-256", appSecret, req.body)));
}

export async function verifyTikTokSignature(req: SignedRequest, clientSecret: string, nowSec: number): Promise<boolean> {
  const parts = Object.fromEntries(
    (req.header("tiktok-signature") ?? "").split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.s || Math.abs(nowSec - t) > TIKTOK_SIGNATURE_TOLERANCE_SEC) return false;
  return safeEqual(parts.s.toLowerCase(), toHex(await hmac("SHA-256", clientSecret, `${parts.t}.${req.body}`)));
}

export async function verifyXSignature(req: SignedRequest, consumerSecret: string): Promise<boolean> {
  const sig = req.header("x-twitter-webhooks-signature") ?? "";
  if (!sig.startsWith("sha256=")) return false;
  return safeEqual(sig.slice(7), toBase64(await hmac("SHA-256", consumerSecret, req.body)));
}

export async function verifyLinkedInSignature(req: SignedRequest, clientSecret: string): Promise<boolean> {
  const raw = (req.header("x-li-signature") ?? "").trim();
  if (!raw) return false;
  const sig = raw.replace(/^hmacsha256=/i, "").toLowerCase();
  if (safeEqual(sig, toHex(await hmac("SHA-256", clientSecret, req.body)))) return true;
  return safeEqual(sig, toHex(await hmac("SHA-256", clientSecret, `hmacsha256=${req.body}`)));
}

export async function verifyWebSubSignature(req: SignedRequest, hubSecret: string): Promise<boolean> {
  const sig = req.header("x-hub-signature") ?? "";
  if (!sig.startsWith("sha1=")) return false;
  return safeEqual(sig.slice(5).toLowerCase(), toHex(await hmac("SHA-1", hubSecret, req.body)));
}

/** Verify a delivery for `platform` with its secret. */
export function verifyDelivery(
  platform: VideoPublishPlatform,
  req: SignedRequest,
  secret: string,
  nowSec: number,
): Promise<boolean> {
  switch (platform) {
    case "facebook":
    case "instagram":
      return verifyMetaSignature(req, secret);
    case "tiktok":
      return verifyTikTokSignature(req, secret, nowSec);
    case "x":
      return verifyXSignature(req, secret);
    case "linkedin":
      return verifyLinkedInSignature(req, secret);
    case "youtube":
      return verifyWebSubSignature(req, secret);
  }
}

// ─── Subscription handshakes (GET) ───────────────────────────────────────────

export type HandshakeReply = { kind: "text"; body: string } | { kind: "json"; body: Record<string, string> } | null;

/**
 * The reply a network's subscription check expects, or null when the query
 * isn't a valid handshake (→ 403). `verifyToken` is the token we registered
 * with Meta / WebSub (SOCIAL_WEBHOOK_VERIFY_TOKEN).
 */
export async function handshakeReply(
  platform: VideoPublishPlatform,
  query: (name: string) => string | undefined,
  secrets: { secret: string; verifyToken: string },
): Promise<HandshakeReply> {
  switch (platform) {
    case "facebook":
    case "instagram":
    case "youtube": {
      const mode = query("hub.mode");
      const challenge = query("hub.challenge");
      if (!challenge || (mode !== "subscribe" && mode !== "unsubscribe")) return null;
      const token = query("hub.verify_token") ?? "";
      // Meta always sends the token; WebSub only when we registered one.
      if (platform !== "youtube" || token || secrets.verifyToken) {
        if (!secrets.verifyToken || !safeEqual(token, secrets.verifyToken)) return null;
      }
      return { kind: "text", body: challenge };
    }
    case "x": {
      const crc = query("crc_token");
      if (!crc || !secrets.secret) return null;
      return { kind: "json", body: { response_token: `sha256=${toBase64(await hmac("SHA-256", secrets.secret, crc))}` } };
    }
    case "linkedin": {
      const code = query("challengeCode");
      if (!code || !secrets.secret) return null;
      return { kind: "json", body: { challengeCode: code, challengeResponse: toHex(await hmac("SHA-256", secrets.secret, code)) } };
    }
    case "tiktok":
      return null;
  }
}
