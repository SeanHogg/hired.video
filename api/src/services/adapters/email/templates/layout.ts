/**
 * The ONE transactional-email layout (header + footer wrapper) and the
 * `{{Var}}` renderer every templated email goes through.
 *
 * Escaping contract: `renderEmail()` HTML-escapes every `{{Var}}` value via
 * the shared `escapeHtml`. Pre-built markup blocks that a template splices
 * in raw MUST escape their own interpolated values before splicing.
 */

import { escapeHtml } from "../../../../../../shared/html-escape.js";

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

export interface EmailLayoutOptions {
  /** Substitute the footer's `{{Year}}` placeholder (default true). The
   *  screening invitation historically skipped this step and ships the
   *  literal placeholder — kept as-is so output stays byte-identical. */
  substituteYear?: boolean;
}

/** Wrap a body fragment in the shared header/footer chrome. */
export function emailLayout(body: string, options: EmailLayoutOptions = {}): string {
  const html = LAYOUT_HEADER + body + LAYOUT_FOOTER;
  if (options.substituteYear === false) return html;
  return html.replaceAll("{{Year}}", new Date().getFullYear().toString());
}

/** Wrap `body` in the layout, then replace each `{{Key}}` with the
 *  HTML-escaped value (in insertion order, after the year). */
export function renderEmail(body: string, vars: Record<string, string>): string {
  let html = emailLayout(body);
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return html;
}

/** A rendered email ready for the transport. */
export interface RenderedEmail {
  subject: string;
  html: string;
}
