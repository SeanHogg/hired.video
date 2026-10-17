/**
 * Auth senders: verification, password reset, email 2FA, magic link and
 * the two-token email change. Each no-ops when no provider is configured.
 */

import { logger } from "../../../../lib/logger.js";
import { getEmailProvider } from "../transport.js";
import {
  buildPasswordResetEmail,
  buildResendVerificationEmail,
  buildVerificationEmail,
} from "../templates/auth-verification.js";
import {
  buildEmailChangeCurrentEmail,
  buildEmailChangeNewEmail,
  buildMagicLinkEmail,
  buildTwoFactorEmail,
} from "../templates/auth-signin.js";

export async function sendVerificationEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildVerificationEmail(recipientName, token);
  await provider.send({ to, subject, html });
}

export async function sendResendVerificationEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildResendVerificationEmail(recipientName, token);
  await provider.send({ to, subject, html });
}

export async function sendPasswordResetEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildPasswordResetEmail(recipientName, token);
  await provider.send({ to, subject, html });
}

export async function sendTwoFactorEmail(
  to: string,
  recipientName: string,
  code: string,
  expiryMinutes = 10,
  /** When supplied, a one-tap "approve sign-in" button is rendered above
   *  the code (gap #2225) — tapping it completes the login server-side so
   *  mobile users never type the code. Omit to fall back to code-only. */
  approveToken?: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const { subject, html } = buildTwoFactorEmail(recipientName, code, expiryMinutes, approveToken);
  await provider.send({ to, subject, html });
}

export async function sendMagicLinkEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping magic link email");
    return;
  }
  const { subject, html } = buildMagicLinkEmail(recipientName, token);
  await provider.send({ to, subject, html });
}

export async function sendEmailChangeCurrent(
  to: string,
  recipientName: string,
  currentEmail: string,
  newEmail: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping email-change-current email");
    return;
  }
  const { subject, html } = buildEmailChangeCurrentEmail(recipientName, currentEmail, newEmail, token);
  await provider.send({ to, subject, html });
}

export async function sendEmailChangeNew(
  to: string,
  currentEmail: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping email-change-new email");
    return;
  }
  const { subject, html } = buildEmailChangeNewEmail(currentEmail, token);
  await provider.send({ to, subject, html });
}
