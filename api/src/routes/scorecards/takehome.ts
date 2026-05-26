/**
 * /api/scorecards/* — take-home assignments (#1386) + stage-question
 * tagging (#1390) + kit coverage warnings.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";

const StageQuestionSchema = z.object({
  prompt: z.string().min(1).max(2000),
  competencyId: z.string().uuid().nullable().optional(),
  difficulty: z.string().max(8).nullable().optional(),
  expectedAnswer: z
    .enum(["star", "technical", "coding", "portfolio", "open"])
    .optional(),
});

const TakeHomeSchema = z.object({
  prompt: z.string().min(1).max(10000),
  deliveryFormat: z
    .enum(["github_url", "file_upload", "code_paste", "doc_link"])
    .optional(),
  dueInHours: z.number().int().min(1).max(720).optional(),
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
