/**
 * /api/scorecards/* SLA + assignment routes (#1383 + #1434 + #1435).
 *
 *   • GET    /reliability/:userId  → per-interviewer SLA stats
 *   • POST   /assignments          → recruiter pre-creates a draft submission
 *                                    with a dueAt before the evaluator opens
 *                                    the form, so SLAs hold from the moment
 *                                    the assignment lands.
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { validateJson } from "../helpers/validate.js";

const AssignSubmissionSchema = z.object({
  templateId: UuidLikeSchema,
  applicationId: z.string().min(1),
  evaluatorUserId: UuidLikeSchema,
  kitStageId: UuidLikeSchema.optional(),
  candidateUserId: UuidLikeSchema.optional(),
  dueAt: z
    .union([z.string().datetime(), z.date()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v)),
});

export function reliabilityRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:userId", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(await service().getReliability(userId, c.req.param("userId"))),
    );
  });

  return r;
}

export function assignmentRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/", validateJson(AssignSubmissionSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    // Zod widens `dueAt` to optional after `.union().transform()` even
    // though the schema doesn't call `.optional()`. We narrow here so
    // the service contract stays strict.
    const { dueAt, ...rest } = body;
    if (!dueAt) {
      return c.json(error("VALIDATION_ERROR", "dueAt is required"), 400);
    }
    return c.json(
      success(
        await service().assignSubmission(userId, { ...rest, dueAt }),
      ),
      201,
    );
  });

  return r;
}
