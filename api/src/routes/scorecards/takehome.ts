/**
 * /api/scorecards/* — take-home assignments (#1386) + stage-question
 * tagging (#1390) + kit coverage warnings.
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { generateQuestionsForCompetency } from "../../services/interview/question-generator.js";
import { validateJson } from "../helpers/validate.js";

const StageQuestionSchema = z.object({
  prompt: z.string().min(1).max(2000),
  competencyId: UuidLikeSchema.nullable().optional(),
  difficulty: z.string().max(8).nullable().optional(),
  expectedAnswer: z
    .enum(["star", "technical", "coding", "portfolio", "open"])
    .optional(),
});

const AiGenerateSchema = z.object({
  competencyId: UuidLikeSchema,
  level: z.string().max(8).optional(),
  count: z.number().int().min(1).max(6).optional(),
  targetRole: z.string().max(200).optional(),
});

const TakeHomeSchema = z.object({
  prompt: z.string().min(1).max(10000),
  deliveryFormat: z
    .enum(["github_url", "file_upload", "code_paste", "doc_link"])
    .optional(),
  dueInHours: z.number().int().min(1).max(720).optional(),
});

const InviteSchema = z.object({
  applicationId: z.string().min(1),
  candidateUserId: UuidLikeSchema.optional(),
});

const DeliverySchema = z
  .object({
    deliveryUrl: z.string().url().optional(),
    textResponse: z.string().max(50_000).optional(),
    fileRefs: z.array(z.string().min(1).max(500)).max(20).optional(),
  })
  .refine(
    (v) =>
      !!v.deliveryUrl || !!v.textResponse || (v.fileRefs?.length ?? 0) > 0,
    { message: "Provide at least one delivery" },
  );

const StartReviewSchema = z.object({
  takeHomeSubmissionId: UuidLikeSchema,
  templateId: UuidLikeSchema,
});

export function stageQuestionRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:stageId", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(await service().listStageQuestions(userId, c.req.param("stageId"))),
    );
  });

  r.post("/:stageId", validateJson(StageQuestionSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().addStageQuestion(
          userId,
          c.req.param("stageId"),
          body,
        ),
      ),
      201,
    );
  });

  r.delete("/items/:id", async (c) => {
    const userId = requireUser(c);
    await service().deleteStageQuestion(userId, c.req.param("id"));
    return c.json(success({ id: c.req.param("id") }));
  });

  // AI-generate competency-aware questions (#1439). Persists each
  // suggestion as a tagged question on the stage in one round-trip.
  r.post("/:stageId/ai-generate", validateJson(AiGenerateSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    const stageId = c.req.param("stageId");
    const competency = await service().getCompetency(
      userId,
      body.competencyId,
    );
    const suggestions = await generateQuestionsForCompetency(
      c.env as any,
      c.var.user as any,
      {
        competencyName: competency.name,
        level: body.level,
        count: body.count,
        targetRole: body.targetRole,
        anchorText: competency.levels.find((l) => l.label === body.level)
          ?.anchor,
      },
    );
    const persisted = [];
    for (const q of suggestions) {
      const row = await service().addStageQuestion(userId, stageId, {
        prompt: q.prompt,
        competencyId: body.competencyId,
        difficulty: q.difficulty ?? body.level ?? null,
        expectedAnswer: q.expectedAnswer,
      });
      persisted.push(row);
    }
    return c.json(success({ questions: persisted }), 201);
  });

  return r;
}

export function takeHomeRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:stageId", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(await service().getTakeHomeForStage(userId, c.req.param("stageId"))),
    );
  });

  r.put("/:stageId", validateJson(TakeHomeSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().upsertTakeHome(
          userId,
          c.req.param("stageId"),
          body,
        ),
      ),
    );
  });

  // Recruiter — list submissions for review.
  r.get("/:stageId/submissions", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(
        await service().listTakeHomeSubmissions(userId, c.req.param("stageId")),
      ),
    );
  });

  // Recruiter — mint a candidate invite.
  r.post("/:stageId/invites", validateJson(InviteSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().createTakeHomeInvite(
          userId,
          c.req.param("stageId"),
          body,
        ),
      ),
      201,
    );
  });

  // Recruiter — link a take-home submission to a scorecard for review.
  r.post("/start-review", validateJson(StartReviewSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().startTakeHomeReview(
          userId,
          body.takeHomeSubmissionId,
          body.templateId,
        ),
      ),
    );
  });

  return r;
}

/**
 * Public-by-token routes for the candidate-facing magic-link surface
 * (#1438). Mounted separately so they bypass the JWT auth middleware.
 */
export function takeHomePublicRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/invite/:token", async (c) => {
    return c.json(success(await service().getTakeHomeByToken(c.req.param("token"))));
  });

  r.post("/invite/:token", validateJson(DeliverySchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().submitTakeHomeByToken(c.req.param("token"), body),
      ),
    );
  });

  return r;
}

export function coverageRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:kitId", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(await service().getKitCoverage(userId, c.req.param("kitId"))),
    );
  });

  return r;
}
