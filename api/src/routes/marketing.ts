import { Hono } from "hono";
import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { emitNotification } from "../services/notifications/notificationService.js";
import { sendContactConfirmationEmail } from "../services/adapters/email.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

export const marketingRoutes = new Hono<AppEnv>();

const CreateLeadSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Campaign CRUD lives in the canonical engine: CampaignService, surfaced at
// /api/admin/campaigns (SuperAdmin) and /api/communication/email-campaigns
// (user-facing). The duplicate stub endpoints that used to live here had no
// consumers and were removed in migration 0204's consolidation.

// ─── Leads ────────────────────────────────────────────────────────────────────

marketingRoutes.get("/leads", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  // Optional ?source=contact_panel — when present matches `source LIKE
  // 'contact_panel:%'` so the SuperAdmin Contact Inquiries page can ask for
  // just the in-app inquiry submissions without dragging in landing-page
  // lead-magnet capture. ?status filters by triage state.
  const url = new URL(c.req.url);
  const sourcePrefix = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const conditions: SQL[] = [];
  if (sourcePrefix) {
    conditions.push(like(schema.marketingLeads.source, `${sourcePrefix}%`));
  }
  if (status) {
    conditions.push(eq(schema.marketingLeads.status, status));
  }
  const baseQuery = db.select().from(schema.marketingLeads);
  const filtered = conditions.length > 0
    ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : baseQuery;
  const leads = await filtered
    .orderBy(desc(schema.marketingLeads.createdAt))
    .limit(200);
  return c.json(success(leads), 200);
});

marketingRoutes.post("/leads", async (c) => {
  // This endpoint is public-ish — allows unauthenticated lead capture from landing pages.
  const body = await c.req.json().catch(() => null);
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  const db = getDb();
  const [lead] = await db
    .insert(schema.marketingLeads)
    .values({
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      company: parsed.data.company ?? null,
      source: parsed.data.source ?? "api",
      notes: parsed.data.notes ?? null,
      metadata: parsed.data.metadata ?? null,
    } as any)
    .returning();
  return c.json(success(lead), 201);
});

// ─── Contact Panel ────────────────────────────────────────────────────────────
//
// Single endpoint behind every "Contact us" / "Talk to us" / "Request a demo"
// CTA across the app — Pricing, About hero, Help-tab contact options, etc. The
// frontend uses one shared <ContactPanel> slide-out form per the DRY rule
// (`feedback_extract_on_duplication`). All inquiries land in `marketing_leads`
// (source = "contact_panel:<inquiryType>") so the existing /api/marketing/leads
// admin list already covers triage, and every super_admin gets a real-time
// `notifications` row so inquiries surface in the bell dropdown.

const CONTACT_INQUIRY_TYPES = [
  "sales",
  "demo",
  "nonprofit_discount",
  "support",
  "general",
] as const;

const ContactInquirySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  company: z.string().max(255).optional(),
  phone: z.string().max(64).optional(),
  inquiryType: z.enum(CONTACT_INQUIRY_TYPES).default("general"),
  subject: z.string().min(1).max(255),
  message: z.string().min(1).max(5000),
  page: z.string().max(255).optional(),
  role: z.string().max(64).optional(),
});

const INQUIRY_LABEL: Record<(typeof CONTACT_INQUIRY_TYPES)[number], string> = {
  sales: "Sales / pricing question",
  demo: "Demo request",
  nonprofit_discount: "Non-profit / startup discount",
  support: "Support request",
  general: "General inquiry",
};

marketingRoutes.post("/contact", async (c) => {
  // Public — anyone can submit a contact inquiry. Authed users get name/email
  // prefilled client-side from the auth context but the server still trusts
  // whatever the form submits (the contact form is a freeform mailbox, not an
  // identity assertion).
  const body = await c.req.json().catch(() => null);
  const parsed = ContactInquirySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const data = parsed.data;
  const db = getDb();

  const [lead] = await db
    .insert(schema.marketingLeads)
    .values({
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
    } as any)
    .returning();

  // Notify every super_admin through the unified dispatcher
  // (`emitNotification`) so the inquiry not only lands in the bell/inbox
  // (/outreach Inbox tab + CommunicationHub — both read `notifications`)
  // but ALSO fans out a preference-gated Web Push + email heads-up. The
  // previous raw `notifications` insert here persisted a bell row only —
  // it never pushed or emailed, so off-screen admins missed inquiries.
  // Best-effort: a dispatch failure must not swallow the inquiry itself.
  try {
    const admins = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        or(
          eq(schema.users.role, USER_ROLES.SUPER_ADMIN),
          eq(schema.users.isSuperAdmin, true),
        ),
      );
    if (admins.length > 0) {
      // Compose a single message string that carries every actionable
      // field: who, where to reach them, what they asked. Cap at 1900
      // chars so it fits comfortably under the typical notifications.message
      // text-column rendering budget without truncation in the inbox row.
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
          recipientIds: admins.map((a) => a.id),
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
          // Opt into the email channel — this is a real-time staff heads-up,
          // not routine inbox noise. Still pref-gated per recipient.
          email: true,
        },
      );
    }
  } catch {
    // Swallow — the lead row is the authoritative record.
  }

  // Acknowledge the submitter with a confirmation receipt so they have a
  // durable record of what they sent (the on-screen toast vanishes on
  // reload). Best-effort: the lead + admin notification already landed.
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

  return c.json(success({ id: lead?.id ?? null }), 201);
});

marketingRoutes.patch("/leads/:id/status", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const newStatus = typeof body.status === "string" ? body.status : null;
  if (!newStatus) return c.json(error("VALIDATION_ERROR", "status is required"), 400);
  const db = getDb();
  const updates: Record<string, unknown> = { status: newStatus, updatedAt: new Date() };
  if (newStatus === "converted") updates.convertedAt = new Date();
  const [updated] = await db
    .update(schema.marketingLeads)
    .set(updates as any)
    .where(eq(schema.marketingLeads.id, c.req.param("id")))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Lead not found"), 404);
  return c.json(success(updated), 200);
});

marketingRoutes.all("*", (c) =>
  c.json(
    { success: false, error: { code: "NOT_FOUND", message: "Marketing route not found" }, timestamp: new Date().toISOString() },
    404,
  ),
);
