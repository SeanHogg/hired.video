/**
 * Account-verification templates: welcome/verify, resend-verify, password
 * reset. Pure builders — every user value is escaped by renderEmail().
 */

import { buildPasswordResetUrl, buildVerifyUrl } from "../../../../utils/public-urls.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

const VERIFY_EMAIL_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">Welcome to <span style="color: #2563eb;">hired.video</span></span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="color: #6b7280; font-size: 14px;">We are excited to have you on board.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    Thanks for creating your account! Please confirm your email to secure your account and unlock all features.
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: #2563eb; border-radius: 6px;">
                          <a href="{{VerifyUrl}}" style="display: inline-block; padding: 12px 20px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">Verify your email</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #6b7280; font-size: 14px; padding-bottom: 16px;">
                    If the button does not work, copy and paste this link into your browser:<br/>
                    <span style="word-break: break-all; color: #2563eb;">{{VerifyUrl}}</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0; border-top: 1px solid #e5e7eb;">
                <tr><td style="padding-top: 24px;"></td></tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; font-size: 18px; font-weight: bold; padding-bottom: 8px;">What you can do next</td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="color: #374151; line-height: 1.6;">
                <tr><td style="padding: 4px 0 4px 20px;">&#8226; Create and share your professional video resume</td></tr>
                <tr><td style="padding: 4px 0 4px 20px;">&#8226; Apply to jobs and manage your applications</td></tr>
                <tr><td style="padding: 4px 0 4px 20px;">&#8226; Track companies and personalize your job search</td></tr>
                <tr><td style="padding: 4px 0 4px 20px;">&#8226; Control privacy and visibility of your content</td></tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #6b7280; padding-top: 24px;">
                    If you did not create this account, you can safely ignore this email.
                  </td>
                </tr>
              </table>`;

const RESEND_VERIFY_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">Verify your email</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="color: #6b7280; font-size: 14px;">Just one more step to secure your account.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    Please confirm your email to continue using your hired.video account and access all features.
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: #2563eb; border-radius: 6px;">
                          <a href="{{VerifyUrl}}" style="display: inline-block; padding: 12px 20px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">Verify your email</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #6b7280; font-size: 14px; padding-bottom: 16px;">
                    If the button does not work, copy and paste this link into your browser:<br/>
                    <span style="word-break: break-all; color: #2563eb;">{{VerifyUrl}}</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #6b7280; padding-top: 24px;">
                    If you did not create this account, you can safely ignore this email.
                  </td>
                </tr>
              </table>`;

const PASSWORD_RESET_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 16px;">
                <tr>
                  <td>
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">Password Reset Request</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #333333; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #333333; padding-bottom: 8px;">We received a request to reset your password for your hired.video account.</td>
                </tr>
                <tr>
                  <td style="color: #333333; padding-bottom: 16px;">Click the button below to reset your password:</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: #2563eb; border-radius: 5px;">
                          <a href="{{ResetUrl}}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600;">Reset Password</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #374151; padding-bottom: 8px;">Or copy and paste this link into your browser:</td>
                </tr>
                <tr>
                  <td style="word-break: break-all; color: #2563eb; padding-bottom: 16px;">{{ResetUrl}}</td>
                </tr>
                <tr>
                  <td style="color: #374151; padding-bottom: 8px;"><strong>This link will expire in 1 hour.</strong></td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding-bottom: 16px;">If you did not request this password reset, you can safely ignore this email.</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 30px 0; border-top: 1px solid #eeeeee;">
                <tr><td style="padding-top: 16px;"></td></tr>
              </table>`;

export function buildVerificationEmail(recipientName: string, token: string): RenderedEmail {
  const html = renderEmail(VERIFY_EMAIL_BODY, { RecipientName: recipientName, VerifyUrl: buildVerifyUrl(token) });
  return { subject: "Verify your email – hired.video", html };
}

export function buildResendVerificationEmail(recipientName: string, token: string): RenderedEmail {
  const html = renderEmail(RESEND_VERIFY_BODY, { RecipientName: recipientName, VerifyUrl: buildVerifyUrl(token) });
  return { subject: "Verify your email – hired.video", html };
}

export function buildPasswordResetEmail(recipientName: string, token: string): RenderedEmail {
  const html = renderEmail(PASSWORD_RESET_BODY, { RecipientName: recipientName, ResetUrl: buildPasswordResetUrl(token) });
  return { subject: "Password reset request – hired.video", html };
}
