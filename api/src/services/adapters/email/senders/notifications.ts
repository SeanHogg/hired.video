/**
 * Notice senders: generic notification, contact-inquiry receipt,
 * moderation-flag heads-up and the template-less generic email.
 */

import { logger } from "../../../../lib/logger.js";
import { getEmailProvider } from "../transport.js";
import {
  buildContactConfirmationEmail,
  buildModerationFlagEmail,
  buildNotificationEmail,
  type ContactConfirmationEmailInput,
  type ModerationFlagEmailParams,
} from "../templates/notifications.js";

/** Send a generic notification email. No-ops when no provider is
 *  configured (matches every other sender here). Channel gating +
 *  recipient selection are the dispatcher's responsibility. */
export async function sendNotificationEmail(input: {
  to: string;
  title: string;
  message: string;
  url?: string;
}): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildNotificationEmail(input);
  await provider.send({ to: input.to, subject, html });
}

/** Send the contact-inquiry confirmation receipt. No-ops when no provider
 *  is configured (matches every other sender here). */
export async function sendContactConfirmationEmail(
  input: ContactConfirmationEmailInput,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildContactConfirmationEmail(input);
  await provider.send({ to: input.to, subject, html });
}

/** Notify a SuperAdmin that a user flagged content for review. Best-effort;
 *  the inbox fan-out remains the source of truth, this is the heads-up. */
export async function sendModerationFlagEmail(
  to: string,
  params: ModerationFlagEmailParams,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildModerationFlagEmail(params);
  await provider.send({ to, subject, html });
}

/** Send a one-off email with an arbitrary subject + HTML body. Bypasses
 *  the templated senders for cases like client-error reports where
 *  there's no fixed template. Returns true if the provider was configured
 *  and accepted the message; false (logged) otherwise. */
export async function sendGenericEmail(
  to: string,
  subject: string,
  html: string,
  fromName?: string,
): Promise<boolean> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email] No provider configured — skipping generic email", { to });
    return false;
  }
  await provider.send({ to, subject, html, fromName });
  return true;
}
