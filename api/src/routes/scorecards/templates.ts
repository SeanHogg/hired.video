/**
 * Templates + attributes routes for /api/scorecards/*.
 *
 * Thin HTTP adapter — parses the body via the shared Zod schemas and
 * delegates to ScorecardsService. ServiceErrors are mapped centrally.
 */

import { Hono } from "hono";
import type { Variables } from "../../types/index.js";
import { success } from "../../types/index.js";
import {
  AttributeInputSchema,
  CreateTemplateSchema,
  UpdateTemplateSchema,
} from "../../domains/scorecards/schemas.js";
import { mapServiceError, requireUser } from "../helpers/routerHelpers.js";
import type { ScorecardsService } from "../../domains/scorecards/scorecardsService.js";
import { error } from "../../types/index.js";

export function templateRoutes(
  service: () => ScorecardsService,
): Hono<{ Variables: Variables }> {
  const r = new Hono<{ Variables: Variables }>();

  r.get("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const onlyCompanyId = c.req.query("companyId") || undefined;
    try {
      return c.json(success(await service().listTemplates(auth.userId, onlyCompanyId)));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.get("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      return c.json(success(await service().getTemplate(auth.userId, c.req.param("id"))));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = CreateTemplateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(success(await service().createTemplate(auth.userId, parsed.data)), 201);
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.patch("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = UpdateTemplateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(await service().updateTemplate(auth.userId, c.req.param("id"), parsed.data)),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.post("/:id/attributes", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = AttributeInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().addAttribute(auth.userId, c.req.param("id"), parsed.data),
        ),
        201,
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}

export function attributeRoutes(
  service: () => ScorecardsService,
): Hono<{ Variables: Variables }> {
  const r = new Hono<{ Variables: Variables }>();

  r.patch("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    const parsed = AttributeInputSchema.partial().safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
    }
    try {
      return c.json(
        success(
          await service().updateAttribute(auth.userId, c.req.param("id"), parsed.data),
        ),
      );
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  r.delete("/:id", async (c) => {
    const auth = requireUser(c);
    if ("response" in auth) return auth.response;
    try {
      await service().deleteAttribute(auth.userId, c.req.param("id"));
      return c.json(success({ id: c.req.param("id") }));
    } catch (e) {
      return mapServiceError(c, e);
    }
  });

  return r;
}
