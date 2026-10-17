/**
 * Studio project drafts + uploads (W2-3a split of routes/studio.ts):
 *   POST /api/studio/save-draft — save/update a project without exporting
 *   POST /api/studio/upload     — store a render for a project and publish it
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { servicesProcessor } from "../../domains/services-processing/index.js";
import { scheduleVideoScan } from "../../services/moderation/explicit/schedule.js";
import { SaveDraftBodySchema, saveProjectDraft } from "../../services/studio/project-save-draft.js";
import { assertCanExportResolution, uploadProjectVideo } from "../../services/studio/project-upload.js";
import { fail, ok, studioErrorResponse } from "./http.js";

export const studioProjectDraftRoutes = new Hono<AppEnv>();

studioProjectDraftRoutes.post("/save-draft", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SaveDraftBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  try {
    const { dto, created } = await saveProjectDraft(c.var.user.sub, parsed.data, body);
    return c.json(ok(dto), created ? 201 : 200);
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioProjectDraftRoutes.post("/upload", async (c) => {
  const userId = c.var.user.sub;
  const form = await c.req.formData().catch(() => null);
  const entry = form?.get("video") ?? null;
  const file = typeof entry === "string" ? null : entry;
  if (!form || !file || typeof file.arrayBuffer !== "function") {
    return c.json(fail("VALIDATION_ERROR", "Missing video file"), 400);
  }
  const resolution = String(form.get("resolution") ?? "").trim(); // gap #133
  try {
    await assertCanExportResolution(userId, resolution);
    // Free-tier `video_publish` quota (distinct projects with a render;
    // re-uploads to the same project don't count again; admins bypass).
    const blocked = await servicesProcessor.enforce(c, "video_publish");
    if (blocked) return blocked;

    const workspaceField = form.get("workspace");
    const result = await uploadProjectVideo(userId, {
      file,
      title: String(form.get("title") ?? "My Video Resume"),
      projectId: String(form.get("projectId") ?? "").trim(),
      resumeId: String(form.get("resumeId") ?? "").trim() || null,
      // Watermarked render (branding policy); raw recordings omit it.
      branded: String(form.get("branded") ?? "") === "true",
      workspaceField: typeof workspaceField === "string" ? workspaceField : null,
    });
    const { projectId, videoId } = result;
    // Every upload is one publish event on the usage ledger.
    servicesProcessor.meterEvent(c, "video_publish", { projectId, videoId, resolution });
    // A new render must pass the explicit scan again before the home wall.
    scheduleVideoScan(c, videoId);
    if (resolution === "4k") {
      servicesProcessor.meterEvent(c, "export_4k", { projectId, videoId });
    } else if (resolution === "1080p") {
      servicesProcessor.meterEvent(c, "export_1080p", { projectId, videoId });
    }
    return c.json(ok(result.dto), 201);
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
