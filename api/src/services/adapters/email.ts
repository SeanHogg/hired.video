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

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider | null {
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
): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) return;
  const html = render(TWO_FACTOR_BODY, {
    RecipientName: recipientName,
    TwoFactorCode: code,
    CodeExpiryMinutes: String(expiryMinutes),
  });
  await provider.send({ to, subject: "Your verification code – hired.video", html });
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
  const profileUrl = `${getBaseUrl()}/people/${encodeURIComponent(input.senderProfileId)}`;
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
