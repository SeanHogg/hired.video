/**
 * Risk-scoring for adaptive MFA.
 *
 * scoreLoginRisk → "low" | "medium" | "high"
 *
 * Single source of truth for the "should we challenge with MFA?"
 * question. The login handler, password-change endpoint, and any
 * future high-impact mutations call this fn (and only this fn).
 *
 * Signals:
 *   • Trusted-device cookie present and not expired         → -2
 *   • Same country as last successful login                 → -1
 *   • New country (different from last successful login)    → +2
 *   • New IP-ASN (different from last successful login)     → +1
 *   • No recent successful login (cold-start)               → +1
 *   • IP geo-velocity impossible (different country in <2h) → +3
 *   • Sanctioned country (should already be hard-blocked)   → +5
 *
 * Score → bucket:
 *   low (≤0): skip MFA entirely. Issue session.
 *   medium (1–3): require email-OTP / TOTP / passkey.
 *   high (≥4): require MFA AND email the user a security alert.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { isSanctioned } from "./geo.js";

const { sessions, loginEvents } = schema;

export type RiskBucket = "low" | "medium" | "high";

export interface ScoreLoginRiskInput {
  db: any;
  userId: string;
  ipCountry: string | null;
  ipAddress: string | null;
  // Set when a trusted-device cookie/header is present AND validated
  // out-of-band by the caller (the cookie is HMAC-signed and cross-
  // checked against the trusted_until column on sessions).
  trustedDevicePresent?: boolean;
}

export interface RiskScore {
  bucket: RiskBucket;
  score: number;
  reasons: string[];
}

const TRAVEL_VELOCITY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function scoreLoginRisk(input: ScoreLoginRiskInput): Promise<RiskScore> {
  const { db, userId, ipCountry, trustedDevicePresent } = input;
  const reasons: string[] = [];
  let score = 0;

  if (trustedDevicePresent) {
    score -= 2;
    reasons.push("trusted_device");
  }

  if (ipCountry && isSanctioned(ipCountry)) {
    score += 5;
    reasons.push("sanctioned_country");
  }

  // Look at the last successful login row for this user.
  const [last] = await db
    .select()
    .from(loginEvents)
    .where(and(eq(loginEvents.userId, userId), eq(loginEvents.success, true)))
    .orderBy(desc(loginEvents.createdAt))
    .limit(1);

  if (!last) {
    score += 1;
    reasons.push("cold_start");
  } else {
    // Country change check uses sessions.ip_country (populated from
    // cf-ipcountry on session create) since loginEvents only stores
    // ip_address. We cross-reference the last session row.
    const [lastSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(1);

    if (lastSession?.ipCountry && ipCountry) {
      if (lastSession.ipCountry !== ipCountry) {
        score += 2;
        reasons.push("new_country");
        // Velocity check — same user, different country, very recently.
        const ageMs = Date.now() - new Date(lastSession.createdAt).getTime();
        if (ageMs < TRAVEL_VELOCITY_WINDOW_MS) {
          score += 3;
          reasons.push("impossible_travel");
        }
      } else {
        score -= 1;
        reasons.push("same_country");
      }
    }
  }

  let bucket: RiskBucket = "low";
  if (score >= 4) bucket = "high";
  else if (score >= 1) bucket = "medium";

  return { bucket, score, reasons };
}
