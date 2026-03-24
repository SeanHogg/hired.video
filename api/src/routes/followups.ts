import { Hono } from "hono";
import { and, desc, eq, asc } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";

export const followUpRoutes = new Hono<{ Variables: Variables }>();

const StepSchema = z.object({
  stepOrder: z.number().int().min(1),
  delayDays: z.number().int().min(0),
  subject: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1),
  channel: z.enum(["email", "message"]).default("email"),
});

const CreateSequenceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  steps: z.array(StepSchema).min(1).max(10),
});

const EnrollSchema = z.object({
  sequenceId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  recipientUserId: z.string().uuid().optional(),
  context: z.record(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/followups/sequences
// ---------------------------------------------------------------------------
followUpRoutes.get("/sequences", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const sequences = await db
    .select()
    .from(schema.followUpSequences)
    .where(eq(schema.followUpSequences.userId, userId))
    .orderBy(desc(schema.followUpSequences.createdAt));

  return c.json(success(sequences), 200);
});

// ---------------------------------------------------------------------------
// POST /api/followups/sequences — create sequence + steps
// ---------------------------------------------------------------------------
followUpRoutes.post("/sequences", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSequenceSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [sequence] = await db
    .insert(schema.followUpSequences)
    .values({ userId, name: parsed.data.name, description: parsed.data.description })
    .returning();

  const steps = await db
    .insert(schema.followUpSteps)
    .values(
      parsed.data.steps.map((s) => ({
        sequenceId: sequence.id,
        stepOrder: s.stepOrder,
        delayDays: s.delayDays,
        subject: s.subject,
        bodyTemplate: s.bodyTemplate,
        channel: s.channel,
      })),
    )
    .returning();

  return c.json(success({ ...sequence, steps }), 201);
});

// ---------------------------------------------------------------------------
// GET /api/followups/sequences/:id — sequence + steps + enrollment count
// ---------------------------------------------------------------------------
followUpRoutes.get("/sequences/:id", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [sequence] = await db
    .select()
    .from(schema.followUpSequences)
    .where(and(eq(schema.followUpSequences.id, c.req.param("id")), eq(schema.followUpSequences.userId, userId)))
    .limit(1);

  if (!sequence) return c.json(error("NOT_FOUND", "Sequence not found"), 404);

  const steps = await db
    .select()
    .from(schema.followUpSteps)
    .where(eq(schema.followUpSteps.sequenceId, sequence.id))
    .orderBy(asc(schema.followUpSteps.stepOrder));

  const enrollments = await db
    .select()
    .from(schema.followUpEnrollments)
    .where(eq(schema.followUpEnrollments.sequenceId, sequence.id))
    .orderBy(desc(schema.followUpEnrollments.createdAt));

  return c.json(success({ ...sequence, steps, enrollments }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/followups/sequences/:id
// ---------------------------------------------------------------------------
followUpRoutes.delete("/sequences/:id", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [sequence] = await db
    .select({ id: schema.followUpSequences.id })
    .from(schema.followUpSequences)
    .where(and(eq(schema.followUpSequences.id, c.req.param("id")), eq(schema.followUpSequences.userId, userId)))
    .limit(1);

  if (!sequence) return c.json(error("NOT_FOUND", "Sequence not found"), 404);

  await db.delete(schema.followUpSequences).where(eq(schema.followUpSequences.id, sequence.id));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/followups/enroll — enroll a recipient in a sequence
// ---------------------------------------------------------------------------
followUpRoutes.post("/enroll", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = EnrollSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();

  // Verify sequence belongs to this user
  const [sequence] = await db
    .select({ id: schema.followUpSequences.id })
    .from(schema.followUpSequences)
    .where(and(eq(schema.followUpSequences.id, parsed.data.sequenceId), eq(schema.followUpSequences.userId, userId)))
    .limit(1);

  if (!sequence) return c.json(error("NOT_FOUND", "Sequence not found"), 404);

  // Get first step to schedule next send
  const [firstStep] = await db
    .select()
    .from(schema.followUpSteps)
    .where(eq(schema.followUpSteps.sequenceId, sequence.id))
    .orderBy(asc(schema.followUpSteps.stepOrder))
    .limit(1);

  const nextSendAt = firstStep
    ? new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000)
    : null;

  const [enrollment] = await db
    .insert(schema.followUpEnrollments)
    .values({
      sequenceId: parsed.data.sequenceId,
      userId,
      recipientEmail: parsed.data.recipientEmail,
      recipientName: parsed.data.recipientName,
      recipientUserId: parsed.data.recipientUserId,
      context: parsed.data.context ?? {},
      status: "active",
      currentStep: 0,
      nextSendAt: nextSendAt ?? undefined,
    })
    .returning();

  return c.json(success(enrollment), 201);
});

// ---------------------------------------------------------------------------
// GET /api/followups/enrollments — list this user's enrollments
// ---------------------------------------------------------------------------
followUpRoutes.get("/enrollments", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const enrollments = await db
    .select()
    .from(schema.followUpEnrollments)
    .where(eq(schema.followUpEnrollments.userId, userId))
    .orderBy(desc(schema.followUpEnrollments.createdAt));

  return c.json(success(enrollments), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/followups/enrollments/:id/pause  |  /resume  |  /cancel
// ---------------------------------------------------------------------------
followUpRoutes.patch("/enrollments/:id/:action", requirePremium("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const action = c.req.param("action");
  if (!["pause", "resume", "cancel"].includes(action))
    return c.json(error("VALIDATION_ERROR", "action must be pause | resume | cancel"), 400);

  const db = getDb();
  const [enrollment] = await db
    .select({ id: schema.followUpEnrollments.id })
    .from(schema.followUpEnrollments)
    .where(and(eq(schema.followUpEnrollments.id, c.req.param("id")), eq(schema.followUpEnrollments.userId, userId)))
    .limit(1);

  if (!enrollment) return c.json(error("NOT_FOUND", "Enrollment not found"), 404);

  const statusMap: Record<string, string> = { pause: "paused", resume: "active", cancel: "unsubscribed" };
  const [updated] = await db
    .update(schema.followUpEnrollments)
    .set({ status: statusMap[action], updatedAt: new Date() })
    .where(eq(schema.followUpEnrollments.id, enrollment.id))
    .returning();

  return c.json(success(updated), 200);
});

followUpRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Follow-up route not found" } }, 404),
);
