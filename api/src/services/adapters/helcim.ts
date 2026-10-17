/**
 * Helcim HTTP adapter — the ONE place that talks to api.helcim.com.
 *
 * Owns transport (base URL, JSON), auth (the `api-token` header — Helcim v2
 * has no account-id header), errors (HelcimApiError carries the HTTP status)
 * and webhook signature verification (HMAC-SHA256, constant-time compare).
 *
 * Callers: the card/ACH acquiring provider (services/billing/payment/helcim.ts),
 * the ACH payout provider (services/payout/helcim-ach.ts) and the workforce
 * accounting connector (services/workforce/connectors/helcim-billing.ts).
 * See https://devdocs.helcim.com/docs/authentication-with-the-helcim-api-and-helcimpayjs
 */

export const HELCIM_API_BASE = "https://api.helcim.com/v2";
/** HelcimPay.js modal SDK (card + ACH collection / verify). */
export const HELCIM_PAY_JS = "https://secure.helcim.app/helcim-pay/services/start.js";

/** A non-2xx Helcim response. `status` lets callers tell 4xx from 5xx. */
export class HelcimApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Helcim API error ${status}: ${body}`);
    this.name = "HelcimApiError";
  }

  /** 5xx (and 429) are worth retrying; other 4xx are caller errors. */
  get retriable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/** The merchant API token from env (HELCIM_API_KEY is the legacy name). */
export function helcimApiTokenFromEnv(env: Record<string, string | undefined> | undefined): string | null {
  return env?.HELCIM_API_TOKEN ?? env?.HELCIM_API_KEY ?? null;
}

/** One authenticated JSON call to the Helcim v2 API. Throws HelcimApiError. */
export async function helcimRequest<T = unknown>(
  apiToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${HELCIM_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "api-token": apiToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new HelcimApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

/**
 * Verify a Helcim webhook delivery (`helcim-signature` = hex HMAC-SHA256 of
 * the raw body with HELCIM_WEBHOOK_TOKEN). Constant-time compare so the check
 * can't become a byte-by-byte signature oracle. Returns the expected digest
 * (a deterministic per-body id callers may use for idempotency); throws when
 * the token is missing or the signature is absent / wrong.
 */
export async function verifyHelcimWebhookSignature(
  body: string,
  headers: Headers,
  webhookToken: string | undefined,
): Promise<string> {
  if (!webhookToken) throw new Error("HELCIM_WEBHOOK_TOKEN is not configured");
  const signature = headers.get("helcim-signature");
  if (!signature) throw new Error("Missing helcim-signature header");
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", webhookToken).update(body).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  // timingSafeEqual throws on unequal lengths; the HMAC hex is always 64
  // chars, so a length mismatch is already an invalid signature.
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Helcim webhook signature verification failed");
  }
  return expected;
}
