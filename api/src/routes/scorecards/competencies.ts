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
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { validateJson } from "../helpers/validate.js";

// PATCH accepts optional replace-all `levels[]` alongside the meta patch.
const UpdateCompetencyWithLevelsSchema = UpdateCompetencySchema.extend({
  levels: z.array(CompetencyLevelInputSchema).optional(),
});

export function competencyRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const userId = requireUser(c);
    const onlyCompanyId = c.req.query("companyId") || undefined;
    return c.json(success(await service().listCompetencies(userId, onlyCompanyId)));
  });

  r.get("/:id", async (c) => {
    const userId = requireUser(c);
    return c.json(success(await service().getCompetency(userId, c.req.param("id"))));
  });

  r.post("/", validateJson(CreateCompetencySchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(await service().createCompetency(userId, body)),
      201,
    );
  });

  r.patch("/:id", validateJson(UpdateCompetencyWithLevelsSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().updateCompetency(userId, c.req.param("id"), body),
      ),
    );
  });

  return r;
}
