/**
 * Public channel routes — `/u/:handle` lands here.
 *
 * GET    /api/channels/:handle               — public profile + video catalog
 *                                              + current video pitch (#2133)
 * GET    /api/channels/me/youtube            — list my ingests (auth)
 * POST   /api/channels/me/youtube            — paste a YouTube URL → ingest
 * PATCH  /api/channels/me/youtube/:id        — hide/unhide an ingest
 * DELETE /api/channels/me/youtube/:id        — remove an ingest
 * PATCH  /api/channels/me/profile-mode       — set my own profile_mode
 *
 * Everything routes through the shared `profile-mode.ts` resolver and
 * `youtube-ingest.ts` service per the standing DRY rule. The channel
 * page itself doesn't decide "is this user a creator" — it asks the
 * resolver, which is the single source of truth.
 */

import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  deleteMyIngest,
  getPublicChannel,
  ingestMyYoutubeUrl,
  listMyIngests,
  setMyIngestHidden,
  setMyProfileMode,
} from "../services/profile/channel.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const channelRoutes = new Hono<AppEnv>();

// Public — no auth gate. The handle IS the entry point.
channelRoutes.get("/:handle", async (c) => {
  const handle = c.req.param("handle");
  if (!handle) return c.json(error("BAD_REQUEST", "Missing handle"), 400);
  const channel = await getPublicChannel(handle);
  if (!channel) return c.json(error("NOT_FOUND", "Channel not found"), 404);
  return c.json(success(channel));
});

// ── Authenticated self-management ────────────────────────────────────

channelRoutes.get("/me/youtube", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyIngests(userId)));
});

const ingestSchema = z.object({ url: z.string().min(5).max(512) });
channelRoutes.post("/me/youtube", validateJson(ingestSchema, () => error("BAD_REQUEST", "Missing url")), async (c) => {
  const userId = requireUser(c);
  const result = await ingestMyYoutubeUrl(userId, c.req.valid("json").url);
  return c.json(success(result));
});

const patchSchema = z.object({ hidden: z.boolean() });
channelRoutes.patch("/me/youtube/:id", validateJson(patchSchema, () => error("BAD_REQUEST", "Missing hidden")), async (c) => {
  const userId = requireUser(c);
  await setMyIngestHidden(userId, c.req.param("id"), c.req.valid("json").hidden);
  return c.json(success({ ok: true }));
});

channelRoutes.delete("/me/youtube/:id", async (c) => {
  const userId = requireUser(c);
  await deleteMyIngest(userId, c.req.param("id"));
  return c.json(success({ ok: true }));
});

const profileModeSchema = z.object({
  profileMode: z.enum(["resume", "channel", "auto"]),
});
channelRoutes.patch("/me/profile-mode", validateJson(profileModeSchema, () => error("BAD_REQUEST", "Invalid profileMode")), async (c) => {
  const userId = requireUser(c);
  const resolution = await setMyProfileMode(userId, c.req.valid("json").profileMode);
  return c.json(success(resolution));
});
