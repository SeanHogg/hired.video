/**
 * Recruiting templates: candidate screening invitation + candidate-video
 * consent request. Pure builders — every user value is escaped.
 */

import { escapeHtml } from "../../../../../../shared/html-escape.js";
import { buildCandidateVideoConsentUrl, buildScreeningUrl } from "../../../../utils/public-urls.js";
import { emailLayout, renderEmail } from "./layout.js";

export interface ScreeningInvitationEmailInput {
  to: string;
  candidateName?: string | null;
  token: string;
  message?: string | null;
}

/** Pure builder: the screening invitation. Rendered through the layout
 *  WITHOUT the `{{Year}}` pass, exactly as the pre-split sender did. */
export function buildScreeningInvitationEmail(
  input: ScreeningInvitationEmailInput,
): { subject: string; html: string } {
  const link = escapeHtml(buildScreeningUrl(input.token));
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
  const html = emailLayout(body, { substituteYear: false });
  return { subject: "Complete your application screening", html };
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
  // MessageBlock is pre-escaped markup, so it is spliced in after renderEmail().
  const html = renderEmail(CANDIDATE_VIDEO_CONSENT_BODY, {
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
