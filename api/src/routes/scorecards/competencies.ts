/**
 * /api/scorecards/competencies/* — cross-template competency framework (#1382).
 *
 * Thin HTTP adapter delegating to ScorecardsService. Mirrors the
 * templates.ts shape — Zod parse + service call + ServiceError mapping.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  CreateCompetencySchema,
  UpdateCompetencySchema,
  CompetencyLevelInputSchema,
} from "../../domains/scorecards/schemas.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";

// PATCH accepts optional replace-all `levels[]` alongside the meta patch.
const UpdateCompetencyWithLevelsSchema = UpdateCompetencySchema.extend({
  levels: z.array(CompetencyLevelInputSchema).optional(),
});

export function competencyRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const onlyCompanyId = c.req.query("companyId") || undefined;
    try {
      return c.json(success(await service().listCompetencies(auth.userId, onlyCompanyId)));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.get("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(success(await service().getCompetency(auth.userId, c.req.param("id"))));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = CreateCompetencySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().createCompetency(auth.userId, parsed.data)),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.patch("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = UpdateCompetencyWithLevelsSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().updateCompetency(auth.userId, c.req.param("id"), parsed.data),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
