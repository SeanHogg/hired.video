/**
 * Partner lifecycle emails. Reuses the generic notification email sender
 * (services/adapters/email.ts) which no-ops safely when no provider is
 * configured (dev/preview). Recipients:
 *   - request  → the SuperAdmin approval inbox (+ a receipt to the requester)
 *   - approved → the partner owner
 *   - rejected → the partner owner
 */
import { sendNotificationEmail } from "../adapters/email/senders/notifications.js";
import type { PartnerView } from "./partners.js";
import { publicAppBaseUrl } from "../../utils/public-urls.js";
// Approval requests go to the shared SuperAdmin recipient (overridable via SUPERADMIN_EMAIL).
import { superAdminEmail } from "../observability/superAdminAlert.js";

export async function notifyAdminOfPartnerRequest(
  partner: PartnerView,
  requester: { name: string; email: string },
): Promise<void> {
  const reviewUrl = `${publicAppBaseUrl()}/admin/partners`;
  await sendNotificationEmail({
    to: superAdminEmail(),
    title: "New partner access request",
    message:
      `${requester.name} (${requester.email}) requested partner API access for "${partner.name}".` +
      (partner.websiteUrl ? ` Website: ${partner.websiteUrl}.` : "") +
      (partner.requestNote ? ` Note: ${partner.requestNote}` : ""),
    url: reviewUrl,
  });
}

export async function sendPartnerRequestReceipt(requester: {
  name: string;
  email: string;
}): Promise<void> {
  await sendNotificationEmail({
    to: requester.email,
    title: "We received your partner access request",
    message:
      "Thanks for requesting Hired.Video partner access. Our team will review it and email you once it's approved. " +
      "You can then generate your API key from Settings → Partner Access.",
    url: `${publicAppBaseUrl()}/settings`,
  });
}

export async function notifyOwnerApproved(
  partner: PartnerView,
  owner: { email: string },
): Promise<void> {
  await sendNotificationEmail({
    to: owner.email,
    title: "Your partner access is approved",
    message:
      `"${partner.name}" is now an approved Hired.Video partner. ` +
      "Head to Settings → Partner Access to generate your API key and install the @seanhogg/hired-video-sdk package.",
    url: `${publicAppBaseUrl()}/settings`,
  });
}

export async function notifyOwnerRejected(
  partner: PartnerView,
  owner: { email: string },
): Promise<void> {
  await sendNotificationEmail({
    to: owner.email,
    title: "Update on your partner access request",
    message:
      `We're unable to approve partner access for "${partner.name}" at this time. ` +
      "If you think this was a mistake, reply to this email and we'll take another look.",
    url: `${publicAppBaseUrl()}/settings`,
  });
}
