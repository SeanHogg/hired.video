/**
 * Article version history (#170 / #155): list, autosave / snapshot,
 * restore. Mirrors resumes + studio. Use cases + the entity_versions
 * mapping live in services/articles/versions.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  listArticleVersions,
  restoreArticleVersion,
  snapshotArticleVersion,
} from "../../services/articles/versions.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const articleVersionRoutes = new Hono<AppEnv>();

articleVersionRoutes.get("/:id/versions", async (c) => {
  const userId = requireUser(c);
  const versions = await listArticleVersions(userId, c.req.param("id"));
  return c.json(success({ versions }), 200);
});

export const CreateArticleVersionSchema = z.object({
  label: z.string().trim().max(120).optional(),
  isAutosave: z.boolean().optional(),
});

articleVersionRoutes.post("/:id/versions", validateJson(CreateArticleVersionSchema, () => error("VALIDATION_ERROR", "Invalid version payload")), async (c) => {
  const userId = requireUser(c);
  const version = await snapshotArticleVersion(userId, c.req.param("id"), c.req.valid("json"));
  return c.json(success({ version }), 201);
});

articleVersionRoutes.post("/:id/versions/:vid/restore", async (c) => {
  const userId = requireUser(c);
  const result = await restoreArticleVersion(userId, c.req.param("id"), c.req.param("vid"));
  return c.json(success(result), 200);
});
