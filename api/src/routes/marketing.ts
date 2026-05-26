import { Hono } from "hono";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

export const marketingRoutes = new Hono<AppEnv>();

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  status: z.enum(["draft", "scheduled", "sent", "cancelled"]).default("draft"),
  scheduledAt: z.string().datetime().optional(),
});

const CreateLeadSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

marketingRoutes.get("/campaigns", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const campaigns = await db
    .select()
    .from(schema.emailCampaigns)
    .orderBy(desc(schema.emailCampaigns.createdAt))
    .limit(100);
  return c.json(success(campaigns), 200);
});

marketingRoutes.post("/campaigns", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  const db = getDb();
  const [campaign] = await db
    .insert(schema.emailCampaigns)
    .values({
      name: parsed.data.name,
      subject: parsed.data.subject,
      status: parsed.data.status,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    } as any)
    .returning();
  return c.json(success(campaign), 201);
});

marketingRoutes.get("/campaigns/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.emailCampaigns)
    .where(eq(schema.emailCampaigns.id, c.req.param("id")))
    .limit(1);
  if (!campaign) return c.json(error("NOT_FOUND", "Campaign not found"), 404);

  const recipients = await db
    .select()
    .from(schema.emailCampaignRecipients)
    .where(eq(schema.emailCampaignRecipients.campaignId, campaign.id));

  return c.json(success({ ...campaign, recipients }), 200);
});

marketingRoutes.patch("/campaigns/:id/status", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const newStatus = typeof body.status === "string" ? body.status : null;
  if (!newStatus) return c.json(error("VALIDATION_ERROR", "status is required"), 400);
  const db = getDb();
  const [updated] = await db
    .update(schema.emailCampaigns)
    .set({ status: newStatus, updatedAt: new Date() } as any)
    .where(eq(schema.emailCampaigns.id, c.req.param("id")))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  return c.json(success(updated), 200);
});

// ─── Leads ────────────────────────────────────────────────────────────────────

marketingRoutes.get("/leads", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const leads = await db
    .select()
    .from(schema.marketingLeads)
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

  // Notify every super_admin so an inquiry surfaces in the bell dropdown the
  // next time they hit the app. Best-effort: a notification failure must not
  // swallow the inquiry itself.
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
      await db.insert(schema.notifications).values(
        admins.map((a) => ({
          userId: a.id,
          type: "contact_inquiry",
          title: `New ${INQUIRY_LABEL[data.inquiryType]}`,
          message: `${data.name}${data.company ? ` (${data.company})` : ""}: ${data.subject}`,
          data: {
            leadId: lead?.id ?? null,
            email: data.email,
            inquiryType: data.inquiryType,
            page: data.page ?? null,
          },
        })) as any,
      );
    }
  } catch {
    // Swallow — the lead row is the authoritative record.
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
