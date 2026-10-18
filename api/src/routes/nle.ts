/**
 * NLE (power-user video editor) API routes — `/api/nle/*`.
 *
 * Thin HTTP layer: each handler reads its input and calls a use case in
 * services/nle/ (projects: nle-projects.ts, media sources: nle-sources.ts),
 * which owns ownership checks (assertCanWrite / resolveWorkspaceForWrite in
 * services/studio/workspace.ts) and delegates SQL to the repositories.
 * Failures are DomainErrors the global error handler renders.
 *
 * NLE projects share studio_projects (kind='nle'); the Timeline JSON
 * contract lives in shared/timeline.ts and is validated client-side — the
 * server stores it verbatim but still re-checks ownership.
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { parseUpload, isUploadRejected } from "../utils/multipart.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";
import {
  createNleProject,
  deleteNleProject,
  getNleProject,
  listNleProjects,
  saveNleTimeline,
} from "../services/nle/nle-projects.js";
import {
  deleteNleSource,
  listNleSources,
  listNleSourceTags,
  patchNleSource,
  renameNleBinFolder,
  uploadNleSource,
  uploadNleSourceProxy,
} from "../services/nle/nle-sources.js";

const invalidBody = (e: z.ZodError) => error("VALIDATION_ERROR", "Invalid request body", e.flatten());

const WorkspaceFieldSchema = z
  .union([
    z.object({ kind: z.literal("personal") }),
    z.object({ kind: z.literal("company"), companyId: UuidLikeSchema }),
    z.object({ kind: z.literal("delegated"), subjectUserId: UuidLikeSchema }),
  ])
  .optional()
  .nullable();

export const nleRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200).default("Untitled film"),
  workspace: WorkspaceFieldSchema,
  /** Optional initial Timeline (e.g. cloned from a template). When omitted,
   *  the project is created with a blank Timeline. */
  timelineSpec: z.unknown().optional(),
  /** Defaults match the spec defaults in shared/timeline.ts emptyTimeline(). */
  fps: z.number().int().min(1).max(120).default(30),
  width: z.number().int().min(16).max(7680).default(1920),
  height: z.number().int().min(16).max(4320).default(1080),
});

/** POST /api/nle/projects — create a project (blank or supplied Timeline). */
nleRoutes.post("/projects", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) return c.json(invalidBody(parsed.error), 400);
  return c.json(success(await createNleProject(userId, body, parsed.data)));
});

/** GET /api/nle/projects — metadata list of the caller's NLE projects. */
nleRoutes.get("/projects", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listNleProjects(userId)));
});

/** GET /api/nle/projects/:id — one project with its full Timeline (404 when
 *  not visible, so existence doesn't leak). */
nleRoutes.get("/projects/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getNleProject(userId, c.req.param("id"))));
});

const SaveTimelineSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  /** Stored verbatim; the editor validates the Timeline shape client-side. */
  timelineSpec: z.record(z.string(), z.unknown()),
  workspace: WorkspaceFieldSchema,
});

/** PATCH /api/nle/projects/:id — save the Timeline. */
nleRoutes.patch("/projects/:id", validateJson(SaveTimelineSchema, invalidBody, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await saveNleTimeline(userId, c.req.param("id"), body)));
});

/** DELETE /api/nle/projects/:id — delete an NLE project and its media. */
nleRoutes.delete("/projects/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await deleteNleProject(userId, c.req.param("id"))));
});

// ---------------------------------------------------------------------------
// Sources — uploaded media referenced by Timeline.tracks[].clips[].sourceId.
// ---------------------------------------------------------------------------

/** GET /api/nle/sources — the caller's sources, each with its tags. */
nleRoutes.get("/sources", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listNleSources(userId)));
});

/** GET /api/nle/sources/tags — distinct tags (the bin's facet picker). */
nleRoutes.get("/sources/tags", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listNleSourceTags(userId)));
});

const RenameFolderSchema = z.object({
  from: z.string().min(1).max(500),
  to: z.string().max(500),
});

/** POST /api/nle/sources/folders/rename — rename a `/`-delimited bin folder
 *  and everything nested under it (#358); empty `to` flattens to root. */
nleRoutes.post("/sources/folders/rename", validateJson(RenameFolderSchema, invalidBody, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const { from, to } = c.req.valid("json");
  return c.json(success(await renameNleBinFolder(userId, from, to)));
});

const PatchSourceSchema = z.object({
  binFolder: z.string().min(1).max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(64)).max(64).optional(),
  /** Replaces `url` when set (relink-offline-media flow, #346). */
  url: z.string().url().optional(),
  filename: z.string().min(1).max(500).optional(),
});

/** PATCH /api/nle/sources/:id — bin folder / tag set / relink / rename. */
nleRoutes.patch("/sources/:id", validateJson(PatchSourceSchema, invalidBody, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await patchNleSource(userId, c.req.param("id"), body)));
});

/**
 * POST /api/nle/sources — multipart upload of a source file. Body:
 *   - file:           the binary
 *   - kind:           video|audio|image
 *   - durationFrames: from client probe (we don't have ffprobe here)
 *   - fps / width / height: optional, from client probe
 *   - workspace:      JSON-stringified workspace selector (optional)
 * Dedupes by content hash within the workspace.
 */
nleRoutes.post("/sources", async (c) => {
  const userId = requireUser(c);

  const up = await parseUpload(c, { messages: { missing: "Missing file" } });
  if (isUploadRejected(up)) return c.json(error("VALIDATION_ERROR", up.form ? up.message : "Multipart body required"), 400);
  const { form, file, bytes } = up;

  const kind = String(form.get("kind") ?? "");
  if (!["video", "audio", "image"].includes(kind)) {
    return c.json(error("VALIDATION_ERROR", "Invalid kind"), 400);
  }
  const durationFrames = Number(form.get("durationFrames") ?? 0);
  const fps = Number(form.get("fps") ?? 30);
  const widthRaw = form.get("width");
  const heightRaw = form.get("height");
  if (!Number.isFinite(durationFrames) || durationFrames <= 0) {
    return c.json(error("VALIDATION_ERROR", "Invalid durationFrames"), 400);
  }

  return c.json(
    success(
      await uploadNleSource(userId, {
        workspaceField: (form.get("workspace") as string | null) ?? null,
        kind,
        durationFrames,
        fps,
        width: widthRaw ? Number(widthRaw) : null,
        height: heightRaw ? Number(heightRaw) : null,
        filename: file.name,
        contentType: file.type,
        bytes,
      }),
    ),
  );
});

/** POST /api/nle/sources/:id/proxy — multipart `file` = the proxy mp4 (#341).
 *  Returns the patched source row + tags. */
nleRoutes.post("/sources/:id/proxy", async (c) => {
  const userId = requireUser(c);
  const up = await parseUpload(c, { messages: { missing: "Missing proxy file" } });
  if (isUploadRejected(up)) return c.json(error("VALIDATION_ERROR", up.form ? up.message : "Multipart body required"), 400);
  const { file, bytes } = up;
  return c.json(success(await uploadNleSourceProxy(userId, c.req.param("id"), { bytes, contentType: file.type })));
});

/** DELETE /api/nle/sources/:id — remove a source plus its R2 master + proxy. */
nleRoutes.delete("/sources/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await deleteNleSource(userId, c.req.param("id"))));
});
