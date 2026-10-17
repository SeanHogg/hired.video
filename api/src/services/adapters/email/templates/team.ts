/**
 * Team seat-invitation template. Pure builder — every user value is
 * escaped by renderEmail().
 */

import { buildInviteUrl } from "../../../../utils/public-urls.js";
import { renderEmail } from "./layout.js";

const INVITE_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">You're invited to <span style="color: #2563eb;">{{TeamName}}</span></span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="color: #6b7280; font-size: 14px;">{{InviterName}} invited you to join on hired.video</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 16px;">
                    {{InviterName}} has invited you to join <strong>{{TeamName}}</strong> as a <strong>{{RoleLabel}}</strong>. Accept the invitation to get access.
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: #2563eb; border-radius: 6px;">
                          <a href="{{InviteUrl}}" style="display: inline-block; padding: 12px 20px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">Accept invitation</a>
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
                    <span style="word-break: break-all; color: #2563eb;">{{InviteUrl}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="color: #9ca3af; font-size: 13px;">
                    This invitation was sent to {{InvitedEmail}} and expires in {{ExpiryDays}} days. If you weren't expecting it, you can ignore this email.
                  </td>
                </tr>
              </table>
`;

export interface InvitationEmailInput {
  to: string;
  inviterName: string;
  teamName: string;
  roleLabel: string;
  token: string;
  expiryDays?: number;
}

/** Pure builder: render the seat-invitation email without sending. Exported for unit tests. */
export function buildInvitationEmail(
  input: InvitationEmailInput,
): { to: string; subject: string; html: string; inviteUrl: string } {
  const inviteUrl = buildInviteUrl(input.token);
  const html = renderEmail(INVITE_BODY, {
    InviterName: input.inviterName,
    TeamName: input.teamName,
    RoleLabel: input.roleLabel,
    InviteUrl: inviteUrl,
    InvitedEmail: input.to,
    ExpiryDays: String(input.expiryDays ?? 14),
  });
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to join ${input.teamName} on hired.video`,
    html,
    inviteUrl,
  };
}
