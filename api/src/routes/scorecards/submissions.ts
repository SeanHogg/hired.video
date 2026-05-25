/**
 * Submissions + debrief routes for /api/scorecards/*.
 * Thin HTTP adapter — body parsing via Zod, delegation to service.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../../types/index.js";
import {
  CreateSubmissionSchema,
  UpdateSubmissionSchema,
} from "../../domains/scorecards/schemas.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";

export function submissionRoutes(
  service: () => ScorecardsService,
): Hono<{ Variables: Variables }> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const applicationId = c.req.query("applicationId") || undefined;
    const interviewId = c.req.query("interviewId") || undefined;
    try {
      return c.json(
        success(
          await service().listSubmissions(auth.userId, { applicationId, interviewId }),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.get("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(await service().getSubmission(auth.userId, c.req.param("id"))),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = CreateSubmissionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().createSubmission(auth.userId, parsed.data)),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.patch("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = UpdateSubmissionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().updateSubmission(auth.userId, c.req.param("id"), parsed.data),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/:id/submit", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(await service().submitSubmission(auth.userId, c.req.param("id"))),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}

export function debriefRoutes(
  service: () => ScorecardsService,
): Hono<{ Variables: Variables }> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json(error("VALIDATION_ERROR", "applicationId required"), 400);
    }
    try {
      return c.json(success(await service().getDebrief(auth.userId, applicationId)));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
