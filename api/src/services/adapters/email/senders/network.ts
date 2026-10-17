/** Professional-network senders: connection request + review invite. */

import { logger } from "../../../../lib/logger.js";
import { getEmailProvider } from "../transport.js";
import {
  buildConnectionRequestEmail,
  buildReviewInviteEmail,
  type ReviewInviteEmailInput,
} from "../templates/network.js";

export async function sendConnectionRequestEmail(
  to: string,
  recipientName: string,
  senderName: string,
  senderProfileId: string,
  requestMessage?: string | null,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping connection request email");
    return;
  }
  const { subject, html } = buildConnectionRequestEmail({
    to,
    recipientName,
    senderName,
    senderProfileId,
    requestMessage,
  });
  await provider.send({ to, subject, html });
}

export async function sendReviewInviteEmail(input: ReviewInviteEmailInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping review invite email");
    return;
  }
  const { to, subject, html } = buildReviewInviteEmail(input);
  await provider.send({ to, subject, html });
}
