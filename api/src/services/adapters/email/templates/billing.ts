/**
 * Billing notice templates: the plan-upgrade confirmation.
 * Pure builder — `{{Var}}` values are escaped by renderEmail(); the raw
 * tool rows / expiry blocks escape their own dynamic values.
 */

import { escapeHtml } from "../../../../../../shared/html-escape.js";
import { emailLinkBaseUrl } from "../../../../utils/public-urls.js";
import { renderEmail, type RenderedEmail } from "./layout.js";

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
                          <a href="${escapeHtml(baseUrl)}${t.href}" style="color:#1d4ed8;font-weight:600;text-decoration:none;font-size:15px;">${t.name}</a>
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

function formatTokenLimit(monthlyTokenLimit: number | null): string {
  return monthlyTokenLimit === null || monthlyTokenLimit === -1
    ? "Unlimited"
    : monthlyTokenLimit >= 1_000_000
    ? `${(monthlyTokenLimit / 1_000_000).toFixed(monthlyTokenLimit % 1_000_000 === 0 ? 0 : 1)}M / month`
    : monthlyTokenLimit >= 1_000
    ? `${(monthlyTokenLimit / 1_000).toFixed(monthlyTokenLimit % 1_000 === 0 ? 0 : 1)}K / month`
    : `${monthlyTokenLimit} / month`;
}

function formatExpiryDate(expiresAt: Date): string {
  return escapeHtml(expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
}

/** Pure builder: render the plan-upgrade email without sending. */
export function buildPlanUpgradeEmail(params: PlanUpgradeEmailParams): RenderedEmail {
  const baseUrl = emailLinkBaseUrl();
  const tokenLimit = formatTokenLimit(params.monthlyTokenLimit);

  // Expiry note + row
  const expiryNote = params.expiresAt
    ? `This upgrade is active until <strong>${formatExpiryDate(params.expiresAt)}</strong>, after which your account reverts to its previous plan.`
    : "";

  const expiryRow = params.expiresAt
    ? `<tr>
         <td style="color: #374151; font-size: 14px; padding: 4px 0;"><strong>Active until:</strong></td>
         <td style="color: #d97706; font-size: 14px; font-weight: 600; padding: 4px 0; text-align: right;">${formatExpiryDate(params.expiresAt)}</td>
       </tr>`
    : "";

  const proToolRows = buildProToolRows(params.planSlug, baseUrl);

  // renderEmail() escapes all vars — the tool rows / expiry blocks are
  // trusted markup we constructed above, injected raw.
  const body = PLAN_UPGRADE_BODY
    .replace("{{ProToolRows}}", proToolRows)
    .replace("{{ExpiryNote}}", expiryNote)
    .replace("{{ExpiryRow}}", expiryRow);

  const html = renderEmail(body, {
    RecipientName: params.recipientName,
    PlanName: params.planName,
    TokenLimit: tokenLimit,
    DashboardUrl: baseUrl,
  });

  return { subject: `Your hired.video account has been upgraded to ${params.planName}`, html };
}
