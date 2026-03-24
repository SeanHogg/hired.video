import { Hono } from "hono";
import { and, desc, eq, count } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";

export const hiringOnboardingRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// Offer Letters
// ---------------------------------------------------------------------------

const CreateOfferSchema = z.object({
  candidateName: z.string().min(1).max(255),
  candidateEmail: z.string().email(),
  candidateUserId: z.string().uuid().optional(),
  jobTitle: z.string().min(1).max(255),
  companyName: z.string().min(1).max(255),
  salary: z.number().positive().optional(),
  currency: z.string().length(3).default("USD"),
  startDate: z.string().datetime().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  bodyHtml: z.string().min(1),
});

// GET /api/hiring/offers
hiringOnboardingRoutes.get("/offers", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const offers = await db
    .select()
    .from(schema.offerLetters)
    .where(eq(schema.offerLetters.createdByUserId, userId))
    .orderBy(desc(schema.offerLetters.createdAt));

  return c.json(success(offers), 200);
});

// POST /api/hiring/offers
hiringOnboardingRoutes.post("/offers", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateOfferSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

  const [offer] = await db
    .insert(schema.offerLetters)
    .values({
      createdByUserId: userId,
      candidateUserId: parsed.data.candidateUserId,
      candidateName: parsed.data.candidateName,
      candidateEmail: parsed.data.candidateEmail,
      jobTitle: parsed.data.jobTitle,
      companyName: parsed.data.companyName,
      salary: parsed.data.salary ? String(parsed.data.salary) : undefined,
      currency: parsed.data.currency,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      expiresAt,
      bodyHtml: parsed.data.bodyHtml,
      status: "draft",
    })
    .returning();

  return c.json(success(offer), 201);
});

// GET /api/hiring/offers/:id
hiringOnboardingRoutes.get("/offers/:id", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [offer] = await db
    .select()
    .from(schema.offerLetters)
    .where(and(eq(schema.offerLetters.id, c.req.param("id")), eq(schema.offerLetters.createdByUserId, userId)))
    .limit(1);

  if (!offer) return c.json(error("NOT_FOUND", "Offer letter not found"), 404);
  return c.json(success(offer), 200);
});

// PATCH /api/hiring/offers/:id/send
hiringOnboardingRoutes.patch("/offers/:id/send", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [offer] = await db
    .select({ id: schema.offerLetters.id, status: schema.offerLetters.status })
    .from(schema.offerLetters)
    .where(and(eq(schema.offerLetters.id, c.req.param("id")), eq(schema.offerLetters.createdByUserId, userId)))
    .limit(1);

  if (!offer) return c.json(error("NOT_FOUND", "Offer letter not found"), 404);
  if (offer.status !== "draft") return c.json(error("CONFLICT", "Offer has already been sent"), 409);

  const [updated] = await db
    .update(schema.offerLetters)
    .set({ status: "sent", updatedAt: new Date() })
    .where(eq(schema.offerLetters.id, offer.id))
    .returning();

  return c.json(success(updated), 200);
});

// PATCH /api/hiring/offers/:id/accept  — candidate accepts (public token-based endpoint in future)
hiringOnboardingRoutes.patch("/offers/:id/accept", async (c) => {
  const db = getDb();
  const [offer] = await db
    .select({ id: schema.offerLetters.id, status: schema.offerLetters.status })
    .from(schema.offerLetters)
    .where(eq(schema.offerLetters.id, c.req.param("id")))
    .limit(1);

  if (!offer) return c.json(error("NOT_FOUND", "Offer not found"), 404);
  if (!["sent", "viewed"].includes(offer.status))
    return c.json(error("CONFLICT", "Offer cannot be accepted in its current state"), 409);

  const body = await c.req.json().catch(() => ({}));
  const [updated] = await db
    .update(schema.offerLetters)
    .set({ status: "accepted", signedAt: new Date(), signatureData: body.signatureData ?? null, updatedAt: new Date() })
    .where(eq(schema.offerLetters.id, offer.id))
    .returning();

  return c.json(success(updated), 200);
});

// PATCH /api/hiring/offers/:id/decline
hiringOnboardingRoutes.patch("/offers/:id/decline", async (c) => {
  const db = getDb();
  const [offer] = await db
    .select({ id: schema.offerLetters.id, status: schema.offerLetters.status })
    .from(schema.offerLetters)
    .where(eq(schema.offerLetters.id, c.req.param("id")))
    .limit(1);

  if (!offer) return c.json(error("NOT_FOUND", "Offer not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const [updated] = await db
    .update(schema.offerLetters)
    .set({ status: "declined", declineReason: body.reason ?? null, updatedAt: new Date() })
    .where(eq(schema.offerLetters.id, offer.id))
    .returning();

  return c.json(success(updated), 200);
});

// DELETE /api/hiring/offers/:id
hiringOnboardingRoutes.delete("/offers/:id", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [offer] = await db
    .select({ id: schema.offerLetters.id })
    .from(schema.offerLetters)
    .where(and(eq(schema.offerLetters.id, c.req.param("id")), eq(schema.offerLetters.createdByUserId, userId)))
    .limit(1);

  if (!offer) return c.json(error("NOT_FOUND", "Offer letter not found"), 404);
  await db.delete(schema.offerLetters).where(eq(schema.offerLetters.id, offer.id));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Onboarding Checklists
// ---------------------------------------------------------------------------

const CreateChecklistSchema = z.object({
  candidateName: z.string().min(1),
  candidateUserId: z.string().uuid().optional(),
  offerLetterId: z.string().uuid().optional(),
  jobTitle: z.string().optional(),
  startDate: z.string().datetime().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    dueDate: z.string().datetime().optional(),
  })).min(1),
});

// GET /api/hiring/checklists
hiringOnboardingRoutes.get("/checklists", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const checklists = await db
    .select()
    .from(schema.onboardingChecklists)
    .where(eq(schema.onboardingChecklists.createdByUserId, userId))
    .orderBy(desc(schema.onboardingChecklists.createdAt));

  return c.json(success(checklists), 200);
});

// POST /api/hiring/checklists
hiringOnboardingRoutes.post("/checklists", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateChecklistSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [checklist] = await db
    .insert(schema.onboardingChecklists)
    .values({
      createdByUserId: userId,
      candidateUserId: parsed.data.candidateUserId,
      offerLetterId: parsed.data.offerLetterId,
      candidateName: parsed.data.candidateName,
      jobTitle: parsed.data.jobTitle,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      status: "pending",
      completionPercentage: "0",
    })
    .returning();

  const tasks = await db
    .insert(schema.onboardingTasks)
    .values(
      parsed.data.tasks.map((t, i) => ({
        checklistId: checklist.id,
        title: t.title,
        description: t.description,
        category: t.category ?? "general",
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        sortOrder: String(i + 1),
      })),
    )
    .returning();

  return c.json(success({ ...checklist, tasks }), 201);
});

// GET /api/hiring/checklists/:id
hiringOnboardingRoutes.get("/checklists/:id", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [checklist] = await db
    .select()
    .from(schema.onboardingChecklists)
    .where(and(eq(schema.onboardingChecklists.id, c.req.param("id")), eq(schema.onboardingChecklists.createdByUserId, userId)))
    .limit(1);

  if (!checklist) return c.json(error("NOT_FOUND", "Checklist not found"), 404);

  const tasks = await db
    .select()
    .from(schema.onboardingTasks)
    .where(eq(schema.onboardingTasks.checklistId, checklist.id));

  return c.json(success({ ...checklist, tasks }), 200);
});

// PATCH /api/hiring/checklists/:id/tasks/:taskId/complete
hiringOnboardingRoutes.patch("/checklists/:id/tasks/:taskId/complete", requirePremium("Hiring & Onboarding"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [checklist] = await db
    .select({ id: schema.onboardingChecklists.id })
    .from(schema.onboardingChecklists)
    .where(and(eq(schema.onboardingChecklists.id, c.req.param("id")), eq(schema.onboardingChecklists.createdByUserId, userId)))
    .limit(1);

  if (!checklist) return c.json(error("NOT_FOUND", "Checklist not found"), 404);

  await db
    .update(schema.onboardingTasks)
    .set({ isCompleted: true, completedAt: new Date(), completedByUserId: userId })
    .where(and(eq(schema.onboardingTasks.id, c.req.param("taskId")), eq(schema.onboardingTasks.checklistId, checklist.id)));

  // Recompute completion percentage
  const allTasks = await db.select().from(schema.onboardingTasks).where(eq(schema.onboardingTasks.checklistId, checklist.id));
  const completedCount = allTasks.filter((t) => t.isCompleted).length;
  const pct = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 0;
  const newStatus = pct === 100 ? "completed" : pct > 0 ? "in_progress" : "pending";

  const [updated] = await db
    .update(schema.onboardingChecklists)
    .set({ completionPercentage: String(pct), status: newStatus, updatedAt: new Date() })
    .where(eq(schema.onboardingChecklists.id, checklist.id))
    .returning();

  return c.json(success({ checklist: updated, completionPercentage: pct }), 200);
});

hiringOnboardingRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Hiring & onboarding route not found" } }, 404),
);
