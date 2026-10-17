/**
 * Magic-link email for interview assignments (assign + resend).
 */
import { frontendBaseUrl } from "../../utils/public-urls.js";
import { sendGenericEmail } from "../adapters/email/senders/notifications.js";

export type InviteAssignmentType = "assign" | "invite" | "self" | null;

/** Public landing URL for an interview magic link. */
export function interviewInviteUrl(token: string): string {
  return `${frontendBaseUrl()}/interview/${token}`;
}

export interface InviteEmailArgs {
  to: string;
  recipientName: string;
  token: string;
  title: string;
  expiresAt: Date;
  assignmentType: InviteAssignmentType;
  isResend?: boolean;
}

export async function sendInterviewInviteEmail(args: InviteEmailArgs): Promise<void> {
  const url = interviewInviteUrl(args.token);
  const expiresFormatted = args.expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subjectPrefix = args.isResend ? "Resend: " : "";
  const cta = args.assignmentType === "invite" ? "Sign up & start" : "Start interview";
  const invitedCopy =
    args.assignmentType === "invite"
      ? `<p style="color:#374151;line-height:1.6;">You've been invited to answer some interview questions on hired.video. Open the link below — if you don't have an account yet, you'll be prompted to create a free job-seeker account first.</p>`
      : `<p style="color:#374151;line-height:1.6;">A new interview has been assigned to you on hired.video. Open the link below to view the questions and submit your answers.</p>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
      <tr><td align="center" style="padding:32px 16px;">
        <table width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#1e293b;padding:24px 32px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">hired.video</span>
          </td></tr>
          <tr><td style="padding:32px;color:#374151;line-height:1.6;font-size:16px;">
            <p style="color:#111827;">Hi ${args.recipientName},</p>
            <h2 style="color:#111827;font-size:20px;margin:8px 0 16px;">${args.title}</h2>
            ${invitedCopy}
            <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr><td style="background:#2563eb;border-radius:6px;">
                <a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;">${cta}</a>
              </td></tr>
            </table>
            <p style="color:#6b7280;font-size:14px;">Or copy this link: <a href="${url}" style="color:#2563eb;">${url}</a></p>
            <p style="color:#9ca3af;font-size:13px;margin-top:24px;">This link expires on <strong>${expiresFormatted}</strong>. If it lapses, the recruiter can re-send a fresh link.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
  await sendGenericEmail(args.to, `${subjectPrefix}${args.title} — interview invitation`, html);
}
