/**
 * Email marketing preference-center use cases (the /api/email routes):
 * wires MarketingConsentService to the request's repositories and resolves
 * the signed-in caller's own address for the `/me` reads/writes.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { DomainError } from "../../domains/errors.js";
import { MarketingConsentService } from "./MarketingConsentService.js";
import type {
  EmailMarketingPreferencesDTO,
  UpdatePreferencesInput,
} from "../../../../shared/email-consent.js";

export function marketingConsentService(): MarketingConsentService {
  return new MarketingConsentService(buildRepos(getDb()).emailConsent as any);
}

/** The caller's own email — 401 when the account has none (or is gone). */
async function callerEmail(userId: string): Promise<string> {
  const row = await buildRepos(getDb()).users.findVerificationStatus(userId);
  if (!row?.email) throw new DomainError(401, "UNAUTHORIZED", "Authentication required");
  return row.email;
}

export async function getMyEmailPreferences(userId: string): Promise<EmailMarketingPreferencesDTO> {
  const email = await callerEmail(userId);
  return marketingConsentService().getByEmail(email, userId);
}

export async function updateMyEmailPreferences(
  userId: string,
  input: UpdatePreferencesInput,
): Promise<EmailMarketingPreferencesDTO> {
  const email = await callerEmail(userId);
  return marketingConsentService().updateByEmail(email, input, userId);
}

/** Record each bounced/complained address onto the hard-suppression list.
 *  Sequential + idempotent (ON CONFLICT DO NOTHING) — webhook batches are
 *  tiny (a handful of events per POST), so no fan-out concern. */
export async function recordHardSuppressions(
  suppressions: ReadonlyArray<{ email: string; reason: string }>,
): Promise<void> {
  if (suppressions.length === 0) return;
  const svc = marketingConsentService();
  for (const s of suppressions) {
    await svc.recordHardSuppression(s.email, `webhook:${s.reason}`);
  }
}
