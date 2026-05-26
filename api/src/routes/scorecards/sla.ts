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
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";

const AssignSubmissionSchema = z.object({
  templateId: z.string().uuid(),
  applicationId: z.string().min(1),
  evaluatorUserId: z.string().uuid(),
  kitStageId: z.string().uuid().optional(),
  candidateUserId: z.string().uuid().optional(),
  dueAt: z
    .union([z.string().datetime(), z.date()])
    .transform((v) => (typeof v === "string" ? new Date(v) : v)),
});

export function reliabilityRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:userId", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(await service().getReliability(auth.userId, c.req.param("userId"))),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}

export function assignmentRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = AssignSubmissionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().assignSubmission(auth.userId, parsed.data)),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
