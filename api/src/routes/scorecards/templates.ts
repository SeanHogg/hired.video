/**
 * Templates + attributes routes for /api/scorecards/*.
 *
 * Thin HTTP adapter — parses the body via the shared Zod schemas and
 * delegates to ScorecardsService. ServiceErrors are mapped centrally.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import {
  AttributeInputSchema,
  CreateTemplateSchema,
  UpdateTemplateSchema,
} from "../../domains/scorecards/schemas.js";
import { requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export function templateRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const userId = requireUser(c);
    const onlyCompanyId = c.req.query("companyId") || undefined;
    return c.json(success(await service().listTemplates(userId, onlyCompanyId)));
  });

  r.get("/:id", async (c) => {
    const userId = requireUser(c);
    return c.json(success(await service().getTemplate(userId, c.req.param("id"))));
  });

  r.post("/", validateJson(CreateTemplateSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(success(await service().createTemplate(userId, body)), 201);
  });

  r.patch("/:id", validateJson(UpdateTemplateSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(await service().updateTemplate(userId, c.req.param("id"), body)),
    );
  });

  r.post("/:id/attributes", validateJson(AttributeInputSchema, (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().addAttribute(userId, c.req.param("id"), body),
      ),
      201,
    );
  });

  return r;
}

export function attributeRoutes(
  service: () => ScorecardsService,
): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.patch("/:id", validateJson(AttributeInputSchema.partial(), (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten())), async (c) => {
    const userId = requireUser(c);
    const body = c.req.valid("json");
    return c.json(
      success(
        await service().updateAttribute(userId, c.req.param("id"), body),
      ),
    );
  });

  r.delete("/:id", async (c) => {
    const userId = requireUser(c);
    await service().deleteAttribute(userId, c.req.param("id"));
    return c.json(success({ id: c.req.param("id") }));
  });

  return r;
}
