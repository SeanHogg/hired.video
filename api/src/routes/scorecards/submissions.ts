/**
 * Submissions + debrief routes for /api/scorecards/*.
 * Thin HTTP adapter — body parsing via Zod, delegation to service.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  CreateSubmissionSchema,
  UpdateSubmissionSchema,
} from "../../domains/scorecards/schemas.js";
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import { validateJson } from "../helpers/validate.js";

export function submissionRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const userId = requireUser(c);
    const applicationId = c.req.query("applicationId") || undefined;
    const interviewId = c.req.query("interviewId") || undefined;
    return c.json(
      success(
        await service().listSubmissions(userId, { applicationId, interviewId }),
      ),
    );
  });

  r.get("/:id", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(await service().getSubmission(userId, c.req.param("id"))),
    );
  });

  r.post("/", validateJson(CreateSubmissionSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(await service().createSubmission(userId, body)),
      201,
    );
  });

  r.patch("/:id", validateJson(UpdateSubmissionSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().updateSubmission(userId, c.req.param("id"), body),
      ),
    );
  });

  r.post("/:id/submit", async (c) => {
    const auth = requireUser(c);
    const result = await service().submitSubmission(auth, c.req.param("id"));
    // #1118 — award the interviewer for completing a scorecard. RefId = the
    // submission id keeps it idempotent across resubmits. Best-effort.
    await withGamification(c, "scorecard-completed", (game, role, uidEarner) =>
      game.onScorecardCompleted({ userId: uidEarner, role, scorecardId: c.req.param("id") }),
    );
    return c.json(success(result));
  });

  return r;
}

export function debriefRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const userId = requireUser(c);
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json(error("VALIDATION_ERROR", "applicationId required"), 400);
    }
    return c.json(success(await service().getDebrief(userId, applicationId)));
  });

  return r;
}
