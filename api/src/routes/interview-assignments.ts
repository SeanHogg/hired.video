/**
 * Interview-assignment routes — the new tool surface that lets either
 * a job seeker (for self-practice / hand-off to AI Coach) or a recruiter
 * (for assigning to a candidate) generate skill-driven questions and
 * optionally assign them as an async interview.
 *
 * Why it lives in its own file (and not in studio-features.ts which
 * already owns studio_async_interviews CRUD): the studio-features file
 * is 2k+ lines and the legacy async-interview endpoints there have
 * different invariants (recruiter-only, video-only, no expiry, no
 * source provenance). Putting the new endpoints here keeps the new
 * shape (assignment vs invite, text-or-video, link expiry, resend) in
 * one reviewable surface, and lets the old endpoints stay backwards-
 * compatible for AsyncInterviewManager until that UI is migrated.
 *
 * Mounted at /api/interview-assignments — see app.ts.
 *
 * Endpoints:
 *   POST   /generate                      — extract skills + LLM questions (no DB write)
 *   POST   /assign                        — create assignment + send magic link
 *   POST   /:id/resend                    — regenerate token + re-send email
 *   GET    /mine                          — interviews I created + interviews assigned to me
 *   GET    /:id                           — full record (creator OR assigned candidate)
 *   POST   /:id/respond                   — submit one answer (text OR video)
 *   POST   /:id/submit                    — mark all responses submitted
 *   GET    /invite/:token (PUBLIC)        — sanitised invite preview
 *   POST   /claim/:token                  — claim invite (binds candidate_id to current user)
 */

import { Hono } from "hono";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { hasAnyLLMProviderKey, createLLMClient } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { buildRepos } from "../repositories/index.js";
import { extractSkills, type SkillExtractInput, type Skill } from "../services/resume/skills.js";
import { parsedJobFromRow } from "../services/job/match-handlers.js";
import { generateQuestionsFromSkills, type GeneratedQuestion } from "../services/interview/question-generator.js";
import { sendGenericEmail } from "../services/adapters/email.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import type { ResumeContent } from "../../../shared/resume.js";

const { studioAsyncInterviews, studioAsyncResponses, users } = schema;

export const interviewAssignmentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
interviewAssignmentRoutes.use("*", attachTokenBudget());

// ─── Helpers ────────────────────────────────────────────────────────────────

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

const ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
]);

function getFrontendBaseUrl(): string {
  const url = process.env.FRONTEND_URL ?? "";
  return url.split(",")[0]?.trim() || "https://hired.video";
}

function randomToken(byteLength = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const GenerateRequestSchema = z
  .object({
    resumeId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    content: z.string().min(20).max(20_000).optional(),
    sourceType: z.enum(["job", "resume"]).optional(),
    targetRole: z.string().max(120).optional(),
    seniority: z.string().max(40).optional(),
    style: z.enum(["behavioral", "technical", "mixed"]).default("mixed"),
    count: z.number().int().min(3).max(10).default(5),
    sourceContext: z.enum(["tool", "ai-coach", "career-360", "pipeline"]).default("tool"),
  })
  .refine(
    (v) => Boolean(v.resumeId) || Boolean(v.jobId) || Boolean(v.content) || Boolean(v.targetRole),
    { message: "Provide resumeId, jobId, content, or targetRole" },
  );

const QuestionInputSchema = z.object({
  id: z.string(),
  text: z.string().min(8),
  category: z.string().optional(),
  maxDurationSec: z.number().int().min(30).max(300).default(120),
  required: z.boolean().default(true),
  skillLinks: z.array(z.string()).default([]),
});

const AssignRequestSchema = z.object({
  candidateEmail: z.string().email(),
  title: z.string().min(1).max(200).default("Interview Questions"),
  instructions: z.string().max(2000).optional(),
  questions: z.array(QuestionInputSchema).min(1).max(10),
  jobId: z.string().uuid().optional(),
  sourceResumeId: z.string().uuid().optional(),
  sourceContext: z.enum(["tool", "ai-coach", "career-360", "pipeline"]).default("tool"),
  targetRole: z.string().max(120).optional(),
  extractedSkills: z.array(z.any()).optional(),
  /** How long the magic link is valid (hours). */
  linkExpiryHours: z.number().int().min(1).max(720).default(168), // 7 days default
  /** How long the candidate has to submit responses once they open the link (hours). */
  responseWindowHours: z.number().int().min(1).max(720).default(72),
});

const RespondRequestSchema = z.object({
  questionId: z.string(),
  responseMode: z.enum(["text", "video"]),
  textAnswer: z.string().max(20_000).optional(),
  recordingId: z.string().uuid().optional(),
  videoUrl: z.string().optional(),
  durationMs: z.number().optional(),
  transcription: z.string().optional(),
});

// ─── Skill-extract input builder (mirrors skill-extractor.ts) ───────────────

async function buildSkillInputForUser(
  userId: string,
  body: z.infer<typeof GenerateRequestSchema>,
): Promise<SkillExtractInput | { error: { code: string; message: string; status: number } }> {
  if (body.resumeId) {
    const repos = buildRepos(getDb());
    const row = await repos.resumes.findByIdForOwner(body.resumeId, userId);
    if (!row?.content) {
      return { error: { code: "NOT_FOUND", message: "Resume not found", status: 404 } };
    }
    return { kind: "resume-json", content: row.content as ResumeContent };
  }
  if (body.jobId) {
    const repos = buildRepos(getDb());
    const row = await repos.jobs.findJobById(body.jobId);
    if (!row) {
      return { error: { code: "NOT_FOUND", message: "Job not found", status: 404 } };
    }
    return {
      kind: "job-json",
      job: parsedJobFromRow(row as unknown as Record<string, unknown>),
    };
  }
  if (body.content) {
    return {
      kind: "text",
      sourceType: body.sourceType ?? "resume",
      text: body.content,
    };
  }
  // Pure-targetRole path — no source to extract from. Return a sentinel
  // empty input; the caller will skip extraction and ask the LLM to
  // build "role-fit" questions from the target only.
  return { kind: "text", sourceType: "job", text: body.targetRole ?? "" };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. GENERATE — extract skills + build questions in one shot, no DB write
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/generate", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to generate questions"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const skillInput = await buildSkillInputForUser(user.sub, parsed.data);
  if ("error" in skillInput) {
    return c.json(fail(skillInput.error.code, skillInput.error.message), skillInput.error.status as 400 | 404 | 401);
  }

  const llm = hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, user) : null;

  // Pure-target path — caller supplied targetRole only with no resume/job/
  // content. Skip extraction and let the LLM build role-fit questions from
  // the title alone (skills array is empty, prompt rebalances to "role-fit").
  let skills: Skill[] = [];
  if (parsed.data.resumeId || parsed.data.jobId || parsed.data.content) {
    const extracted = await extractSkills(llm, skillInput);
    skills = extracted.skills;
  }

  const questions = await generateQuestionsFromSkills(c.env, user, {
    skills,
    targetRole: parsed.data.targetRole,
    seniority: parsed.data.seniority,
    style: parsed.data.style,
    count: parsed.data.count,
  });

  return c.json(
    ok({
      skills,
      questions,
      sourceContext: parsed.data.sourceContext,
      sourceResumeId: parsed.data.resumeId ?? null,
      sourceJobId: parsed.data.jobId ?? null,
      targetRole: parsed.data.targetRole ?? null,
    }),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ASSIGN — create a magic-link interview and email it
//    Strict for assign: existing job_seeker matched → assignment_type=assign
//    Lenient for invite: no matching user → assignment_type=invite
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/assign", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to assign"), 401);
  if (!user.roles?.some((r) => ASSIGNABLE_ROLES.has(r))) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can assign interviews to candidates"), 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = AssignRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const email = parsed.data.candidateEmail.toLowerCase().trim();

  // Strict-assign path: look up an existing job_seeker by email. If found,
  // bind candidate_id. If not, fall back to invite mode (claim-on-signup).
  const [candidateRow] = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const candidateExistsAsJobSeeker =
    candidateRow !== undefined && candidateRow.role === USER_ROLES.JOB_SEEKER;
  const assignmentType: "assign" | "invite" = candidateExistsAsJobSeeker ? "assign" : "invite";

  if (candidateRow && !candidateExistsAsJobSeeker) {
    // Email matches a non-seeker (recruiter / employer / admin). Refuse — a
    // recruiter shouldn't be assigning interviews to other recruiters, and
    // promoting their role on a magic-link claim would be a privilege
    // escalation surprise.
    return c.json(
      fail(
        "INVALID_CANDIDATE_ROLE",
        "That email belongs to a non-job-seeker account. Interview assignments can only go to job seekers.",
      ),
      400,
    );
  }

  const token = randomToken(24);
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + parsed.data.linkExpiryHours * 3_600_000);
  const responseDeadline = new Date(now.getTime() + parsed.data.responseWindowHours * 3_600_000);

  const [created] = await db
    .insert(studioAsyncInterviews)
    .values({
      recruiterId: user.sub,
      candidateId: candidateExistsAsJobSeeker ? candidateRow.id : null,
      candidateEmail: email,
      jobId: parsed.data.jobId ?? null,
      title: parsed.data.title,
      instructions: parsed.data.instructions ?? null,
      questions: parsed.data.questions,
      deadline: responseDeadline,
      status: "pending",
      inviteToken: token,
      inviteTokenExpiresAt: tokenExpiresAt,
      questionResponseDeadline: responseDeadline,
      sourceResumeId: parsed.data.sourceResumeId ?? null,
      sourceContext: parsed.data.sourceContext,
      targetRole: parsed.data.targetRole ?? null,
      extractedSkills: parsed.data.extractedSkills ?? null,
      assignmentType,
    } as any)
    .returning();

  await sendInviteEmail({
    to: email,
    recipientName: candidateRow?.name?.split(/\s+/)[0] ?? "there",
    token,
    title: parsed.data.title,
    expiresAt: tokenExpiresAt,
    assignmentType,
  });

  return c.json(
    ok({
      id: created.id,
      inviteToken: token,
      inviteUrl: `${getFrontendBaseUrl()}/interview/${token}`,
      assignmentType,
      inviteTokenExpiresAt: tokenExpiresAt.toISOString(),
      questionResponseDeadline: responseDeadline.toISOString(),
      candidateBound: candidateExistsAsJobSeeker,
    }),
    201,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. RESEND — regenerate the token + re-send the email
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/:id/resend", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to resend"), 401);

  const id = c.req.param("id");
  const db = getDb();
  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, id), eq(studioAsyncInterviews.recruiterId, user.sub)))
    .limit(1);

  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);
  if (interview.status === "submitted" || interview.status === "reviewed") {
    return c.json(fail("INVALID_STATE", "Interview already submitted"), 400);
  }
  if (!interview.candidateEmail) {
    return c.json(fail("NO_EMAIL", "This interview has no candidate email on file"), 400);
  }

  // Reset the magic link clock; question response deadline is left alone
  // so the recruiter can extend without re-mailing if they want.
  const newToken = randomToken(24);
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 3_600_000); // 7d default on resend
  const [updated] = await db
    .update(studioAsyncInterviews)
    .set({
      inviteToken: newToken,
      inviteTokenExpiresAt: tokenExpiresAt,
      resendCount: sql`${studioAsyncInterviews.resendCount} + 1`,
      lastResentAt: new Date(),
      updatedAt: new Date(),
      // If status was 'expired', un-expire it — the recruiter just unblocked the candidate.
      status: interview.status === "expired" ? "pending" : interview.status,
    } as any)
    .where(eq(studioAsyncInterviews.id, id))
    .returning();

  await sendInviteEmail({
    to: interview.candidateEmail,
    recipientName: "there",
    token: newToken,
    title: interview.title,
    expiresAt: tokenExpiresAt,
    assignmentType: (interview.assignmentType as "assign" | "invite" | null) ?? "assign",
    isResend: true,
  });

  return c.json(
    ok({
      id: updated.id,
      inviteToken: newToken,
      inviteUrl: `${getFrontendBaseUrl()}/interview/${newToken}`,
      inviteTokenExpiresAt: tokenExpiresAt.toISOString(),
      resendCount: updated.resendCount,
    }),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MINE — interviews I created (as creator) + assigned to me (as candidate)
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.get("/mine", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to list"), 401);

  const db = getDb();
  const [createdByMe, assignedToMe] = await Promise.all([
    db
      .select()
      .from(studioAsyncInterviews)
      .where(eq(studioAsyncInterviews.recruiterId, user.sub))
      .orderBy(desc(studioAsyncInterviews.createdAt))
      .limit(100),
    db
      .select()
      .from(studioAsyncInterviews)
      .where(
        or(
          eq(studioAsyncInterviews.candidateId, user.sub),
          and(
            // Email-matched but not yet claimed
            eq(studioAsyncInterviews.candidateEmail, user.email ?? ""),
            sql`${studioAsyncInterviews.candidateId} IS NULL`,
          ),
        ),
      )
      .orderBy(desc(studioAsyncInterviews.createdAt))
      .limit(100),
  ]);

  return c.json(ok({ createdByMe, assignedToMe }));
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DETAIL — creator OR assigned candidate sees the full interview + answers
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const id = c.req.param("id");
  const db = getDb();

  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.id, id))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  const isCreator = interview.recruiterId === user.sub;
  const isCandidate = interview.candidateId === user.sub;
  if (!isCreator && !isCandidate) {
    return c.json(fail("FORBIDDEN", "Not your interview"), 403);
  }

  const responses = await db
    .select()
    .from(studioAsyncResponses)
    .where(eq(studioAsyncResponses.interviewId, id))
    .orderBy(studioAsyncResponses.createdAt);

  return c.json(ok({ interview, responses, viewerRole: isCreator ? "creator" : "candidate" }));
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. RESPOND — candidate submits one answer (text OR video)
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/:id/respond", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to answer"), 401);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = RespondRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid response payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.id, id))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  if (interview.candidateId !== user.sub) {
    return c.json(fail("FORBIDDEN", "This interview was not assigned to you"), 403);
  }
  if (
    interview.questionResponseDeadline &&
    interview.questionResponseDeadline.getTime() < Date.now()
  ) {
    return c.json(fail("EXPIRED", "The response window for this interview has closed"), 410);
  }

  if (parsed.data.responseMode === "text" && !parsed.data.textAnswer?.trim()) {
    return c.json(fail("VALIDATION_ERROR", "textAnswer is required for text responses"), 400);
  }
  if (
    parsed.data.responseMode === "video" &&
    !parsed.data.videoUrl &&
    !parsed.data.recordingId
  ) {
    return c.json(fail("VALIDATION_ERROR", "videoUrl or recordingId is required for video responses"), 400);
  }

  // Upsert by (interview, candidate, question) so a candidate can re-record.
  const [existing] = await db
    .select()
    .from(studioAsyncResponses)
    .where(
      and(
        eq(studioAsyncResponses.interviewId, id),
        eq(studioAsyncResponses.candidateId, user.sub),
        eq(studioAsyncResponses.questionId, parsed.data.questionId),
      ),
    )
    .limit(1);

  let saved;
  if (existing) {
    [saved] = await db
      .update(studioAsyncResponses)
      .set({
        recordingId: parsed.data.recordingId ?? null,
        videoUrl: parsed.data.videoUrl ?? null,
        durationMs: parsed.data.durationMs ?? null,
        transcription: parsed.data.transcription ?? null,
        textAnswer: parsed.data.textAnswer ?? null,
        responseMode: parsed.data.responseMode,
        status: "recorded",
      } as any)
      .where(eq(studioAsyncResponses.id, existing.id))
      .returning();
  } else {
    [saved] = await db
      .insert(studioAsyncResponses)
      .values({
        interviewId: id,
        candidateId: user.sub,
        questionId: parsed.data.questionId,
        recordingId: parsed.data.recordingId ?? null,
        videoUrl: parsed.data.videoUrl ?? null,
        durationMs: parsed.data.durationMs ?? null,
        transcription: parsed.data.transcription ?? null,
        textAnswer: parsed.data.textAnswer ?? null,
        responseMode: parsed.data.responseMode,
        status: "recorded",
      } as any)
      .returning();
  }

  await db
    .update(studioAsyncInterviews)
    .set({ status: "in_progress", updatedAt: new Date() } as any)
    .where(eq(studioAsyncInterviews.id, id));

  return c.json(ok(saved), 201);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. SUBMIT — candidate marks all answers as final
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/:id/submit", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const id = c.req.param("id");
  const db = getDb();

  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.id, id))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);
  if (interview.candidateId !== user.sub) {
    return c.json(fail("FORBIDDEN", "This interview was not assigned to you"), 403);
  }

  await db
    .update(studioAsyncResponses)
    .set({ status: "submitted" } as any)
    .where(
      and(
        eq(studioAsyncResponses.interviewId, id),
        eq(studioAsyncResponses.candidateId, user.sub),
      ),
    );

  await db
    .update(studioAsyncInterviews)
    .set({ status: "submitted", updatedAt: new Date() } as any)
    .where(eq(studioAsyncInterviews.id, id));

  return c.json(ok({ status: "submitted" }));
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. INVITE PREVIEW (PUBLIC) — sanitised view for the magic-link landing
//     page. Returns enough for the page to render the title + question
//     count + signup-vs-login affordance without leaking response data.
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const db = getDb();
  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.inviteToken, token))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview link not found"), 404);

  const expired =
    interview.inviteTokenExpiresAt !== null &&
    interview.inviteTokenExpiresAt !== undefined &&
    interview.inviteTokenExpiresAt.getTime() < Date.now();

  return c.json(
    ok({
      id: interview.id,
      title: interview.title,
      instructions: interview.instructions,
      questionCount: Array.isArray(interview.questions) ? (interview.questions as any[]).length : 0,
      questions: interview.questions, // full question list — the candidate needs to see them
      candidateEmail: interview.candidateEmail,
      assignmentType: interview.assignmentType ?? "assign",
      candidateBound: Boolean(interview.candidateId),
      deadline: interview.deadline,
      questionResponseDeadline: interview.questionResponseDeadline,
      inviteTokenExpiresAt: interview.inviteTokenExpiresAt,
      status: interview.status,
      expired,
      targetRole: interview.targetRole,
    }),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. CLAIM — authenticated job_seeker claims the invite, binding
//    candidate_id to themselves. Required before /respond will succeed
//    on invite-type assignments.
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/claim/:token", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to claim"), 401);
  if (!user.roles?.includes(USER_ROLES.JOB_SEEKER)) {
    return c.json(
      fail("INVALID_ROLE", "Only job seekers can claim an interview assignment"),
      403,
    );
  }

  const token = c.req.param("token");
  const db = getDb();
  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(eq(studioAsyncInterviews.inviteToken, token))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview link not found"), 404);

  if (
    interview.inviteTokenExpiresAt &&
    interview.inviteTokenExpiresAt.getTime() < Date.now()
  ) {
    return c.json(fail("EXPIRED", "This invite link has expired"), 410);
  }

  // If already bound to another user, refuse — only the addressed
  // job_seeker can claim. (We compare by email so anyone with the link
  // who happens to be the addressed seeker can claim it; this is the
  // same model SendPulse / Calendly / Loom use for guest-link claims.)
  if (interview.candidateId && interview.candidateId !== user.sub) {
    return c.json(fail("ALREADY_CLAIMED", "This interview is already bound to another candidate"), 409);
  }
  if (
    interview.candidateEmail &&
    user.email &&
    interview.candidateEmail.toLowerCase() !== user.email.toLowerCase()
  ) {
    return c.json(
      fail(
        "EMAIL_MISMATCH",
        "The invite was sent to a different email. Sign in with the address that received the invite.",
      ),
      403,
    );
  }

  await db
    .update(studioAsyncInterviews)
    .set({ candidateId: user.sub, updatedAt: new Date() } as any)
    .where(eq(studioAsyncInterviews.id, interview.id));

  return c.json(
    ok({
      id: interview.id,
      claimed: true,
      title: interview.title,
      questions: interview.questions,
    }),
  );
});

// ─── Email helpers ──────────────────────────────────────────────────────────

async function sendInviteEmail(args: {
  to: string;
  recipientName: string;
  token: string;
  title: string;
  expiresAt: Date;
  assignmentType: "assign" | "invite" | "self" | null;
  isResend?: boolean;
}): Promise<void> {
  const url = `${getFrontendBaseUrl()}/interview/${args.token}`;
  const expiresFormatted = args.expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subjectPrefix = args.isResend ? "Resend: " : "";
  const cta = args.assignmentType === "invite" ? "Sign up & start" : "Start interview";
  const invitedCopy =
    args.assignmentType === "invite"
      ? `<p style="color:#374151;line-height:1.6;">You've been invited to answer some interview questions on hired.video. Open the link below — if you don't have an account yet, you'll be prompted to create a free job-seeker account first.</p>`
      : `<p style="color:#374151;line-height:1.6;">A new interview has been assigned to you on hired.video. Open the link below to view the questions and submit your answers.</p>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
      <tr><td align="center" style="padding:32px 16px;">
        <table width="600" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#1e293b;padding:24px 32px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">hired.video</span>
          </td></tr>
          <tr><td style="padding:32px;color:#374151;line-height:1.6;font-size:16px;">
            <p style="color:#111827;">Hi ${args.recipientName},</p>
            <h2 style="color:#111827;font-size:20px;margin:8px 0 16px;">${args.title}</h2>
            ${invitedCopy}
            <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr><td style="background:#2563eb;border-radius:6px;">
                <a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;">${cta}</a>
              </td></tr>
            </table>
            <p style="color:#6b7280;font-size:14px;">Or copy this link: <a href="${url}" style="color:#2563eb;">${url}</a></p>
            <p style="color:#9ca3af;font-size:13px;margin-top:24px;">This link expires on <strong>${expiresFormatted}</strong>. If it lapses, the recruiter can re-send a fresh link.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
  await sendGenericEmail(args.to, `${subjectPrefix}${args.title} — interview invitation`, html);
}
