/**
 * Single home for the Web Crypto primitives the API uses: SHA-256 digests,
 * HMAC-SHA256 sign/verify, base64url, random tokens and the anonymous
 * client-IP bucket hash.
 *
 * Every helper here preserves the exact output format its former private
 * copies produced (lowercase hex, unpadded base64url, fixed lengths) so
 * tokens and hashes already persisted keep validating. Pick the variant
 * whose format matches what is stored — never "upgrade" a call site's
 * encoding, it would orphan existing rows.
 *
 * Runs on Cloudflare Workers and Node 20+ (global `crypto`, `btoa`, `atob`).
 */

type BinaryInput = string | ArrayBuffer | ArrayBufferView;

const encoder = new TextEncoder();

function toBytes(input: BinaryInput): Uint8Array {
  if (typeof input === "string") return encoder.encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

// ── encoding ────────────────────────────────────────────────────────────────

/** Lowercase hex, two chars per byte. */
export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i]!.toString(16).padStart(2, "0");
  return out;
}

/** Decode hex (two chars per byte; a trailing odd char is ignored, non-hex
 *  pairs decode to 0) — for webhook signatures sent as hex. */
export function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g) ?? [];
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
}

/** Standard (padded) base64 of raw bytes. Chunked so large payloads (images
 *  sent to a vision classifier) stay fast without blowing the
 *  `fromCharCode` argument limit. */
export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < view.length; i += CHUNK) {
    bin += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Decode standard base64 to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Unpadded base64url. A string argument is UTF-8 encoded first (identical
 * to `btoa(str)` for ASCII input, which is every token payload we mint).
 */
export function base64UrlEncode(input: BinaryInput): string {
  return bytesToBase64(toBytes(input)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode base64url (padding optional) to bytes. */
export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/** Decode base64url to a UTF-8 string. */
export function base64UrlDecode(b64url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64url));
}

// ── digests ─────────────────────────────────────────────────────────────────

/** Raw SHA-256 digest bytes. */
export async function sha256Bytes(input: BinaryInput): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", toBytes(input)));
}

/** Lowercase hex SHA-256 (64 chars) of a UTF-8 string or raw bytes. */
export async function sha256Hex(input: BinaryInput): Promise<string> {
  return bytesToHex(await sha256Bytes(input));
}

/** Lowercase hex SHA-1 (40 chars). NOT for security — only where a protocol
 *  fixes the digest (HIBP k-anonymity range API) or for content ETags. */
export async function sha1Hex(input: BinaryInput): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-1", toBytes(input)));
}

/** Unpadded base64url SHA-256 (43 chars) — e.g. a PKCE S256 challenge. */
export async function sha256Base64Url(input: BinaryInput): Promise<string> {
  return base64UrlEncode(await sha256Bytes(input));
}

// ── HMAC ────────────────────────────────────────────────────────────────────

/** Digests HMAC is used with. SHA-1 exists ONLY for protocols that mandate
 *  it (RFC 6238 TOTP, Facebook's legacy `X-Hub-Signature`) — never pick it
 *  for anything we design. */
export type HmacHash = "SHA-1" | "SHA-256";

async function hmacKey(secret: BinaryInput, usage: "sign" | "verify", hash: HmacHash = "SHA-256"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toBytes(secret), { name: "HMAC", hash }, false, [usage]);
}

/** Raw HMAC signature bytes of `message` under `secret` with the given digest. */
export async function hmac(hash: HmacHash, secret: BinaryInput, message: BinaryInput): Promise<Uint8Array> {
  const key = await hmacKey(secret, "sign", hash);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toBytes(message)));
}

/** Raw HMAC-SHA256 signature bytes of `message` under `secret`. */
export function hmacSha256(secret: BinaryInput, message: BinaryInput): Promise<Uint8Array> {
  return hmac("SHA-256", secret, message);
}

/** Lowercase hex HMAC-SHA256 (64 chars). */
export async function hmacSha256Hex(secret: BinaryInput, message: BinaryInput): Promise<string> {
  return bytesToHex(await hmacSha256(secret, message));
}

/** Unpadded base64url HMAC-SHA256 (43 chars). */
export async function hmacSha256Base64Url(secret: BinaryInput, message: BinaryInput): Promise<string> {
  return base64UrlEncode(await hmacSha256(secret, message));
}

/** Padded standard base64 HMAC-SHA256 (44 chars). */
export async function hmacSha256Base64(secret: BinaryInput, message: BinaryInput): Promise<string> {
  return bytesToBase64(await hmacSha256(secret, message));
}

/**
 * Constant-time verify of a raw signature via `crypto.subtle.verify`
 * (no early-exit string compare).
 */
export async function hmacSha256Verify(
  secret: BinaryInput,
  message: BinaryInput,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await hmacKey(secret, "verify");
  return crypto.subtle.verify("HMAC", key, signature, toBytes(message));
}

/** Constant-time comparison of two strings (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── randomness ──────────────────────────────────────────────────────────────

/** `byteLength` CSPRNG bytes. */
export function randomBytes(byteLength: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(byteLength));
}

/** Lowercase hex of `byteLength` random bytes (string length = 2 × bytes). */
export function randomHex(byteLength: number): string {
  return bytesToHex(randomBytes(byteLength));
}

/** Unpadded base64url of `byteLength` random bytes. */
export function randomBase64Url(byteLength: number): string {
  return base64UrlEncode(randomBytes(byteLength));
}

// ── anonymous client bucket ─────────────────────────────────────────────────

interface HeaderReader {
  req: { header: (name: string) => string | undefined };
}

/**
 * Daily-salted, NON-cryptographic FNV-1a bucket of the caller's IP (8 hex
 * chars) for same-day anonymous view/vote dedup without storing the raw
 * address. Null when no IP header is present (local/test contexts).
 */
export function hashClientIp(c: HeaderReader): string | null {
  const ip =
    c.req.header?.("cf-connecting-ip") ??
    c.req.header?.("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!ip) return null;
  const salt = new Date().toISOString().slice(0, 10);
  const enc = encoder.encode(`${ip}|${salt}`);
  let h = 0x811c9dc5;
  for (let i = 0; i < enc.length; i++) {
    h ^= enc[i]!;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
