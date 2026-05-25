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
import type { Env, Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { hasAnyLLMProviderKey, createLLMClient } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { buildRepos } from "../repositories/index.js";
import { extractSkills, type SkillExtractInput, type Skill } from "../services/resume/skills.js";
import { parsedJobFromRow } from "../services/job/match-handlers.js";
import { generateQuestionsFromSkills, type GeneratedQuestion } from "../services/interview/question-generator.js";
import { scoreAnswer, aggregateScores } from "../services/interview/answer-scorer.js";
import { mapDecisionToApplicationStatus } from "../services/interview/decision-status-map.js";
import { transcribeResponseInBackground } from "../services/interview/transcribe-response.js";
import { sendGenericEmail } from "../services/adapters/email.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import type { ResumeContent } from "../../../shared/resume.js";

const { studioAsyncInterviews, studioAsyncResponses, users, jobApplications } = schema;

export const interviewAssignmentRoutes = new Hono<AppEnv>();
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
  sourceContext: z.enum(["tool", "ai-coach", "career-360", "pipeline", "job-screening"]).default("tool"),
  targetRole: z.string().max(120).optional(),
  extractedSkills: z.array(z.any()).optional(),
  /** Provenance: the reusable library set this assignment was created from
   *  (if any). The library is decoupled from the live row — once assigned,
   *  per-candidate edits don't bleed back to the library. */
  questionSetId: z.string().uuid().optional(),
  /** How long the magic link is valid (hours). */
  linkExpiryHours: z.number().int().min(1).max(720).default(168), // 7 days default
  /** How long the candidate has to submit responses once they open the link (hours). */
  responseWindowHours: z.number().int().min(1).max(720).default(72),
  /** Recorder behaviour applied to every question. */
  prepTimeSec: z.number().int().min(0).max(120).default(10),
  maxRetakes: z.number().int().min(0).max(10).default(1),
  proctoringOn: z.boolean().default(true),
});

const ProctoringFlagsSchema = z
  .object({
    tabBlurCount: z.number().int().nonnegative().default(0),
    pasteCount: z.number().int().nonnegative().default(0),
    copyCount: z.number().int().nonnegative().default(0),
    fullscreenExits: z.number().int().nonnegative().default(0),
    prepUsedSec: z.number().int().nonnegative().default(0),
    retakesUsed: z.number().int().nonnegative().default(0),
    micLevelAvg: z.number().optional(),
    deviceLabel: z.string().max(100).optional(),
  })
  .optional();

const RespondRequestSchema = z.object({
  questionId: z.string(),
  responseMode: z.enum(["text", "video"]),
  textAnswer: z.string().max(20_000).optional(),
  recordingId: z.string().uuid().optional(),
  videoUrl: z.string().optional(),
  durationMs: z.number().optional(),
  transcription: z.string().optional(),
  proctoringFlags: ProctoringFlagsSchema,
  /** 1-indexed; recorder tells us which attempt this is. Capped server-side by the row's maxRetakes. */
  attempt: z.number().int().min(1).max(11).optional(),
});

// ─── Skill-extract input builder (mirrors skill-extractor.ts) ───────────────

interface ResolvedSource {
  skillInput: SkillExtractInput;
  /** Best-guess target role for the AI Coach hand-off + LLM prompt.
   *  Used only when the caller didn't pass one explicitly; the JD title
   *  wins for jobs, the most-recent work entry's position for resumes. */
  resolvedTargetRole: string | null;
  /** Human-readable provenance shown in the practise prompt so the LLM
   *  doesn't have to ask the candidate what the questions are based on. */
  sourceDescription: string | null;
}

async function buildSourceForUser(
  userId: string,
  body: z.infer<typeof GenerateRequestSchema>,
): Promise<ResolvedSource | { error: { code: string; message: string; status: number } }> {
  if (body.resumeId) {
    const repos = buildRepos(getDb());
    const row = await repos.resumes.findByIdForOwner(body.resumeId, userId);
    if (!row?.content) {
      return { error: { code: "NOT_FOUND", message: "Resume not found", status: 404 } };
    }
    const content = row.content as ResumeContent;
    const recentTitle =
      (Array.isArray(content?.work) && (content.work as Array<{ position?: string }>)[0]?.position) ||
      null;
    const label =
      (typeof (row as Record<string, unknown>)?.title === "string" &&
        ((row as Record<string, unknown>).title as string)) ||
      "your resume";
    return {
      skillInput: { kind: "resume-json", content },
      resolvedTargetRole: typeof recentTitle === "string" ? recentTitle : null,
      sourceDescription: `your resume "${label}"`,
    };
  }
  if (body.jobId) {
    const repos = buildRepos(getDb());
    const row = await repos.jobs.findJobById(body.jobId);
    if (!row) {
      return { error: { code: "NOT_FOUND", message: "Job not found", status: 404 } };
    }
    const jobRow = row as unknown as Record<string, unknown>;
    const job = parsedJobFromRow(jobRow);
    const jobTitle = typeof job?.title === "string" ? job.title : null;
    const company =
      (typeof jobRow.company === "string" && (jobRow.company as string)) ||
      (typeof jobRow.companyName === "string" && (jobRow.companyName as string)) ||
      null;
    return {
      skillInput: { kind: "job-json", job },
      resolvedTargetRole: jobTitle,
      sourceDescription: jobTitle
        ? `the JD for ${jobTitle}${company ? ` at ${company}` : ""}`
        : "the saved job description",
    };
  }
  if (body.content) {
    return {
      skillInput: {
        kind: "text",
        sourceType: body.sourceType ?? "resume",
        text: body.content,
      },
      resolvedTargetRole: null,
      sourceDescription:
        body.sourceType === "job" ? "the pasted job description" : "the pasted resume",
    };
  }
  // Pure-targetRole path — skill list stays empty; prompt rebalances to "role-fit".
  return {
    skillInput: { kind: "text", sourceType: "job", text: body.targetRole ?? "" },
    resolvedTargetRole: body.targetRole ?? null,
    sourceDescription: body.targetRole ? `the target role "${body.targetRole}"` : null,
  };
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

  const source = await buildSourceForUser(user.sub, parsed.data);
  if ("error" in source) {
    return c.json(fail(source.error.code, source.error.message), source.error.status as 400 | 404 | 401);
  }

  const llm = hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, user) : null;

  // Pure-target path — caller supplied targetRole only with no resume/job/
  // content. Skip extraction and let the LLM build role-fit questions from
  // the title alone (skills array is empty, prompt rebalances to "role-fit").
  let skills: Skill[] = [];
  if (parsed.data.resumeId || parsed.data.jobId || parsed.data.content) {
    const extracted = await extractSkills(llm, source.skillInput);
    skills = extracted.skills;
  }

  // User-supplied targetRole wins; otherwise fall back to whatever the
  // source resolution produced (JD title / resume most-recent role).
  const effectiveTargetRole =
    parsed.data.targetRole?.trim() || source.resolvedTargetRole || null;

  const questions = await generateQuestionsFromSkills(c.env, user, {
    skills,
    targetRole: effectiveTargetRole ?? undefined,
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
      targetRole: effectiveTargetRole,
      sourceDescription: source.sourceDescription,
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
      questionSetId: parsed.data.questionSetId ?? null,
      prepTimeSec: parsed.data.prepTimeSec,
      maxRetakes: parsed.data.maxRetakes,
      proctoringOn: parsed.data.proctoringOn,
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

  // Cap attempt against the interview's maxRetakes. attempts > maxRetakes+1
  // are silently coerced so a misbehaving client can't claim "this is take 9"
  // and trick the recruiter UI into showing inflated retake counts.
  const allowedAttempts = Math.max(1, (interview.maxRetakes ?? 1) + 1);
  const attempt = Math.min(parsed.data.attempt ?? (existing ? (existing.attempt ?? 1) + 1 : 1), allowedAttempts);

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
        proctoringFlags: parsed.data.proctoringFlags ?? existing.proctoringFlags ?? {},
        attempt,
        status: "recorded",
        // A re-record invalidates the previous AI score — clear so the
        // recruiter knows the saved AI verdict is stale.
        aiScore: null,
        aiScoreBreakdown: null,
        aiSummary: null,
        aiStrengths: null,
        aiConcerns: null,
        aiScoredAt: null,
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
        proctoringFlags: parsed.data.proctoringFlags ?? {},
        attempt,
        status: "recorded",
      } as any)
      .returning();
  }

  await db
    .update(studioAsyncInterviews)
    .set({ status: "in_progress", updatedAt: new Date() } as any)
    .where(eq(studioAsyncInterviews.id, id));

  // #1238: fire-and-forget transcription on video responses. Caller never
  // waits; recruiter polls `transcriptionStatus` on the row to know.
  if (parsed.data.responseMode === "video" && saved.videoUrl) {
    transcribeResponseInBackground(
      c.env,
      db,
      { responseId: saved.id, videoUrl: saved.videoUrl },
      c.executionCtx?.waitUntil?.bind(c.executionCtx),
    );
  }

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
      // Recorder behaviour — drives prep timer, retake cap, proctoring flag.
      prepTimeSec: interview.prepTimeSec ?? 10,
      maxRetakes: interview.maxRetakes ?? 1,
      proctoringOn: interview.proctoringOn ?? true,
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

// ═══════════════════════════════════════════════════════════════════════════
// 10. SCORE — AI scores a single response (recruiter-only)
//     POST /:id/responses/:rid/score
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/:id/responses/:rid/score", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!user.roles?.some((r) => ASSIGNABLE_ROLES.has(r))) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can score answers"), 403);
  }

  const id = c.req.param("id");
  const rid = c.req.param("rid");
  const db = getDb();

  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, id), eq(studioAsyncInterviews.recruiterId, user.sub)))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  const [response] = await db
    .select()
    .from(studioAsyncResponses)
    .where(and(eq(studioAsyncResponses.id, rid), eq(studioAsyncResponses.interviewId, id)))
    .limit(1);
  if (!response) return c.json(fail("NOT_FOUND", "Response not found"), 404);

  // Locate the question the response is tied to so we can give the LLM
  // context (question text + skill probes + category).
  const questions = (interview.questions as Array<GeneratedQuestion>) ?? [];
  const question = questions.find((q) => q.id === response.questionId);
  if (!question) return c.json(fail("NOT_FOUND", "Question not found on interview"), 404);

  const answerText = response.textAnswer?.trim() || response.transcription?.trim() || "";
  if (!answerText) {
    return c.json(fail("NO_TRANSCRIPT", "No answer text or transcript on this response"), 400);
  }

  const result = await scoreAnswer(c.env, user, {
    question: question.text,
    skillLinks: question.skillLinks,
    category: question.category,
    answerText,
    targetRole: interview.targetRole ?? undefined,
  });

  const [saved] = await db
    .update(studioAsyncResponses)
    .set({
      aiScore: result.score,
      aiScoreBreakdown: result.breakdown,
      aiSummary: result.summary,
      aiStrengths: result.strengths,
      aiConcerns: result.concerns,
      aiScoredAt: new Date(),
    } as any)
    .where(eq(studioAsyncResponses.id, rid))
    .returning();

  return c.json(ok(saved));
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. SCORE-ALL — convenience: score every un-scored answer on the interview
//     POST /:id/score-all
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/:id/score-all", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!user.roles?.some((r) => ASSIGNABLE_ROLES.has(r))) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can score answers"), 403);
  }

  const id = c.req.param("id");
  const db = getDb();

  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, id), eq(studioAsyncInterviews.recruiterId, user.sub)))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  const responses = await db
    .select()
    .from(studioAsyncResponses)
    .where(eq(studioAsyncResponses.interviewId, id));

  const questions = (interview.questions as Array<GeneratedQuestion>) ?? [];
  const questionById = new Map(questions.map((q) => [q.id, q]));

  let scoredCount = 0;
  const scoredRows: Array<{ score: number; required: boolean }> = [];

  for (const r of responses) {
    const q = questionById.get(r.questionId);
    if (!q) continue;
    const answerText = r.textAnswer?.trim() || r.transcription?.trim() || "";
    if (!answerText) continue;

    // Skip if already scored — avoid burning LLM credits twice. Recruiter can
    // re-score one at a time via /responses/:rid/score if they really want.
    if (r.aiScoredAt) {
      if (typeof r.aiScore === "number") {
        scoredRows.push({ score: r.aiScore, required: q.required });
      }
      continue;
    }

    const result = await scoreAnswer(c.env, user, {
      question: q.text,
      skillLinks: q.skillLinks,
      category: q.category,
      answerText,
      targetRole: interview.targetRole ?? undefined,
    });
    await db
      .update(studioAsyncResponses)
      .set({
        aiScore: result.score,
        aiScoreBreakdown: result.breakdown,
        aiSummary: result.summary,
        aiStrengths: result.strengths,
        aiConcerns: result.concerns,
        aiScoredAt: new Date(),
      } as any)
      .where(eq(studioAsyncResponses.id, r.id));
    scoredCount += 1;
    scoredRows.push({ score: result.score, required: q.required });
  }

  // Roll up to an overall score on the interview row.
  const requiredQids = new Set(questions.filter((q) => q.required).map((q) => q.id));
  const allRows = responses
    .map((r) => ({ score: r.aiScore, required: requiredQids.has(r.questionId) }))
    .filter((r) => r.score != null) as Array<{ score: number; required: boolean }>;
  // Merge in newly-scored rows from this run (the cached responses array is
  // pre-update, so include those too).
  for (const sr of scoredRows) allRows.push(sr);
  const { overall, coverage } = aggregateScores(allRows);

  await db
    .update(studioAsyncInterviews)
    .set({
      aiOverallScore: overall,
      aiOverallSummary: `${coverage}% answer coverage; weighted average ${overall.toFixed(1)}/10`,
      aiScoredAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(eq(studioAsyncInterviews.id, id));

  return c.json(ok({ scoredCount, overall, coverage }));
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. DECISION — recruiter marks shortlist / maybe / reject
//     POST /:id/decision
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.post("/:id/decision", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!user.roles?.some((r) => ASSIGNABLE_ROLES.has(r))) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can decide"), 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const DecisionSchema = z.object({
    decision: z.enum(["shortlist", "maybe", "reject"]).nullable(),
    reason: z.string().max(2000).optional(),
  });
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid decision payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [interview] = await db
    .select()
    .from(studioAsyncInterviews)
    .where(and(eq(studioAsyncInterviews.id, id), eq(studioAsyncInterviews.recruiterId, user.sub)))
    .limit(1);
  if (!interview) return c.json(fail("NOT_FOUND", "Interview not found"), 404);

  const [updated] = await db
    .update(studioAsyncInterviews)
    .set({
      decision: parsed.data.decision,
      decisionReason: parsed.data.reason ?? null,
      decisionBy: parsed.data.decision ? user.sub : null,
      decisionAt: parsed.data.decision ? new Date() : null,
      status: parsed.data.decision ? "reviewed" : interview.status,
      updatedAt: new Date(),
    } as any)
    .where(eq(studioAsyncInterviews.id, id))
    .returning();

  // #1234: propagate the decision to the linked job_application row so the
  // pipeline view + recruiter dashboards reflect the screening outcome
  // without a second click. No-op when the interview was created ad-hoc
  // (assignment_type='assign' from the tool) and has no application_id.
  if (interview.applicationId) {
    await db
      .update(jobApplications)
      .set({
        status: mapDecisionToApplicationStatus(parsed.data.decision),
        updatedAt: new Date(),
      } as any)
      .where(eq(jobApplications.id, interview.applicationId));
  }

  return c.json(ok(updated));
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. REPORT — combined interview + responses + AI breakdown
//     GET /:id/report — convenience endpoint for the recruiter review surface
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.get("/:id/report", async (c) => {
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

  // Optional candidate lookup so the report carries a name on it. Drizzle
  // join would balloon the row width; one extra point read is cheap.
  let candidate: { id: string; name: string | null; email: string | null } | null = null;
  if (interview.candidateId) {
    const [row] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, interview.candidateId))
      .limit(1);
    candidate = row ?? null;
  }

  return c.json(
    ok({
      interview,
      responses,
      candidate,
      viewerRole: isCreator ? "creator" : "candidate",
    }),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. COMPARE — side-by-side view of multiple interviews (recruiter-only)
//     GET /compare?ids=<id>,<id>,…   max 6 ids
// ═══════════════════════════════════════════════════════════════════════════

interviewAssignmentRoutes.get("/compare", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!user.roles?.some((r) => ASSIGNABLE_ROLES.has(r))) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can compare"), 403);
  }

  const raw = c.req.query("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (ids.length < 2) return c.json(fail("VALIDATION_ERROR", "Pass at least 2 ids"), 400);

  const db = getDb();
  const interviews = await db
    .select()
    .from(studioAsyncInterviews)
    .where(
      and(
        eq(studioAsyncInterviews.recruiterId, user.sub),
        sql`${studioAsyncInterviews.id} = ANY(${ids})`,
      ),
    );
  if (interviews.length === 0) {
    return c.json(fail("NOT_FOUND", "No matching interviews"), 404);
  }

  // Pull responses for everything in a single query then bucket in memory —
  // far fewer round-trips than per-id selects.
  const interviewIds = interviews.map((i) => i.id);
  const responses = await db
    .select()
    .from(studioAsyncResponses)
    .where(sql`${studioAsyncResponses.interviewId} = ANY(${interviewIds})`);

  const buckets = new Map<string, typeof responses>();
  for (const r of responses) {
    const bucket = buckets.get(r.interviewId) ?? [];
    bucket.push(r);
    buckets.set(r.interviewId, bucket);
  }

  return c.json(
    ok({
      interviews: interviews.map((i) => ({
        interview: i,
        responses: buckets.get(i.id) ?? [],
      })),
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
