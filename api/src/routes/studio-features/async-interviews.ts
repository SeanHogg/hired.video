/**
 * Studio features — async employer video interviews. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { ok, fail, studioAsyncInterviews, studioAsyncResponses } from "./shared.js";

export const asyncInterviewRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  10. ASYNC EMPLOYER VIDEO INTERVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/async-interview — recruiter creates an async interview
asyncInterviewRoutes.post("/async-interview", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title: z.string().min(1).max(200),
    instructions: z.string().max(2000).optional(),
    candidateEmail: z.string().email().optional(),
    candidateId: UuidLikeSchema.optional(),
    jobId: UuidLikeSchema.optional(),
    questions: z.array(z.object({
      id: z.string(),
      text: z.string().min(1),
      maxDurationSec: z.number().min(30).max(300).default(120),
      required: z.boolean().default(true),
    })).min(1).max(10),
    deadline: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const inviteToken = crypto.randomUUID();
  const db = getDb();
  const [interview] = await db.insert(studioAsyncInterviews).values({
    recruiterId: user.sub,
    candidateId: parsed.data.candidateId ?? null,
    candidateEmail: parsed.data.candidateEmail ?? null,
    jobId: parsed.data.jobId ?? null,
    title: parsed.data.title,
    instructions: parsed.data.instructions ?? null,
    questions: parsed.data.questions,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    inviteToken,
    status: "pending",
  } as any).returning();

  const inviteUrl = `https://hired.video/interview/${inviteToken}`;

  return c.json(ok({
    id: interview.id,
    inviteToken,
    inviteUrl,
    status: "pending",
  }), 201);
});

// GET /api/studio/async-interview/invite/:token — candidate views interview invite
asyncInterviewRoutes.get("/async-interview/invite/:token", async (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const [interview] = await db.select().from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.inviteToken, token))
    .limit(1);

  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);
  if (interview.status === "expired") return c.json(fail("EXPIRED", "Interview has expired"), 410);

  return c.json(ok({
    id: interview.id,
    title: interview.title,
    instructions: interview.instructions,
    questions: interview.questions,
    deadline: interview.deadline,
    status: interview.status,
  }));
});

// POST /api/studio/async-interview/:id/respond — candidate submits a video response
asyncInterviewRoutes.post("/async-interview/:id/respond", async (c) => {
  const user = c.var.user;
  const interviewId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    questionId: z.string(),
    recordingId: UuidLikeSchema.optional(),
    videoUrl: z.string().optional(),
    transcription: z.string().optional(),
    durationMs: z.number().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [response] = await db.insert(studioAsyncResponses).values({
    interviewId,
    candidateId: user.sub,
    questionId: parsed.data.questionId,
    recordingId: parsed.data.recordingId ?? null,
    videoUrl: parsed.data.videoUrl ?? null,
    durationMs: parsed.data.durationMs ?? null,
    transcription: parsed.data.transcription ?? null,
    status: "recorded",
  } as any).returning();

  // Update interview status
  await db.update(studioAsyncInterviews).set({
    status: "in_progress",
    updatedAt: new Date(),
  } as any).where(eq(studioAsyncInterviews.id, interviewId));

  return c.json(ok(response), 201);
});

// POST /api/studio/async-interview/:id/submit — candidate marks interview as submitted
asyncInterviewRoutes.post("/async-interview/:id/submit", async (c) => {
  const user = c.var.user;
  const interviewId = c.req.param("id");
  const db = getDb();

  // Update all responses to submitted
  await db.update(studioAsyncResponses).set({ status: "submitted" } as any)
    .where(and(eq(studioAsyncResponses.interviewId, interviewId), eq(studioAsyncResponses.candidateId, user.sub)));

  await db.update(studioAsyncInterviews).set({
    status: "submitted",
    updatedAt: new Date(),
  } as any).where(eq(studioAsyncInterviews.id, interviewId));

  return c.json(ok({ status: "submitted" }));
});

// GET /api/studio/async-interviews — list interviews (for recruiter)
asyncInterviewRoutes.get("/async-interviews", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const interviews = await db.select().from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.recruiterId, user.sub))
    .orderBy(desc(studioAsyncInterviews.createdAt))
    .limit(50);

  return c.json(ok(interviews));
});

// GET /api/studio/async-interview/:id/responses — recruiter views candidate responses
asyncInterviewRoutes.get("/async-interview/:id/responses", async (c) => {
  const user = c.var.user;
  const interviewId = c.req.param("id");
  const db = getDb();

  // Verify recruiter owns this interview
  const [interview] = await db.select().from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, interviewId), eq(studioAsyncInterviews.recruiterId, user.sub)))
    .limit(1);

  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  const responses = await db.select().from(studioAsyncResponses)
    .where(eq(studioAsyncResponses.interviewId, interviewId))
    .orderBy(studioAsyncResponses.createdAt);

  return c.json(ok({ interview, responses }));
});
