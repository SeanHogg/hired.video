import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const marketingRoutes = new Hono<{ Variables: Variables }>();

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
