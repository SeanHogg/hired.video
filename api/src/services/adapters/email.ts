/**
 * Email service — transactional emails for hired.video.
 *
 * Architecture:
 *   EmailProvider (interface) ← SendPulseEmailProvider (implementation)
 *
 * The public send functions (sendVerificationEmail, sendPasswordResetEmail, etc.)
 * only depend on the EmailProvider interface. Swapping the vendor means writing
 * a new class that implements EmailProvider and updating getEmailProvider().
 *
 * Environment variables (Wrangler secrets / vars):
 *   EMAIL_CLIENTID   — SendPulse Client ID
 *   EMAIL_SECRET     — SendPulse Client Secret
 *   EMAIL_FROM       — From address (default: info@hired.video)
 *   FRONTEND_URL     — Base URL for link generation
 */

import { isGuestEmail } from "../../../../shared/guest-accounts.js";
import { publicProfilePath } from "../../../../shared/public-paths.js";
import { getEnv } from "../../utils/env.js";

// ============================================================================
// EMAIL PROVIDER INTERFACE
// ============================================================================

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// ============================================================================
// SENDPULSE IMPLEMENTATION (direct fetch — no filesystem dependency)
// ============================================================================

/** In-memory token cache — survives across requests within the same Worker instance */
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getSendPulseToken(clientId: string, clientSecret: string): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt) {
    console.log("[email:sendpulse] Using cached token");
    return _cachedToken;
  }

  console.log("[email:sendpulse] Fetching new OAuth token");
  const res = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SendPulse auth failed: ${res.status} ${body}`);
  }

  const data: any = await res.json();
  _cachedToken = data.access_token as string;
  // Tokens are valid for 3600s; refresh 60s early
  _tokenExpiresAt = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
  console.log("[email:sendpulse] Token acquired, expires in", data.expires_in ?? 3600, "s");
  return _cachedToken;
}

class SendPulseEmailProvider implements EmailProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly defaultFrom: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    // Guest accounts have a non-deliverable placeholder address — never send.
    if (isGuestEmail(message.to)) return;
    try {
      const token = await getSendPulseToken(this.clientId, this.clientSecret);

      const fromEmail = message.fromEmail ?? this.defaultFrom;
      const fromName = message.fromName ?? "hired.video";

      console.log("[email:sendpulse] Sending email to:", message.to, "subject:", message.subject);
      console.log("[email:sendpulse] html length:", message.html?.length ?? 0, "| first 300 chars:", message.html?.slice(0, 300) ?? "(empty)");

      const htmlBase64 = Buffer.from(message.html, "utf-8").toString("base64");

      const res = await fetch("https://api.sendpulse.com/smtp/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: {
            html: htmlBase64,
            subject: message.subject,
            from: { name: fromName, email: fromEmail },
            to: [{ email: message.to }],
          },
        }),
      });

      const body = await res.text().catch(() => "");
      if (!res.ok) {
        console.error("[email:sendpulse] Send failed:", res.status, body);
      } else {
        console.log("[email:sendpulse] Send OK:", res.status, body);
      }
    } catch (err) {
      console.error("[email:sendpulse] Error:", err);
    }
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================


export interface ScreeningInvitationEmailInput {
  to: string;
  candidateName?: string | null;
  token: string;
  message?: string | null;
}

/**
 * Candidate screening invitation — a magic link to the screening portal where
 * the candidate completes the outstanding items (résumé, contact confirmation,
 * validated assessments, competency tests, …). Best-effort: the calling route
 * never rolls back the request row on a send failure (the recruiter can resend).
 */
export async function sendScreeningInvitationEmail(
  input: ScreeningInvitationEmailInput,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const frontendUrl = getEnv("FRONTEND_URL");
  const link = `${frontendUrl}/screening/${input.token}`;
  const greeting = input.candidateName
    ? `Hi ${escapeHtml(input.candidateName)},`
    : "Hi,";
  const note = input.message
    ? `<p style="margin:0 0 16px;color:#374151;">${escapeHtml(input.message)}</p>`
    : "";
  const body = `
    <h1 style="font-size:20px;margin:0 0 16px;color:#111827;">Complete your application screening</h1>
    <p style="margin:0 0 16px;color:#374151;">${greeting}</p>
    <p style="margin:0 0 16px;color:#374151;">
      To move your application forward, please complete the short screening below.
      It only asks for what we don't already have on file.
    </p>
    ${note}
    <p style="margin:24px 0;">
      <a href="${link}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
        Continue your application
      </a>
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
      Or paste this link into your browser:<br />
      <a href="${link}" style="color:#2563eb;">${link}</a>
    </p>`;
  const html = LAYOUT_HEADER + body + LAYOUT_FOOTER;
  await provider.send({
    to: input.to,
    subject: "Complete your application screening",
    html,
  });
}

// Candidate video consent (migration 0534) — English-only, like every email
// in this module. The link carries the RAW token; only its hash is stored.
const CANDIDATE_VIDEO_CONSENT_BODY = `
    <h1 style="font-size:20px;margin:0 0 16px;color:#111827;">May we share your candidate video?</h1>
    <p style="margin:0 0 16px;color:#374151;">Hi {{CandidateName}},</p>
    <p style="margin:0 0 16px;color:#374151;">
      {{RecruiterName}} made a short video introducing you{{ForJob}}. It stays private
      until you approve it &mdash; nothing is made public or posted to social media without your yes.
    </p>
    {{MessageBlock}}
    <p style="margin:24px 0;">
      <a href="{{ConsentUrl}}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
        Review the video
      </a>
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
      This link expires on {{ExpiresOn}}. Or paste it into your browser:<br />
      <a href="{{ConsentUrl}}" style="color:#2563eb;">{{ConsentUrl}}</a>
    </p>`;

export interface CandidateVideoConsentEmailInput {
  to: string;
  candidateName: string;
  recruiterName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  message?: string | null;
  /** The raw consent token (never stored). */
  token: string;
  expiresAt: Date;
}

/** `${FRONTEND_URL}/consent/video/<token>` — the candidate's public consent page. */
export function buildCandidateVideoConsentUrl(token: string): string {
  return `${getBaseUrl()}/consent/video/${encodeURIComponent(token)}`;
}

/** Pure builder: render the candidate-video consent email. Exported for tests. */
export function buildCandidateVideoConsentEmail(
  input: CandidateVideoConsentEmailInput,
): { to: string; subject: string; html: string } {
  const role = [input.jobTitle?.trim(), input.companyName?.trim()].filter(Boolean).join(" at ");
  const message = input.message?.trim();
  // MessageBlock is pre-escaped markup, so it is spliced in after render().
  const html = render(CANDIDATE_VIDEO_CONSENT_BODY, {
    CandidateName: input.candidateName,
    RecruiterName: input.recruiterName,
    ForJob: role ? ` for ${role}` : "",
    ConsentUrl: buildCandidateVideoConsentUrl(input.token),
    ExpiresOn: input.expiresAt.toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, ""),
  }).replace(
    "{{MessageBlock}}",
    message ? `<p style="margin:0 0 16px;color:#374151;">${escapeHtml(message)}</p>` : "",
  );
  return {
    to: input.to,
    subject: `${input.recruiterName} asked to share your candidate video`,
    html,
  };
}

export async function sendCandidateVideoConsentEmail(input: CandidateVideoConsentEmailInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping candidate video consent email");
    return;
  }
  await provider.send(buildCandidateVideoConsentEmail(input));
}

let _provider: EmailProvider | null = null;
/** Test seam — when set, overrides provider resolution so a spy/fake can
 *  observe `.send()` without SendPulse credentials. Mirrors the
 *  enrichment provider's `__setActiveEnrichmentProvider`. */
let _providerOverride: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider | null {
  if (_providerOverride) return _providerOverride;
  if (_provider) return _provider;

  const clientId = getEnv("EMAIL_CLIENTID");
  const clientSecret = getEnv("EMAIL_SECRET");

  if (!clientId || !clientSecret) {
    console.warn("[email] SendPulse credentials not configured — emails will be skipped");
    return null;
  }

  const fromAddress = getEnv("EMAIL_FROM") || "info@hired.video";
  _provider = new SendPulseEmailProvider(clientId, clientSecret, fromAddress);
  return _provider;
}

/** Test seam: swap the email provider for a fake/spy. Pass null to reset. */
export function __setEmailProvider(p: EmailProvider | null): void {
  _providerOverride = p;
}

// ============================================================================
// URL BUILDERS
// ============================================================================

function getBaseUrl(): string {
  const frontendUrl = getEnv("FRONTEND_URL");
  return frontendUrl.split(",")[0]?.trim() || "https://hired.video";
}

export function buildVerifyUrl(token: string): string {
  return `${getBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildInviteUrl(token: string): string {
  return `${getBaseUrl()}/accept-invitation?token=${encodeURIComponent(token)}`;
}

/** Reviewer share-link target — the unauthenticated feedback surface
 *  (`/r/:token`) a peer/mentor opens to leave comments on a shared item. */
export function buildReviewUrl(token: string): string {
  return `${getBaseUrl()}/r/${encodeURIComponent(token)}`;
}

/** One-tap "approve sign-in" link target for the email-2FA step-up
 *  (gap #2225). Lands on the frontend verifier page, which exchanges the
 *  signed token for a session via GET /api/auth/verify-2fa-link. */
export function buildTwoFactorApproveUrl(token: string): string {
  return `${getBaseUrl()}/auth/2fa-approve?token=${encodeURIComponent(token)}`;
}

// ============================================================================
// EMAIL LAYOUT + TEMPLATES
// ============================================================================

const LAYOUT_HEADER = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>hired.video</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;">
          <tr>
            <td style="background-color:#1e293b;padding:24px 32px;border-radius:8px 8px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="https://hired.video" style="text-decoration:none;display:inline-block;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                        <tr>
                          <td style="vertical-align:middle;padding-right:10px;line-height:0;">
                            <img src="https://hired.video/pwa-64x64.png" alt="" width="32" height="32" style="display:block;border:0;outline:none;text-decoration:none;" />
                          </td>
                          <td style="vertical-align:middle;">
                            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">hired.video</span>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#374151;">`;

const LAYOUT_FOOTER = `            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:24px 32px;border-radius:0 0 8px 8px;border-top:1px solid #e5e7eb;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <span style="color:#64748b;font-size:13px;">
                      &copy; {{Year}} <a href="https://hired.video" style="color:#2563eb;text-decoration:none;font-weight:600;">hired.video</a> &mdash; AI-Powered Video Resume Platform
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <a href="https://hired.video/settings" style="color:#3b82f6;text-decoration:none;font-size:12px;">Manage preferences</a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <span style="color:#9ca3af;font-size:11px;">
                      This is a transactional email. You cannot unsubscribe from essential account notifications.
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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

// ============================================================================
// TEMPLATE RENDERING
// ============================================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(body: string, vars: Record<string, string>): string {
  let html = LAYOUT_HEADER + body + LAYOUT_FOOTER;
  html = html.replaceAll("{{Year}}", new Date().getFullYear().toString());
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return html;
}

// ============================================================================
// PUBLIC EMAIL FUNCTIONS
// ============================================================================

export async function sendVerificationEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const html = render(VERIFY_EMAIL_BODY, { RecipientName: recipientName, VerifyUrl: buildVerifyUrl(token) });
  await provider.send({ to, subject: "Verify your email – hired.video", html });
}

/** Notify a SuperAdmin that a user flagged content for review. Best-effort;
 *  the inbox fan-out remains the source of truth, this is the heads-up. */
export async function sendModerationFlagEmail(
  to: string,
  params: {
    reporterName: string;
    entityLabel: string;
    reasonLabel: string;
    entityId: string;
    notes?: string | null;
  },
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const queueUrl = `${getBaseUrl()}/admin/moderation`;
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
        <a href="${queueUrl}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open moderation queue</a>
      </p>
    </div>`;
  await provider.send({ to, subject: `[Moderation] ${params.entityLabel} flagged — ${params.reasonLabel}`, html });
}

export async function sendResendVerificationEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const html = render(RESEND_VERIFY_BODY, { RecipientName: recipientName, VerifyUrl: buildVerifyUrl(token) });
  await provider.send({ to, subject: "Verify your email – hired.video", html });
}

export async function sendPasswordResetEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const html = render(PASSWORD_RESET_BODY, { RecipientName: recipientName, ResetUrl: buildPasswordResetUrl(token) });
  await provider.send({ to, subject: "Password reset request – hired.video", html });
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
  // ApproveBlock is injected raw (its href is a server-built, signed URL),
  // so it goes in BEFORE render() — which would otherwise escape the URL.
  const approveBlock = approveToken
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;">
                <tr>
                  <td style="color:#374151;padding-bottom:16px;">Tap below to finish signing in on this device:</td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <a href="${buildTwoFactorApproveUrl(approveToken)}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Approve sign-in</a>
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
  const html = render(TWO_FACTOR_BODY.replace("{{ApproveBlock}}", approveBlock), {
    RecipientName: recipientName,
    TwoFactorCode: code,
    CodeExpiryMinutes: String(expiryMinutes),
  });
  // Lead the subject with the code so it lands in the phone's lock-screen
  // notification + inbox preview — the recipient can read it (and iOS can
  // offer it as a one-tap AutoFill) without opening the email.
  await provider.send({ to, subject: `${code} is your hired.video verification code`, html });
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

export async function sendMagicLinkEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping magic link email");
    return;
  }
  const magicUrl = `${getBaseUrl()}/auth/magic-link?token=${encodeURIComponent(token)}`;
  const html = render(MAGIC_LINK_BODY, { RecipientName: recipientName, MagicUrl: magicUrl });
  await provider.send({ to, subject: "Your sign-in link for hired.video", html });
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

export async function sendEmailChangeCurrent(
  to: string,
  recipientName: string,
  currentEmail: string,
  newEmail: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping email-change-current email");
    return;
  }
  const confirmUrl = `${getBaseUrl()}/security/email-change/confirm-current?token=${encodeURIComponent(token)}`;
  const html = render(EMAIL_CHANGE_CURRENT_BODY, {
    RecipientName: recipientName,
    CurrentEmail: currentEmail,
    NewEmail: newEmail,
    ConfirmUrl: confirmUrl,
  });
  await provider.send({ to, subject: "Confirm your hired.video email change", html });
}

export async function sendEmailChangeNew(
  to: string,
  currentEmail: string,
  token: string,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping email-change-new email");
    return;
  }
  const verifyUrl = `${getBaseUrl()}/security/email-change/confirm-new?token=${encodeURIComponent(token)}`;
  const html = render(EMAIL_CHANGE_NEW_BODY, {
    CurrentEmail: currentEmail,
    VerifyUrl: verifyUrl,
  });
  await provider.send({ to, subject: "Verify your new hired.video email", html });
}

// ============================================================================
// PLAN UPGRADE EMAIL
// ============================================================================

/** Pro tools highlighted in the upgrade email. Kept in sync with the
 *  frontend tools-catalog (tier: "pro") — update both if the catalog changes. */
const PRO_TOOLS = [
  { name: "Resume Optimizer", description: "AI-powered ATS optimization & keyword suggestions", href: "/Tools/ResumeOptimizer" },
  { name: "Job-Resume Match", description: "Score your resume against any job description", href: "/Tools/JobResumeMatch" },
  { name: "Resume Tailor", description: "Tailor your resume to a specific job posting", href: "/Tools/ResumeTailor" },
  { name: "Value Proposition", description: "Craft compelling career value statements", href: "/Tools/ValueProposition" },
  { name: "Profile Audit", description: "AI-rewritten headline & summary with side-by-side preview", href: "/tools/profile-audit" },
];

const UNLIMITED_TOOLS_EXTRA = [
  { name: "Unlimited AI Tokens", description: "No monthly cap — run as many tools as you need", href: "/tools" },
];

function buildProToolRows(planSlug: string, baseUrl: string): string {
  const tools = planSlug === "unlimited"
    ? [...PRO_TOOLS, ...UNLIMITED_TOOLS_EXTRA]
    : PRO_TOOLS;

  return tools.map((t) => `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="32" valign="top" style="padding-right: 12px; padding-top: 2px;">
                          <span style="display:inline-block;width:24px;height:24px;background:#eff6ff;border-radius:50%;text-align:center;line-height:24px;font-size:14px;">&#10003;</span>
                        </td>
                        <td>
                          <a href="${baseUrl}${t.href}" style="color:#1d4ed8;font-weight:600;text-decoration:none;font-size:15px;">${t.name}</a>
                          <div style="color:#6b7280;font-size:13px;margin-top:2px;">${t.description}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join("");
}

const PLAN_UPGRADE_BODY = `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <span style="color: #111827; font-size: 24px; font-weight: bold;">Your plan has been upgraded 🎉</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="color: #6b7280; font-size: 14px;">You now have access to powerful new tools.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #111827; padding-bottom: 8px;">Hi {{RecipientName}},</td>
                </tr>
                <tr>
                  <td style="color: #374151; line-height: 1.6; padding-bottom: 20px;">
                    Great news — your hired.video account has been upgraded to the <strong style="color:#1d4ed8;">{{PlanName}} plan</strong>.
                    {{ExpiryNote}}
                  </td>
                </tr>
              </table>

              <!-- Plan details card -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%); border-radius: 8px; padding: 20px; border: 1px solid #dbeafe;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="color: #1e40af; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 12px;">Your new plan details</td>
                      </tr>
                      <tr>
                        <td>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td style="color: #374151; font-size: 14px; padding: 4px 0;"><strong>Plan:</strong></td>
                              <td style="color: #1d4ed8; font-size: 14px; font-weight: 600; padding: 4px 0; text-align: right;">{{PlanName}}</td>
                            </tr>
                            <tr>
                              <td style="color: #374151; font-size: 14px; padding: 4px 0;"><strong>Monthly AI tokens:</strong></td>
                              <td style="color: #059669; font-size: 14px; font-weight: 600; padding: 4px 0; text-align: right;">{{TokenLimit}}</td>
                            </tr>
                            {{ExpiryRow}}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Pro tools list -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 8px;">
                <tr>
                  <td style="color: #111827; font-size: 18px; font-weight: bold; padding-bottom: 4px;">Tools now available to you</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; font-size: 14px; padding-bottom: 16px;">These AI-powered tools are unlocked on your new plan:</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
                {{ProToolRows}}
              </table>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="{{DashboardUrl}}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">
                      Go to my dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #9ca3af; font-size: 13px; padding-top: 8px;">
                    Questions? Reply to this email or visit <a href="{{DashboardUrl}}/help" style="color: #2563eb;">our help centre</a>.
                  </td>
                </tr>
              </table>`;

export interface PlanUpgradeEmailParams {
  to: string;
  recipientName: string;
  planSlug: string;
  planName: string;
  /** null = unlimited */
  monthlyTokenLimit: number | null;
  /** null = permanent */
  expiresAt: Date | null;
}

export async function sendPlanUpgradeEmail(params: PlanUpgradeEmailParams): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping plan upgrade email");
    return;
  }

  const baseUrl = getBaseUrl();

  // Token limit display
  const tokenLimit =
    params.monthlyTokenLimit === null || params.monthlyTokenLimit === -1
      ? "Unlimited"
      : params.monthlyTokenLimit >= 1_000_000
      ? `${(params.monthlyTokenLimit / 1_000_000).toFixed(params.monthlyTokenLimit % 1_000_000 === 0 ? 0 : 1)}M / month`
      : params.monthlyTokenLimit >= 1_000
      ? `${(params.monthlyTokenLimit / 1_000).toFixed(params.monthlyTokenLimit % 1_000 === 0 ? 0 : 1)}K / month`
      : `${params.monthlyTokenLimit} / month`;

  // Expiry note + row
  const expiryNote = params.expiresAt
    ? `This upgrade is active until <strong>${params.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>, after which your account reverts to its previous plan.`
    : "";

  const expiryRow = params.expiresAt
    ? `<tr>
         <td style="color: #374151; font-size: 14px; padding: 4px 0;"><strong>Active until:</strong></td>
         <td style="color: #d97706; font-size: 14px; font-weight: 600; padding: 4px 0; text-align: right;">${params.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
       </tr>`
    : "";

  const proToolRows = buildProToolRows(params.planSlug, baseUrl);

  // render() escapes all vars — build the tool rows separately and inject
  // them raw (they contain trusted HTML we constructed above).
  let body = PLAN_UPGRADE_BODY
    .replace("{{ProToolRows}}", proToolRows)
    .replace("{{ExpiryNote}}", expiryNote)
    .replace("{{ExpiryRow}}", expiryRow);

  const html = render(body, {
    RecipientName: recipientName(params.recipientName),
    PlanName: params.planName,
    TokenLimit: tokenLimit,
    DashboardUrl: baseUrl,
  });

  await provider.send({
    to: params.to,
    subject: `Your hired.video account has been upgraded to ${params.planName}`,
    html,
  });
}

// Helper — avoids a name collision with the outer `recipientName` param.
function recipientName(name: string): string { return name; }

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
  const profileUrl = `${getBaseUrl()}${publicProfilePath(input.senderProfileId)}`;
  const html = render(CONNECTION_REQUEST_BODY, {
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
  if (url.startsWith("/")) return `${getBaseUrl()}${url}`;
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
                    <a href="${ctaUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;">View</a>
                  </td>
                </tr>
              </table>`
    : "";
  // render() escapes only the {{vars}}; the CTA block is trusted markup
  // appended to the body (its href is validated above).
  const html = render(NOTIFICATION_TITLE_BLOCK + ctaBlock, {
    Title: input.title,
    Message: input.message,
  });
  return { subject: input.title, html };
}

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
 *  line breaks; render() HTML-escapes every var. */
export function buildContactConfirmationEmail(
  input: ContactConfirmationEmailInput,
): { subject: string; html: string } {
  const html = render(CONTACT_CONFIRMATION_BODY, {
    RecipientName: input.recipientName.trim() || "there",
    InquiryLabel: input.inquiryLabel.toLowerCase(),
    Subject: input.subject,
    Message: input.message,
    ReplyEmail: getEnv("EMAIL_FROM") || "info@hired.video",
  });
  return { subject: "We've received your message – hired.video", html };
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

export async function sendConnectionRequestEmail(
  to: string,
  recipientName: string,
  senderName: string,
  senderProfileId: string,
  requestMessage?: string | null,
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping connection request email");
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
  const html = render(REVIEW_INVITE_BODY, {
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

export async function sendReviewInviteEmail(input: ReviewInviteEmailInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping review invite email");
    return;
  }
  const { to, subject, html } = buildReviewInviteEmail(input);
  await provider.send({ to, subject, html });
}

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
  const html = render(INVITE_BODY, {
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

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    console.warn("[email] No provider configured — skipping invitation email");
    return;
  }
  const { subject, html } = buildInvitationEmail(input);
  await provider.send({ to: input.to, subject, html });
}

/** Send a one-off email with an arbitrary subject + HTML body. Bypasses
 *  the templated senders above for cases like client-error reports where
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
    console.warn("[email] No provider configured — skipping generic email to", to);
    return false;
  }
  await provider.send({ to, subject, html, fromName });
  return true;
}
