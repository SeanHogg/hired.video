/**
 * Route helper for the candidate-video consent gate (same shape as
 * postChannelGate): `null` when the project may go public, else the 403
 * CONSENT_REQUIRED envelope with `details.reason` (e.g. `content_changed`,
 * so the UI can ask the candidate again). The rule itself lives in
 * domains/candidate-consent/consent-gate.ts.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { error } from "../types/index.js";
import { CandidateConsentRequiredError } from "../domains/candidate-consent/consent-gate.js";
import { assertCandidateVideoConsent } from "../services/candidate-consent/candidate-consent-deps.js";

export async function candidateConsentGate(c: Context<AppEnv>, projectId: string): Promise<Response | null> {
  try {
    await assertCandidateVideoConsent(projectId);
    return null;
  } catch (e) {
    if (!(e instanceof CandidateConsentRequiredError)) throw e;
    return c.json(error(e.code, e.message, e.details), 403);
  }
}
