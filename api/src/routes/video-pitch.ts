/**
 * Video Pitch Lab — AI script generator + the "current pitch" pointer.
 *
 * The pitch itself is a studio project (`purpose: "pitch"`) saved through
 * the ordinary studio endpoints, with takes uploaded by the existing studio
 * recording pipeline (`uploadRecording`). This route drafts the starter
 * script and reads / sets which pitch project is the user's current one.
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { getCurrentPitch, updateCurrentPitch } from "../services/pitch/pitchService.js";
import { draftPitchScript } from "../services/pitch/pitchScript.js";
import { success } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const videoPitchRoutes = new Hono<AppEnv>();
videoPitchRoutes.use("*", attachTokenBudget());

const ScriptRequest = z.object({
  resumeId: UuidLikeSchema.optional(),
  length: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  tone: z.enum(["casual", "professional", "enthusiastic"]),
});

videoPitchRoutes.post("/script", validateJson(ScriptRequest, undefined, { emptyBody: null }), async (c) => {
  requireUser(c);
  const { resumeId, length, tone } = c.req.valid("json");
  const result = await draftPitchScript(c.env, c.var.user, { resumeId, length, tone });
  return c.json(success(result));
});

// ─── Current pitch (#1237 / #2133) ─────────────────────────────────────────
//
// The pitch is a studio project with `purpose: "pitch"` — created and saved
// through the ordinary studio endpoints (POST /api/studio/save-draft, takes
// via POST /api/studio/recording/upload with that projectId). These two
// routes only read / move the per-user "current pitch" pointer.

const SetCurrentPitchSchema = z.object({
  /** The pitch project to surface; `null` removes the pitch from the profile. */
  projectId: UuidLikeSchema.nullable(),
});

/** GET /api/video-pitch/current — the caller's current pitch (or null). */
videoPitchRoutes.get("/current", async (c) => {
  const user = c.var.user;
  requireUser(c);
  return c.json(success({ pitch: await getCurrentPitch(user.sub) }));
});

/** PUT /api/video-pitch/current — "set as my pitch" (or clear with null). */
videoPitchRoutes.put("/current", validateJson(SetCurrentPitchSchema, undefined, { emptyBody: null }), async (c) => {
  const user = c.var.user;
  requireUser(c);
  const body = c.req.valid("json");
  // Set/clear + bust the read-through caches that embed the pitch.
  const pitch = await updateCurrentPitch(user.sub, body.projectId);
  return c.json(success({ pitch }));
});
