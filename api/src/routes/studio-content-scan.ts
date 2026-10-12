/**
 * /api/studio/projects/:id/public-scan — the explicit-scan gate for the home
 * wall, owner side (owner decision 2026-10-10).
 *
 *   GET  — { scan: { verdict, categories } | null } for the project's video
 *          (categories only — never the offending content)
 *   POST — multipart `frame` × ≤12 JPEGs the client sampled from the render
 *          it just uploaded; scanned in one vision call, then the video is
 *          re-evaluated → { scan }
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { createExplicitScanDeps } from "../services/moderation/explicit/deps.js";
import { MAX_FRAMES } from "../services/moderation/explicit/videoScan.js";
import { ProjectScanError, getProjectScanStatus, submitProjectFrames } from "../services/moderation/explicit/projectScan.js";
import type { ImageInput } from "../services/moderation/explicit/imageClassifier.js";

export const studioContentScanRoutes = new Hono<AppEnv>();

/** A sampled frame is a small JPEG (≤ 640px wide); anything bigger is not one. */
const MAX_FRAME_BYTES = 600_000;

function fail(c: Context, err: unknown): Response {
  if (err instanceof ProjectScanError) return c.json(error(err.code, err.message), err.code === "NOT_FOUND" ? 404 : 409);
  if (err instanceof WorkspaceForbiddenError) return c.json(error("FORBIDDEN", err.message), 403);
  throw err;
}

studioContentScanRoutes.get("/projects/:id/public-scan", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("id")).success) return c.json(error("NOT_FOUND", "Project not found"), 404);
  try {
    return c.json(success({ scan: await getProjectScanStatus(c.var.user.sub, c.req.param("id")) }));
  } catch (err) {
    return fail(c, err);
  }
});

studioContentScanRoutes.post("/projects/:id/public-scan", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("id")).success) return c.json(error("NOT_FOUND", "Project not found"), 404);
  const form = await c.req.formData().catch(() => null);
  const parts = (form?.getAll("frame") ?? []).filter((p): p is File => typeof p === "object" && p !== null && "arrayBuffer" in p);
  if (parts.length === 0) return c.json(error("VALIDATION_ERROR", "At least one frame is required"), 400);
  if (parts.length > MAX_FRAMES) return c.json(error("VALIDATION_ERROR", `At most ${MAX_FRAMES} frames`), 400);
  if (parts.some((p) => p.type !== "image/jpeg" || p.size > MAX_FRAME_BYTES)) {
    return c.json(error("VALIDATION_ERROR", "Frames must be small JPEG images"), 415);
  }
  const frames: ImageInput[] = await Promise.all(
    parts.map(async (p) => ({ bytes: new Uint8Array(await p.arrayBuffer()), mime: "image/jpeg" })),
  );
  try {
    const scan = await submitProjectFrames(
      { actorId: c.var.user.sub, projectId: c.req.param("id"), frames },
      createExplicitScanDeps(c.env),
    );
    return c.json(success({ scan }));
  } catch (err) {
    return fail(c, err);
  }
});
