/**
 * Email service — sends transactional emails via the SendPulse API.
 *
 * Templates are inlined (no filesystem reads) for Cloudflare Workers
 * compatibility. Branding is updated for hired.video.
 *
 * Environment variables (set as Wrangler secrets / vars):
 *   EMAIL_CLIENTID   — SendPulse Client ID
 *   EMAIL_SECRET     — SendPulse Client Secret
 *   EMAIL_FROM       — From address (default: info@hired.video)
 *   FRONTEND_URL / BASE_URL — Base URL for link generation
 */

// ============================================================================
// CONFIGURATION HELPERS
// ============================================================================

function getSendPulseCredentials(): { clientId: string; clientSecret: string } {
  const clientId =
    process.env.EMAIL_CLIENTID ||
    (globalThis as any).__ENV?.EMAIL_CLIENTID ||
    "";
  const clientSecret =
    process.env.EMAIL_SECRET ||
    (globalThis as any).__ENV?.EMAIL_SECRET ||
    "";

  return { clientId, clientSecret };
}

function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM ||
    (globalThis as any).__ENV?.EMAIL_FROM ||
    "info@hired.video"
  );
}

function getBaseUrl(): string {
  // FRONTEND_URL may be comma-separated (multiple CORS origins); use the first one.
  const frontendUrl =
    process.env.FRONTEND_URL || (globalThis as any).__ENV?.FRONTEND_URL || "";
  const first = frontendUrl.split(",")[0]?.trim();
  return first || "https://hired.video";
}

// ============================================================================
// EMAIL LAYOUT
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
                    <a href="https://hired.video" style="text-decoration:none;">
                      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                        <span style="color:#3b82f6;">&#9654;</span> hired.video
                      </span>
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

// ============================================================================
// TEMPLATE BODIES
// ============================================================================

/** Welcome + email verification (sent on registration) */
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

/** Resend verification (triggered by user request when already registered) */
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

/** Password reset request */
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

/** Two-factor authentication code */
const TWO_FACTOR_BODY = `
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
                <tr>
                  <td style="color:#374151;padding-bottom:16px;">Enter the following one-time code:</td>
                </tr>
              </table>

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

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color:#6b7280;font-size:14px;">If you did not request this code, you can safely ignore this email.</td>
                </tr>
              </table>`;

// ============================================================================
// RENDERING
// ============================================================================

function render(body: string, vars: Record<string, string>): string {
  let html = LAYOUT_HEADER + body + LAYOUT_FOOTER;
  html = html.replaceAll("{{Year}}", new Date().getFullYear().toString());
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return html;
}

/** Escape user-supplied values before embedding in HTML */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================================
// TRANSPORT (SendPulse)
// ============================================================================

let sendPulseTokenCache: { token: string; expiresAt: number } | null = null;

async function getSendPulseAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (sendPulseTokenCache && sendPulseTokenCache.expiresAt > now + 30_000) {
    return sendPulseTokenCache.token;
  }

  const { clientId, clientSecret } = getSendPulseCredentials();
  if (!clientId || !clientSecret) {
    console.warn("[email] SendPulse credentials not configured — skipping send");
    return null;
  }

  try {
    const res = await fetch("https://api.sendpulse.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[email] SendPulse token fetch failed:", res.status, text);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    const token = data.access_token;
    const expiresIn = Number(data.expires_in) || 3600;
    if (!token) {
      console.error("[email] SendPulse token response missing access_token", data);
      return null;
    }

    sendPulseTokenCache = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return token;
  } catch (err) {
    console.error("[email] Failed to fetch SendPulse access token:", err);
    return null;
  }
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const token = await getSendPulseAccessToken();
  if (!token) return;

  try {
    const res = await fetch("https://api.sendpulse.com/smtp/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: {
          subject,
          html,
          from: { email: getFromAddress(), name: "hired.video" },
          to: [{ email: to }],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[email] SendPulse API error:", res.status, text);
    }
  } catch (err) {
    console.error("[email] Failed to reach SendPulse API:", err);
  }
}

// ============================================================================
// URL BUILDERS
// ============================================================================

export function buildVerifyUrl(token: string): string {
  return `${getBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

// ============================================================================
// PUBLIC EMAIL FUNCTIONS
// ============================================================================

/** Registration welcome + email verification link */
export async function sendVerificationEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const verifyUrl = buildVerifyUrl(token);
  const html = render(VERIFY_EMAIL_BODY, { RecipientName: recipientName, VerifyUrl: verifyUrl });
  await send(to, "Verify your email – hired.video", html);
}

/** Resend verification (manually requested by logged-in user) */
export async function sendResendVerificationEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const verifyUrl = buildVerifyUrl(token);
  const html = render(RESEND_VERIFY_BODY, { RecipientName: recipientName, VerifyUrl: verifyUrl });
  await send(to, "Verify your email – hired.video", html);
}

/** Password reset link */
export async function sendPasswordResetEmail(
  to: string,
  recipientName: string,
  token: string,
): Promise<void> {
  const resetUrl = buildPasswordResetUrl(token);
  const html = render(PASSWORD_RESET_BODY, { RecipientName: recipientName, ResetUrl: resetUrl });
  await send(to, "Password reset request – hired.video", html);
}

/** Two-factor authentication code */
export async function sendTwoFactorEmail(
  to: string,
  recipientName: string,
  code: string,
  expiryMinutes = 10,
): Promise<void> {
  const html = render(TWO_FACTOR_BODY, {
    RecipientName: recipientName,
    TwoFactorCode: code,
    CodeExpiryMinutes: String(expiryMinutes),
  });
  await send(to, "Your verification code – hired.video", html);
}
