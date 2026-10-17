/**
 * Email service barrel — transactional emails for hired.video.
 *
 * Kept as the stable entry point for route files and existing callers.
 * New code should import from the focused modules directly:
 *   email/transport.ts        — EmailProvider seam + SendPulse transport
 *   email/templates/*.ts      — pure builders on ONE layout (templates/layout.ts)
 *   email/senders/*.ts        — domain senders (auth, billing-notices, network,
 *                               team, recruiting, notifications)
 *   utils/public-urls.ts      — link builders embedded in emails
 */

export {
  getEmailProvider,
  __setEmailProvider,
  type EmailMessage,
  type EmailProvider,
} from "./email/transport.js";

export {
  buildVerifyUrl,
  buildPasswordResetUrl,
  buildInviteUrl,
  buildReviewUrl,
  buildTwoFactorApproveUrl,
  buildCandidateVideoConsentUrl,
} from "../../utils/public-urls.js";

export {
  buildScreeningInvitationEmail,
  buildCandidateVideoConsentEmail,
  type ScreeningInvitationEmailInput,
  type CandidateVideoConsentEmailInput,
} from "./email/templates/recruiting.js";
export { type PlanUpgradeEmailParams } from "./email/templates/billing.js";
export {
  buildConnectionRequestEmail,
  buildReviewInviteEmail,
  type ConnectionRequestEmailInput,
  type ReviewInviteEmailInput,
} from "./email/templates/network.js";
export { buildInvitationEmail, type InvitationEmailInput } from "./email/templates/team.js";
export {
  buildNotificationEmail,
  buildContactConfirmationEmail,
  type ContactConfirmationEmailInput,
} from "./email/templates/notifications.js";

export {
  sendVerificationEmail,
  sendResendVerificationEmail,
  sendPasswordResetEmail,
  sendTwoFactorEmail,
  sendMagicLinkEmail,
  sendEmailChangeCurrent,
  sendEmailChangeNew,
} from "./email/senders/auth.js";
export { sendPlanUpgradeEmail } from "./email/senders/billing-notices.js";
export { sendConnectionRequestEmail, sendReviewInviteEmail } from "./email/senders/network.js";
export { sendInvitationEmail } from "./email/senders/team.js";
export { sendScreeningInvitationEmail, sendCandidateVideoConsentEmail } from "./email/senders/recruiting.js";
export {
  sendNotificationEmail,
  sendContactConfirmationEmail,
  sendModerationFlagEmail,
  sendGenericEmail,
} from "./email/senders/notifications.js";
