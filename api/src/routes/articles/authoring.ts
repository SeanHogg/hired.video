/**
 * Owner endpoints: create, list mine, read / update / delete, and the
 * review lifecycle (submit-for-review with the moderation gate, withdraw,
 * unpublish). `/me` is registered before `/:id`.
 * Use cases live in services/articles/authoring.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  createArticle,
  deleteMyArticle,
  getMyArticle,
  listMyArticles,
  submitArticleForReview,
  unpublishMyArticle,
  updateMyArticle,
  withdrawMyArticle,
} from "../../services/articles/authoring.js";
import { runArticleClassifier, CreateArticleSchema, UpdateArticleSchema } from "./shared.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const articleAuthoringRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Owner endpoints
// ---------------------------------------------------------------------------

articleAuthoringRoutes.post("/", validateJson(CreateArticleSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await createArticle(userId, c.req.valid("json"))), 201);
});

articleAuthoringRoutes.get("/me", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyArticles(userId)), 200);
});

articleAuthoringRoutes.get("/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getMyArticle(userId, c.req.param("id"))), 200);
});

articleAuthoringRoutes.patch("/:id", validateJson(UpdateArticleSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await updateMyArticle(userId, c.req.param("id"), c.req.valid("json"))), 200);
});

articleAuthoringRoutes.post("/:id/submit-for-review", async (c) => {
  const userId = requireUser(c);
  const updated = await submitArticleForReview(userId, c.req.param("id"), (art) => runArticleClassifier(c, art));
  return c.json(success(updated), 200);
});

articleAuthoringRoutes.post("/:id/withdraw", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await withdrawMyArticle(userId, c.req.param("id"))), 200);
});

articleAuthoringRoutes.post("/:id/unpublish", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await unpublishMyArticle(userId, c.req.param("id"))), 200);
});

articleAuthoringRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await deleteMyArticle(userId, c.req.param("id"))), 200);
});
