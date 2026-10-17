/** Team senders: seat invitation. */

import { logger } from "../../../../lib/logger.js";
import { getEmailProvider } from "../transport.js";
import { buildInvitationEmail, type InvitationEmailInput } from "../templates/team.js";

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping invitation email");
    return;
  }
  const { subject, html } = buildInvitationEmail(input);
  await provider.send({ to: input.to, subject, html });
}
