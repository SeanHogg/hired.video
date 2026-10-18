/**
 * Interview kits + stages routes for /api/scorecards/*.
 * Thin HTTP adapter — body parsing via Zod, delegation to service.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  CreateKitSchema,
  StageInputSchema,
  UpdateKitSchema,
} from "../../domains/scorecards/schemas.js";
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { validateJson } from "../helpers/validate.js";

export function kitRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const userId = requireUser(c);
    return c.json(
      success(
        await service().listKits(userId, {
          onlyCompanyId: c.req.query("companyId") || undefined,
          jobId: c.req.query("jobId") || undefined,
        }),
      ),
    );
  });

  r.get("/:id", async (c) => {
    const userId = requireUser(c);
    return c.json(success(await service().getKit(userId, c.req.param("id"))));
  });

  r.post("/", validateJson(CreateKitSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(success(await service().createKit(userId, body)), 201);
  });

  r.patch("/:id", validateJson(UpdateKitSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(await service().updateKit(userId, c.req.param("id"), body)),
    );
  });

  r.post("/:id/stages", validateJson(StageInputSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(await service().addStage(userId, c.req.param("id"), body)),
      201,
    );
  });

  return r;
}

export function stageRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.patch("/:id", validateJson(StageInputSchema.partial(), (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten())), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(await service().updateStage(userId, c.req.param("id"), body)),
    );
  });

  r.delete("/:id", async (c) => {
    const userId = requireUser(c);
    await service().deleteStage(userId, c.req.param("id"));
    return c.json(success({ id: c.req.param("id") }));
  });

  return r;
}
