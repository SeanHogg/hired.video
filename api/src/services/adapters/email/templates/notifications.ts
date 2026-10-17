/**
 * Notice templates: the generic notification email, the contact-inquiry
 * receipt and the SuperAdmin moderation-flag heads-up. Pure builders —
 * `{{Var}}` values are escaped by renderEmail(); raw blocks escape their
 * own interpolations.
 */

import { escapeHtml } from "../../../../../../shared/html-escape.js";
import { getEnv } from "../../../../utils/env.js";
import { buildModerationQueueUrl, emailLinkBaseUrl } from "../../../../utils/public-urls.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

// ============================================================================
// Generic notification email — the email channel of the unified
// notification dispatcher (services/notifications/notificationService.ts).
// Any pref-gated notification with `email: true` renders through here, so
// there is ONE transactional notification-email shape (DRY).
// ============================================================================

const NOTIFICATION_TITLE_BLOCK = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 22px; font-weight: bold;">{{Title}}</span>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 24px; white-space: pre-wrap;">{{Message}}</td>
                </tr>
              </table>`;

/** Absolute URL for a notification deep-link. Accepts an already-absolute
 *  http(s) URL or a site-relative path ("/services/inquiries"); anything
 *  else yields no CTA (defends against javascript:/data: injection). */
function notificationCtaUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${emailLinkBaseUrl()}${url}`;
  return null;
}

/** Pure builder: render a generic notification email. Exported for tests
 *  and for the dispatcher. `title`/`message` are HTML-escaped; the message
 *  cell uses `white-space: pre-wrap` so newline-joined multi-field bodies
 *  (e.g. the contact-inquiry heads-up) keep their line breaks. The CTA href
 *  is a validated absolute/relative URL only. */
export function buildNotificationEmail(input: {
  title: string;
  message: string;
  url?: string;
}): { subject: string; html: string } {
  const ctaUrl = notificationCtaUrl(input.url);
  const ctaBlock = ctaUrl
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 8px;">
                    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;">View</a>
                  </td>
                </tr>
              </table>`
    : "";
  // renderEmail() escapes only the {{vars}}; the CTA block is trusted markup
  // appended to the body (its href is validated above).
  const html = renderEmail(NOTIFICATION_TITLE_BLOCK + ctaBlock, {
    Title: input.title,
    Message: input.message,
  });
  return { subject: input.title, html };
}

// ============================================================================
// Contact-inquiry confirmation — the receipt sent to a visitor who submits
// the shared <ContactPanel> form (Pricing "Request a demo", "Talk to us",
// support, etc.). The on-screen toast is not a durable acknowledgement, so
// this closes the loop and gives them a copy of what they sent.
// ============================================================================

const CONTACT_CONFIRMATION_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">We've got your message</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="color: #6b7280; font-size: 14px;">Thanks for reaching out to hired.video.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    We've received your {{InquiryLabel}} and our team will get back to you at
                    <strong>{{ReplyEmail}}</strong>, usually within one business day. Here's a copy
                    of what you sent us:
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px;">
                    <div style="color: #1e40af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 6px;">Subject</div>
                    <div style="color: #111827; font-size: 15px; font-weight: 600; padding-bottom: 14px;">{{Subject}}</div>
                    <div style="color: #1e40af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 6px;">Your message</div>
                    <div style="color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">{{Message}}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #9ca3af; font-size: 13px;">
                    If you didn't submit this request, you can safely ignore this email.
                  </td>
                </tr>
              </table>`;

export interface ContactConfirmationEmailInput {
  to: string;
  /** Submitter's name — falls back to a neutral greeting when blank. */
  recipientName: string;
  /** Human label for the inquiry kind ("demo request", "support request", …),
   *  used in the body sentence. */
  inquiryLabel: string;
  subject: string;
  message: string;
}

/** Pure builder: render the contact-confirmation email without sending.
 *  Exported for unit tests. `white-space:pre-wrap` preserves the message's
 *  line breaks; renderEmail() HTML-escapes every var. */
export function buildContactConfirmationEmail(
  input: ContactConfirmationEmailInput,
): { subject: string; html: string } {
  const html = renderEmail(CONTACT_CONFIRMATION_BODY, {
    RecipientName: input.recipientName.trim() || "there",
    InquiryLabel: input.inquiryLabel.toLowerCase(),
    Subject: input.subject,
    Message: input.message,
    ReplyEmail: getEnv("EMAIL_FROM") || "info@hired.video",
  });
  return { subject: "We've received your message – hired.video", html };
}

export interface ModerationFlagEmailParams {
  reporterName: string;
  entityLabel: string;
  reasonLabel: string;
  entityId: string;
  notes?: string | null;
}

/** Pure builder: the moderation-flag heads-up. Deliberately NOT wrapped in
 *  the branded layout (internal SuperAdmin notice — unchanged markup). */
export function buildModerationFlagEmail(params: ModerationFlagEmailParams): RenderedEmail {
  const queueUrl = buildModerationQueueUrl();
  const notesBlock = params.notes
    ? `<p style="margin:8px 0;"><strong>Notes:</strong> ${escapeHtml(params.notes)}</p>`
    : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="font-size:18px;">New content flag — review needed</h2>
      <p><strong>${escapeHtml(params.reporterName)}</strong> flagged a
        <strong>${escapeHtml(params.entityLabel)}</strong>.</p>
      <p style="margin:8px 0;"><strong>Reason:</strong> ${escapeHtml(params.reasonLabel)}</p>
      ${notesBlock}
      <p style="margin:8px 0;color:#666;font-size:13px;">Entity id: ${escapeHtml(params.entityId)}</p>
      <p style="margin:20px 0;">
        <a href="${escapeHtml(queueUrl)}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open moderation queue</a>
      </p>
    </div>`;
  return { subject: `[Moderation] ${params.entityLabel} flagged — ${params.reasonLabel}`, html };
}
