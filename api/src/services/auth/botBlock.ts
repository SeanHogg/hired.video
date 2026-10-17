/**
 * Single helper for inserting a bot_block_events row. Every gate
 * (Turnstile, honeypot, disposable, MX, breach, geo, OFAC, brute-force)
 * funnels through this so the data shape on the SuperAdmin bot globe
 * can never drift.
 *
 * Privacy: we hash IPs (SHA-256 hex) and store only the email domain.
 * Plaintext IPs and full email addresses never land in this table.
 */

import { schema } from "../../db/index.js";
import { sha256Hex } from "../../utils/crypto.js";
import { logger } from "../../lib/logger.js";

const { botBlockEvents } = schema;

export type BotBlockReason =
  | "TURNSTILE_FAIL"
  | "HONEYPOT_HIT"
  | "RATE_LIMIT"
  | "DISPOSABLE_EMAIL"
  | "MX_FAIL"
  | "BREACHED_PASSWORD"
  | "GEO_BLOCKED"
  | "OFAC_BLOCKED"
  | "BRUTE_FORCE";

export interface RecordBotBlockInput {
  db: any;
  endpoint: string;
  reason: BotBlockReason;
  countryCode?: string | null;
  ipAddress?: string | null;
  email?: string | null;
  asn?: string | null;
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

export async function recordBotBlock(input: RecordBotBlockInput): Promise<void> {
  try {
    const ipHash = input.ipAddress ? await sha256Hex(input.ipAddress) : null;
    await input.db.insert(botBlockEvents).values({
      endpoint: input.endpoint,
      reason: input.reason,
      countryCode: input.countryCode ?? null,
      ipHash,
      emailDomain: emailDomain(input.email),
      asn: input.asn ?? null,
    } as any);
  } catch (err) {
    // Telemetry failure must never block the request flow.
    logger.error("[botBlock] insert failed", err);
  }
}
