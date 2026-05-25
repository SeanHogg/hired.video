/**
 * Interview kits + stages routes for /api/scorecards/*.
 * Thin HTTP adapter — body parsing via Zod, delegation to service.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../../types/index.js";
import {
  CreateKitSchema,
  StageInputSchema,
  UpdateKitSchema,
} from "../../domains/scorecards/schemas.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";

export function kitRoutes(
  service: () => ScorecardsService,
): Hono<{ Variables: Variables }> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(
        success(
          await service().listKits(auth.userId, {
            onlyCompanyId: c.req.query("companyId") || undefined,
            jobId: c.req.query("jobId") || undefined,
          }),
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
      return c.json(success(await service().getKit(auth.userId, c.req.param("id"))));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = CreateKitSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(success(await service().createKit(auth.userId, parsed.data)), 201);
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.patch("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = UpdateKitSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().updateKit(auth.userId, c.req.param("id"), parsed.data)),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/:id/stages", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = StageInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().addStage(auth.userId, c.req.param("id"), parsed.data)),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}

export function stageRoutes(
  service: () => ScorecardsService,
): Hono<{ Variables: Variables }> {
  const r = new Hono<AppEnv>();

  r.patch("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = StageInputSchema.partial().safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().updateStage(auth.userId, c.req.param("id"), parsed.data)),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.delete("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      await service().deleteStage(auth.userId, c.req.param("id"));
      return c.json(success({ id: c.req.param("id") }));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
