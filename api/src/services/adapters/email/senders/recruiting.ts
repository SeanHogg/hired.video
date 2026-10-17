/** Recruiting senders: candidate screening invitation + video consent. */

import { logger } from "../../../../lib/logger.js";
import { getEmailProvider } from "../transport.js";
import {
  buildCandidateVideoConsentEmail,
  buildScreeningInvitationEmail,
  type CandidateVideoConsentEmailInput,
  type ScreeningInvitationEmailInput,
} from "../templates/recruiting.js";

/**
 * Candidate screening invitation — a magic link to the screening portal where
 * the candidate completes the outstanding items (résumé, contact confirmation,
 * validated assessments, competency tests, …). Best-effort: the calling route
 * never rolls back the request row on a send failure (the recruiter can resend).
 */
export async function sendScreeningInvitationEmail(
  input: ScreeningInvitationEmailInput,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildScreeningInvitationEmail(input);
  await provider.send({ to: input.to, subject, html });
}

export async function sendCandidateVideoConsentEmail(input: CandidateVideoConsentEmailInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping candidate video consent email");
    return;
  }
  await provider.send(buildCandidateVideoConsentEmail(input));
}
