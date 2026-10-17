/**
 * Sign-in + account-security templates: email 2FA code (with optional
 * one-tap approve link), magic link, and the two-token email change.
 * Pure builders — `{{Var}}` values are escaped by renderEmail(); the raw
 * approve block escapes its own href.
 */

import { escapeHtml } from "../../../../../../shared/html-escape.js";
import {
  buildEmailChangeConfirmCurrentUrl,
  buildEmailChangeConfirmNewUrl,
  buildMagicLinkUrl,
  buildTwoFactorApproveUrl,
} from "../../../../utils/public-urls.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

const TWO_FACTOR_BODY = `
              <!-- Preheader: the digits show in the mobile notification /
                   inbox preview line so the recipient can read the code
                   without opening the email. Hidden from the rendered body. -->
              <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">
                Your hired.video verification code is {{TwoFactorCode}}
              </div>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <span style="color:#111827;font-size:24px;font-weight:bold;">Your verification code</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:8px;">
                    <span style="color:#6b7280;font-size:14px;">Use this code to finish signing in. It expires in {{CodeExpiryMinutes}} minutes.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color:#111827;padding-bottom:8px;">Hi {{RecipientName}},</td>
                </tr>
              </table>

              {{ApproveBlock}}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#111827;background-color:#f3f4f6;padding:12px 20px;border-radius:8px;font-family:Courier New,monospace;">{{TwoFactorCode}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Plain-text restatement with the code adjacent to the word
                   "code". This is what lets iOS Mail / Android surface the
                   one-time-code AutoFill suggestion above the keyboard, so
                   the recipient taps once instead of copy/pasting on a phone
                   (the login field declares autoComplete="one-time-code"). -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="color:#374151;font-size:15px;padding-bottom:16px;">
                    Your hired.video verification code is {{TwoFactorCode}}
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color:#6b7280;font-size:14px;">If you did not request this code, you can safely ignore this email.</td>
                </tr>
              </table>`;

function twoFactorApproveBlock(approveToken: string | undefined): string {
  return approveToken
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;">
                <tr>
                  <td style="color:#374151;padding-bottom:16px;">Tap below to finish signing in on this device:</td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <a href="${escapeHtml(buildTwoFactorApproveUrl(approveToken))}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Approve sign-in</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="color:#9ca3af;font-size:13px;padding-bottom:8px;">Didn't start this? Ignore this email and your account stays locked.</td>
                </tr>
                <tr>
                  <td style="color:#374151;padding-top:8px;">Or enter this code on the sign-in screen:</td>
                </tr>
              </table>`
    : `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color:#374151;padding-bottom:16px;">Enter the following one-time code:</td>
                </tr>
              </table>`;
}

export function buildTwoFactorEmail(
  recipientName: string,
  code: string,
  expiryMinutes: number,
  approveToken?: string,
): RenderedEmail {
  // ApproveBlock is injected raw (its href is a server-built, signed URL,
  // escaped above), so it goes in BEFORE renderEmail() runs the {{vars}}.
  const html = renderEmail(TWO_FACTOR_BODY.replace("{{ApproveBlock}}", twoFactorApproveBlock(approveToken)), {
    RecipientName: recipientName,
    TwoFactorCode: code,
    CodeExpiryMinutes: String(expiryMinutes),
  });
  // Lead the subject with the code so it lands in the phone's lock-screen
  // notification + inbox preview — the recipient can read it (and iOS can
  // offer it as a one-tap AutoFill) without opening the email.
  return { subject: `${code} is your hired.video verification code`, html };
}

const MAGIC_LINK_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">Sign in to <span style="color: #2563eb;">hired.video</span></span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="color: #6b7280; font-size: 14px;">Your one-click sign-in link is ready</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    Click the button below to sign in. No password needed — this link expires in <strong>15 minutes</strong> and can only be used once.
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="{{MagicUrl}}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">
                      Sign in to hired.video
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:12px;">
                    <span style="color: #9ca3af; font-size: 13px;">Or copy this link: <a href="{{MagicUrl}}" style="color: #2563eb;">{{MagicUrl}}</a></span>
                  </td>
                </tr>
              </table>

              <p style="color: #9ca3af; font-size: 13px;">If you didn't request this link, you can safely ignore this email.</p>
`;

export function buildMagicLinkEmail(recipientName: string, token: string): RenderedEmail {
  const html = renderEmail(MAGIC_LINK_BODY, { RecipientName: recipientName, MagicUrl: buildMagicLinkUrl(token) });
  return { subject: "Your sign-in link for hired.video", html };
}

// Two-token email change flow. Sent to the OLD address: "someone is
// trying to change your email — confirm or deny." Sent to the NEW
// address: "verify ownership before we move your account." Both must
// be confirmed for the swap to land. NIST 800-63B §5.1.1.2 + ASVS V2.4.5.
const EMAIL_CHANGE_CURRENT_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr><td align="center"><span style="color: #111827; font-size: 24px; font-weight: bold;">Confirm email change</span></td></tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td></tr>
                <tr><td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                  Someone (hopefully you) requested to change the email on your hired.video account from <strong>{{CurrentEmail}}</strong> to <strong>{{NewEmail}}</strong>.
                  If this was you, click below to confirm. If not, ignore this email — your account stays on its current address.
                </td></tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr><td align="center">
                  <a href="{{ConfirmUrl}}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Confirm change</a>
                </td></tr>
              </table>
              <p style="color: #9ca3af; font-size: 13px;">This link expires in 1 hour. If you didn't make this request, no action is needed.</p>
`;

const EMAIL_CHANGE_NEW_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr><td align="center"><span style="color: #111827; font-size: 24px; font-weight: bold;">Verify your new email</span></td></tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="color: #111827; padding-bottom: 8px;">Hello,</td></tr>
                <tr><td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                  This address has been requested as the new email for a hired.video account. Click below to verify ownership. The change will only complete after both this address AND the previous one ({{CurrentEmail}}) confirm.
                </td></tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr><td align="center">
                  <a href="{{VerifyUrl}}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Verify this email</a>
                </td></tr>
              </table>
              <p style="color: #9ca3af; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore the email.</p>
`;

export function buildEmailChangeCurrentEmail(
  recipientName: string,
  currentEmail: string,
  newEmail: string,
  token: string,
): RenderedEmail {
  const html = renderEmail(EMAIL_CHANGE_CURRENT_BODY, {
    RecipientName: recipientName,
    CurrentEmail: currentEmail,
    NewEmail: newEmail,
    ConfirmUrl: buildEmailChangeConfirmCurrentUrl(token),
  });
  return { subject: "Confirm your hired.video email change", html };
}

export function buildEmailChangeNewEmail(currentEmail: string, token: string): RenderedEmail {
  const html = renderEmail(EMAIL_CHANGE_NEW_BODY, {
    CurrentEmail: currentEmail,
    VerifyUrl: buildEmailChangeConfirmNewUrl(token),
  });
  return { subject: "Verify your new hired.video email", html };
}
