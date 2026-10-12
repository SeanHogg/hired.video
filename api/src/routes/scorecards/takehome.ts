/**
 * /api/scorecards/* — take-home assignments (#1386) + stage-question
 * tagging (#1390) + kit coverage warnings.
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { generateQuestionsForCompetency } from "../../services/interview/question-generator.js";

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
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(await service().listStageQuestions(auth.userId, c.req.param("stageId"))),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/:stageId", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = StageQuestionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().addStageQuestion(
            auth.userId,
            c.req.param("stageId"),
            parsed.data,
          ),
        ),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.delete("/items/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      await service().deleteStageQuestion(auth.userId, c.req.param("id"));
      return c.json(success({ id: c.req.param("id") }));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  // AI-generate competency-aware questions (#1439). Persists each
  // suggestion as a tagged question on the stage in one round-trip.
  r.post("/:stageId/ai-generate", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = AiGenerateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      const stageId = c.req.param("stageId");
      const competency = await service().getCompetency(
        auth.userId,
        parsed.data.competencyId,
      );
      const suggestions = await generateQuestionsForCompetency(
        c.env as any,
        c.var.user as any,
        {
          competencyName: competency.name,
          level: parsed.data.level,
          count: parsed.data.count,
          targetRole: parsed.data.targetRole,
          anchorText: competency.levels.find((l) => l.label === parsed.data.level)
            ?.anchor,
        },
      );
      const persisted = [];
      for (const q of suggestions) {
        const row = await service().addStageQuestion(auth.userId, stageId, {
          prompt: q.prompt,
          competencyId: parsed.data.competencyId,
          difficulty: q.difficulty ?? parsed.data.level ?? null,
          expectedAnswer: q.expectedAnswer,
        });
        persisted.push(row);
      }
      return c.json(success({ questions: persisted }), 201);
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}

export function takeHomeRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:stageId", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(await service().getTakeHomeForStage(auth.userId, c.req.param("stageId"))),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.put("/:stageId", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = TakeHomeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().upsertTakeHome(
            auth.userId,
            c.req.param("stageId"),
            parsed.data,
          ),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  // Recruiter — list submissions for review.
  r.get("/:stageId/submissions", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(
          await service().listTakeHomeSubmissions(auth.userId, c.req.param("stageId")),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  // Recruiter — mint a candidate invite.
  r.post("/:stageId/invites", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = InviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().createTakeHomeInvite(
            auth.userId,
            c.req.param("stageId"),
            parsed.data,
          ),
        ),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  // Recruiter — link a take-home submission to a scorecard for review.
  r.post("/start-review", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = StartReviewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().startTakeHomeReview(
            auth.userId,
            parsed.data.takeHomeSubmissionId,
            parsed.data.templateId,
          ),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
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
    try {
      return c.json(success(await service().getTakeHomeByToken(c.req.param("token"))));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/invite/:token", async (c) => {
    const parsed = DeliverySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().submitTakeHomeByToken(c.req.param("token"), parsed.data),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}

export function coverageRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:kitId", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(await service().getKitCoverage(auth.userId, c.req.param("kitId"))),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
