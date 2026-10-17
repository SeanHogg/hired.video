/**
 * Professional-network templates: connection request + resume/item review
 * invite. Pure builders — every user value is escaped by renderEmail().
 */

import { publicProfilePath } from "../../../../../../shared/public-paths.js";
import { emailLinkBaseUrl } from "../../../../utils/public-urls.js";
import { renderEmail } from "./layout.js";

const CONNECTION_REQUEST_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">New connection request</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    <strong>{{SenderName}}</strong> sent you a connection request on hired.video.
                  </td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px; border-left: 3px solid #e5e7eb; padding-left: 12px; font-style: italic;">
                    {{RequestMessage}}
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ProfileUrl}}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">
                      Review request
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:12px;">
                    <span style="color:#9ca3af;font-size:13px;">You can accept or decline from their profile.</span>
                  </td>
                </tr>
              </table>

              <p style="color: #9ca3af; font-size: 13px;">If you don't know this person, you can ignore this email or decline the request.</p>
`;

export interface ConnectionRequestEmailInput {
  to: string;
  recipientName: string;
  senderName: string;
  senderProfileId: string;
  requestMessage?: string | null;
}

/** Pure builder: render the connection-request email without sending. Exported for unit tests. */
export function buildConnectionRequestEmail(
  input: ConnectionRequestEmailInput,
): { to: string; subject: string; html: string; profileUrl: string } {
  const profileUrl = `${emailLinkBaseUrl()}${publicProfilePath(input.senderProfileId)}`;
  const html = renderEmail(CONNECTION_REQUEST_BODY, {
    RecipientName: input.recipientName,
    SenderName: input.senderName,
    ProfileUrl: profileUrl,
    RequestMessage:
      input.requestMessage?.trim() || `${input.senderName} would like to connect with you.`,
  });
  return {
    to: input.to,
    subject: `${input.senderName} wants to connect on hired.video`,
    html,
    profileUrl,
  };
}

// ============================================================================
// Review invite — an owner asks a peer/mentor (or external contact) to leave
// feedback on their resume. The CTA opens the share-link review surface, where
// the reviewer can comment WITHOUT signing up (the token is the access grant).
// ============================================================================

const REVIEW_INVITE_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">{{SenderName}} wants your feedback</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    <strong>{{SenderName}}</strong> asked you to review their {{ItemLabel}}, <strong>{{ItemTitle}}</strong>, on hired.video. You can leave comments and suggestions right on the page &mdash; no account required.
                  </td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px; border-left: 3px solid #e5e7eb; padding-left: 12px; font-style: italic;">
                    {{Message}}
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{ReviewUrl}}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">
                      Open &amp; leave feedback
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #6b7280; font-size: 14px; padding-bottom: 16px;">
                    If the button does not work, copy and paste this link into your browser:<br/>
                    <span style="word-break: break-all; color: #2563eb;">{{ReviewUrl}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; font-size: 13px;">
                    This feedback link expires in {{ExpiryLabel}}. If you weren't expecting it, you can ignore this email.
                  </td>
                </tr>
              </table>
`;

export interface ReviewInviteEmailInput {
  to: string;
  recipientName: string;
  senderName: string;
  /** Absolute reviewer link, e.g. https://hired.video/r/<token>. */
  reviewUrl: string;
  itemTitle: string;
  /** "resume", "job", "article"… — the kind of item being reviewed. */
  itemLabel?: string;
  message?: string | null;
  /** Human expiry, e.g. "42 hours". Omit when the link never expires. */
  expiryLabel?: string | null;
}

/** Pure builder: render the review-invite email without sending. Exported for tests. */
export function buildReviewInviteEmail(
  input: ReviewInviteEmailInput,
): { to: string; subject: string; html: string } {
  const itemLabel = input.itemLabel?.trim() || "resume";
  const html = renderEmail(REVIEW_INVITE_BODY, {
    RecipientName: input.recipientName,
    SenderName: input.senderName,
    ReviewUrl: input.reviewUrl,
    ItemLabel: itemLabel,
    ItemTitle: input.itemTitle,
    Message: input.message?.trim() || `${input.senderName} would value your perspective.`,
    ExpiryLabel: input.expiryLabel?.trim() || "a limited time",
  });
  return {
    to: input.to,
    subject: `${input.senderName} asked you to review their ${itemLabel} on hired.video`,
    html,
  };
}
