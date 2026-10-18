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
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { parseUpload, isUploadRejected } from "../utils/multipart.js";
import {
  getRenderVariant,
  storeRenderVariant,
} from "../services/studio/render-variants.js";

export const studioRenderVariantRoutes = new Hono<AppEnv>();

studioRenderVariantRoutes.get("/projects/:projectId/render-variants/:variantKey", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);
  const variant = await getRenderVariant({
    actorUserId: c.var.userId,
    projectId,
    variantKey: c.req.param("variantKey"),
    contentRevision: c.req.query("revision") ?? "",
  });
  return c.json(success({ variant }));
});

studioRenderVariantRoutes.post("/projects/:projectId/render-variants/:variantKey", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);
  const up = await parseUpload(c, { fields: ["video"], messages: { missing: "Missing video file" } });
  if (isUploadRejected(up)) return c.json(error("VALIDATION_ERROR", up.message), 400);
  const { form, file, bytes } = up;
  const variant = await storeRenderVariant({
    actorUserId: c.var.userId,
    projectId,
    variantKey: c.req.param("variantKey"),
    contentRevision: String(form.get("revision") ?? ""),
    bytes,
    contentType: file.type,
    branded: String(form.get("branded") ?? "") === "true",
    title: String(form.get("title") ?? "").slice(0, 255) || "Fitted cut",
  });
  return c.json(success({ variant }), 201);
});
