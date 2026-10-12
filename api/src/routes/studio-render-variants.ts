/**
 * Fitted cuts of a Studio project's master render (#2045):
 *
 *   GET  /api/studio/projects/:projectId/render-variants/:variantKey?revision=…
 *        → { variant: RenderVariantDto | null } — cached; the Post dock asks
 *          before rendering so an existing cut is never rendered twice
 *   POST /api/studio/projects/:projectId/render-variants/:variantKey
 *        multipart: video (the MP4 the browser rendered), revision, branded, title
 *        → { variant } — the stored cut (or the one that already existed)
 *
 * Thin HTTP layer over services/studio/render-variants.ts: validate → use
 * case → map RenderVariantError / WorkspaceForbiddenError to a status.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { WorkspaceForbiddenError } from "../services/studio/workspace.js";
import {
  getRenderVariant,
  RenderVariantError,
  storeRenderVariant,
  type RenderVariantErrorKind,
} from "../services/studio/render-variants.js";

export const studioRenderVariantRoutes = new Hono<AppEnv>();

const STATUS: Record<RenderVariantErrorKind, 400 | 404 | 503> = {
  PROJECT_NOT_FOUND: 404,
  INVALID_VARIANT: 400,
  STORAGE_UNAVAILABLE: 503,
};

function failure(c: Context<AppEnv>, err: unknown) {
  if (err instanceof WorkspaceForbiddenError) return c.json(error("FORBIDDEN", err.message), 403);
  if (err instanceof RenderVariantError) return c.json(error(err.kind, err.message), STATUS[err.kind]);
  throw err;
}

studioRenderVariantRoutes.get("/projects/:projectId/render-variants/:variantKey", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);
  try {
    const variant = await getRenderVariant({
      actorUserId: c.var.user.sub,
      projectId,
      variantKey: c.req.param("variantKey"),
      contentRevision: c.req.query("revision") ?? "",
    });
    return c.json(success({ variant }));
  } catch (err) {
    return failure(c, err);
  }
});

studioRenderVariantRoutes.post("/projects/:projectId/render-variants/:variantKey", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("video") as File | null;
  if (!file || typeof file.arrayBuffer !== "function") {
    return c.json(error("VALIDATION_ERROR", "Missing video file"), 400);
  }
  try {
    const variant = await storeRenderVariant({
      actorUserId: c.var.user.sub,
      projectId,
      variantKey: c.req.param("variantKey"),
      contentRevision: String(form?.get("revision") ?? ""),
      bytes: await file.arrayBuffer(),
      contentType: file.type,
      branded: String(form?.get("branded") ?? "") === "true",
      title: String(form?.get("title") ?? "").slice(0, 255) || "Fitted cut",
    });
    return c.json(success({ variant }), 201);
  } catch (err) {
    return failure(c, err);
  }
});
