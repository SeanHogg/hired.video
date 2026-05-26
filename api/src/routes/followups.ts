import { Hono } from "hono";
import { and, desc, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";

export const followUpRoutes = new Hono<AppEnv>();

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
  sequenceId: UuidLikeSchema,
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  recipientUserId: UuidLikeSchema.optional(),
  context: z.record(z.string(), z.string()).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/followups/sequences
// ---------------------------------------------------------------------------
followUpRoutes.get("/sequences", requirePro("Automated Follow-ups"), async (c) => {
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
followUpRoutes.post("/sequences", requirePro("Automated Follow-ups"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSequenceSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [sequence] = await db
    .insert(schema.followUpSequences)
    .values({ userId, name: parsed.data.name, description: parsed.data.description } as any)
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
followUpRoutes.get("/sequences/:id", requirePro("Automated Follow-ups"), async (c) => {
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
followUpRoutes.delete("/sequences/:id", requirePro("Automated Follow-ups"), async (c) => {
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
followUpRoutes.post("/enroll", requirePro("Automated Follow-ups"), async (c) => {
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
    } as any)
    .returning();

  return c.json(success(enrollment), 201);
});

// ---------------------------------------------------------------------------
// GET /api/followups/enrollments — list this user's enrollments
// ---------------------------------------------------------------------------
followUpRoutes.get("/enrollments", requirePro("Automated Follow-ups"), async (c) => {
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
followUpRoutes.patch("/enrollments/:id/:action", requirePro("Automated Follow-ups"), async (c) => {
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
    .set({ status: statusMap[action], updatedAt: new Date() } as any)
    .where(eq(schema.followUpEnrollments.id, enrollment.id))
    .returning();

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// POST /api/followups/trigger — behaviour-triggered sequence enrollment (#29)
// Enrolls a recipient in a named sequence based on a trigger event.
// Body: { trigger: string, sequenceName?: string, sequenceId?: string,
//         recipientEmail: string, recipientName?: string, context?: object }
// ---------------------------------------------------------------------------
const TriggerSchema = z.object({
  trigger: z.string().min(1).max(100), // e.g. "signup", "job_match", "trial_expiring"
  sequenceId: UuidLikeSchema.optional(),
  sequenceName: z.string().optional(), // fallback: match by sequence name
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  recipientUserId: UuidLikeSchema.optional(),
  context: z.record(z.string(), z.string()).optional(),
});

followUpRoutes.post("/trigger", requirePro("Smart Outreach"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = TriggerSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { trigger, sequenceId, sequenceName, recipientEmail, recipientName, recipientUserId, context } = parsed.data;
  const db = getDb();

  // Resolve the sequence: by ID first, then by name matching the trigger
  let sequence: { id: string } | undefined;

  if (sequenceId) {
    const [row] = await db
      .select({ id: schema.followUpSequences.id })
      .from(schema.followUpSequences)
      .where(and(eq(schema.followUpSequences.id, sequenceId), eq(schema.followUpSequences.userId, userId), eq(schema.followUpSequences.isActive, true)))
      .limit(1);
    sequence = row;
  }

  if (!sequence && sequenceName) {
    const [row] = await db
      .select({ id: schema.followUpSequences.id })
      .from(schema.followUpSequences)
      .where(and(eq(schema.followUpSequences.name, sequenceName), eq(schema.followUpSequences.userId, userId), eq(schema.followUpSequences.isActive, true)))
      .limit(1);
    sequence = row;
  }

  if (!sequence) {
    // Auto-match by trigger name as sequence name
    const [row] = await db
      .select({ id: schema.followUpSequences.id })
      .from(schema.followUpSequences)
      .where(and(eq(schema.followUpSequences.name, trigger), eq(schema.followUpSequences.userId, userId), eq(schema.followUpSequences.isActive, true)))
      .limit(1);
    sequence = row;
  }

  if (!sequence) {
    return c.json(error("NOT_FOUND", `No active sequence found for trigger "${trigger}"`), 404);
  }

  // Prevent duplicate active enrollments for the same recipient + sequence
  const [existing] = await db
    .select({ id: schema.followUpEnrollments.id })
    .from(schema.followUpEnrollments)
    .where(and(
      eq(schema.followUpEnrollments.sequenceId, sequence.id),
      eq(schema.followUpEnrollments.recipientEmail, recipientEmail),
      eq(schema.followUpEnrollments.status, "active"),
    ))
    .limit(1);

  if (existing) {
    return c.json(success({ enrolled: false, reason: "Already enrolled in this sequence", enrollmentId: existing.id }), 200);
  }

  // Get the first step to compute nextSendAt
  const [firstStep] = await db
    .select({ delayDays: schema.followUpSteps.delayDays })
    .from(schema.followUpSteps)
    .where(eq(schema.followUpSteps.sequenceId, sequence.id))
    .orderBy(asc(schema.followUpSteps.stepOrder))
    .limit(1);

  const nextSendAt = firstStep
    ? new Date(Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000)
    : new Date();

  const [enrollment] = await db
    .insert(schema.followUpEnrollments)
    .values({
      sequenceId: sequence.id,
      userId,
      recipientEmail,
      recipientName: recipientName ?? null,
      recipientUserId: recipientUserId ?? null,
      context: { trigger, ...(context ?? {}) } as any,
      status: "active",
      currentStep: 0,
      nextSendAt,
    } as any)
    .returning();

  return c.json(success({ enrolled: true, enrollmentId: enrollment.id, nextSendAt: nextSendAt.toISOString() }), 201);
});

followUpRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Follow-up route not found" } }, 404),
);
