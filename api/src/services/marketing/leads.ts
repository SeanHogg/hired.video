/**
 * Marketing leads + the contact-panel inquiry behind routes/marketing.ts.
 * Every "Contact us" CTA lands in `marketing_leads`
 * (source = "contact_panel:<inquiryType>"), fans a notification out to every
 * super admin, and sends the submitter a confirmation receipt.
 * SQL lives in MarketingRepository / UsersRepository.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { MarketingRepository, type MarketingLeadRow } from "../../repositories/marketingRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { emitNotification } from "../notifications/notificationService.js";
import { sendContactConfirmationEmail } from "../adapters/email.js";

export const CONTACT_INQUIRY_TYPES = [
  "sales",
  "demo",
  "nonprofit_discount",
  "support",
  "general",
] as const;
export type ContactInquiryType = (typeof CONTACT_INQUIRY_TYPES)[number];

const INQUIRY_LABEL: Record<ContactInquiryType, string> = {
  sales: "Sales / pricing question",
  demo: "Demo request",
  nonprofit_discount: "Non-profit / startup discount",
  support: "Support request",
  general: "General inquiry",
};

export function listLeads(filters: { sourcePrefix: string | null; status: string | null }): Promise<MarketingLeadRow[]> {
  return new MarketingRepository(getDb()).listMarketingLeads(filters);
}

export function createLead(input: {
  email: string;
  name?: string;
  company?: string;
  source?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}): Promise<MarketingLeadRow> {
  return new MarketingRepository(getDb()).insertMarketingLead({
    email: input.email,
    name: input.name ?? null,
    company: input.company ?? null,
    source: input.source ?? "api",
    notes: input.notes ?? null,
    metadata: input.metadata ?? null,
  });
}

export function updateLeadStatus(id: string, status: string): Promise<MarketingLeadRow | null> {
  return new MarketingRepository(getDb()).updateMarketingLeadStatus(id, status);
}

export interface ContactInquiry {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  inquiryType: ContactInquiryType;
  subject: string;
  message: string;
  page?: string;
  role?: string;
}

/** Record the inquiry, notify super admins, receipt the submitter. Returns the lead id. */
export async function submitContactInquiry(data: ContactInquiry): Promise<string | null> {
  const db = getDb();
  const lead = await new MarketingRepository(db).insertMarketingLead({
    email: data.email,
    name: data.name,
    company: data.company ?? null,
    source: `contact_panel:${data.inquiryType}`,
    notes: data.message,
    metadata: {
      inquiryType: data.inquiryType,
      subject: data.subject,
      phone: data.phone ?? null,
      page: data.page ?? null,
      role: data.role ?? null,
      submittedAt: new Date().toISOString(),
    },
  });

  // Notify every super_admin through the unified dispatcher
  // (`emitNotification`) so the inquiry not only lands in the bell/inbox
  // (/outreach Inbox tab + CommunicationHub — both read `notifications`)
  // but ALSO fans out a preference-gated Web Push + email heads-up.
  // Best-effort: a dispatch failure must not swallow the inquiry itself.
  try {
    const adminIds = await new UsersRepository(db).findSuperAdminRoleOrFlagIds();
    if (adminIds.length > 0) {
      // One message string that carries every actionable field, capped at
      // 1900 chars so it fits the notifications.message rendering budget.
      const contactLine = [
        `From: ${data.name} <${data.email}>`,
        data.company ? `Company: ${data.company}` : null,
        data.phone ? `Phone: ${data.phone}` : null,
        data.page ? `Page: ${data.page}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const composed = `${contactLine}\nSubject: ${data.subject}\n\n${data.message}`;
      const message = composed.length > 1900
        ? composed.slice(0, 1900) + "…"
        : composed;

      await emitNotification(
        { repos: buildRepos(db) },
        {
          recipientIds: adminIds,
          type: "contact_inquiry",
          // The submitter is typically anonymous (not a platform user), so
          // the notification is system-originated.
          actor: null,
          title: `New ${INQUIRY_LABEL[data.inquiryType]} — ${data.subject}`,
          message,
          // Deep-link to the inbox where the inline lead-status actions live.
          url: "/outreach",
          extraData: {
            leadId: lead?.id ?? null,
            email: data.email,
            inquiryType: data.inquiryType,
            page: data.page ?? null,
          },
          // Opt into the email channel — a real-time staff heads-up. Still
          // pref-gated per recipient.
          email: true,
        },
      );
    }
  } catch {
    // Swallow — the lead row is the authoritative record.
  }

  // Acknowledge the submitter with a confirmation receipt (the on-screen
  // toast vanishes on reload). Best-effort.
  try {
    await sendContactConfirmationEmail({
      to: data.email,
      recipientName: data.name,
      inquiryLabel: INQUIRY_LABEL[data.inquiryType],
      subject: data.subject,
      message: data.message,
    });
  } catch {
    // Swallow — a confirmation-email failure must not fail the request.
  }

  return lead?.id ?? null;
}
