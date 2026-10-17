/**
 * Email transport — the vendor seam for every transactional email.
 *
 * Architecture:
 *   EmailProvider (interface) ← SendPulseEmailProvider (implementation)
 *
 * Senders only depend on the EmailProvider interface. Swapping the vendor
 * means writing a new class that implements EmailProvider and updating
 * getEmailProvider().
 *
 * Environment variables (Wrangler secrets / vars):
 *   EMAIL_CLIENTID   — SendPulse Client ID
 *   EMAIL_SECRET     — SendPulse Client Secret
 *   EMAIL_FROM       — From address (default: info@hired.video)
 */

import { isGuestEmail } from "../../../../../shared/guest-accounts.js";
import { getEnv } from "../../../utils/env.js";
import { logger } from "../../../lib/logger.js";

// ============================================================================
// EMAIL PROVIDER INTERFACE
// ============================================================================

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// ============================================================================
// SENDPULSE IMPLEMENTATION (direct fetch — no filesystem dependency)
// ============================================================================

interface SendPulseTokenResponse {
  access_token?: string;
  expires_in?: number;
}

/** In-memory token cache — survives across requests within the same Worker instance */
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getSendPulseToken(clientId: string, clientSecret: string): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt) {
    logger.info("[email:sendpulse] Using cached token");
    return _cachedToken;
  }

  logger.info("[email:sendpulse] Fetching new OAuth token");
  const res = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SendPulse auth failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as SendPulseTokenResponse;
  _cachedToken = data.access_token as string;
  // Tokens are valid for 3600s; refresh 60s early
  _tokenExpiresAt = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
  logger.info("[email:sendpulse] Token acquired", { expiresInSeconds: data.expires_in ?? 3600 });
  return _cachedToken;
}

class SendPulseEmailProvider implements EmailProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly defaultFrom: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    // Guest accounts have a non-deliverable placeholder address — never send.
    if (isGuestEmail(message.to)) return;
    try {
      const token = await getSendPulseToken(this.clientId, this.clientSecret);

      const fromEmail = message.fromEmail ?? this.defaultFrom;
      const fromName = message.fromName ?? "hired.video";

      logger.info("[email:sendpulse] Sending email", { to: message.to, subject: message.subject });
      logger.info("[email:sendpulse] html preview", { htmlLength: message.html?.length ?? 0, htmlPreview: message.html?.slice(0, 300) ?? "(empty)" });

      const htmlBase64 = Buffer.from(message.html, "utf-8").toString("base64");

      const res = await fetch("https://api.sendpulse.com/smtp/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: {
            html: htmlBase64,
            subject: message.subject,
            from: { name: fromName, email: fromEmail },
            to: [{ email: message.to }],
          },
        }),
      });

      const body = await res.text().catch(() => "");
      if (!res.ok) {
        logger.error("[email:sendpulse] Send failed", { status: res.status, body });
      } else {
        logger.info("[email:sendpulse] Send OK", { status: res.status, body });
      }
    } catch (err) {
      logger.error("[email:sendpulse] Error", err);
    }
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

let _provider: EmailProvider | null = null;
/** Test seam — when set, overrides provider resolution so a spy/fake can
 *  observe `.send()` without SendPulse credentials. Mirrors the
 *  enrichment provider's `__setActiveEnrichmentProvider`. */
let _providerOverride: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider | null {
  if (_providerOverride) return _providerOverride;
  if (_provider) return _provider;

  const clientId = getEnv("EMAIL_CLIENTID");
  const clientSecret = getEnv("EMAIL_SECRET");

  if (!clientId || !clientSecret) {
    logger.warn("[email]SendPulse credentials not configured — emails will be skipped");
    return null;
  }

  const fromAddress = getEnv("EMAIL_FROM") || "info@hired.video";
  _provider = new SendPulseEmailProvider(clientId, clientSecret, fromAddress);
  return _provider;
}

/** Test seam: swap the email provider for a fake/spy. Pass null to reset. */
export function __setEmailProvider(p: EmailProvider | null): void {
  _providerOverride = p;
}
