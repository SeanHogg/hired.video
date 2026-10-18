/**
 * Studio features — voice clone marketplace reads. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Rules live in services/studio/voice-clones.ts; SQL in repositories/voiceClonesRepository.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  browseVoiceCloneMarketplace,
  getPublicVoiceClone,
  getVoiceCloneForViewer,
  listCreatorPublicVoiceClones,
  listOwnVoiceClones,
  listVoiceCloneLibrary,
} from "../../services/studio/voice-clones.js";
import { parsePagination } from "../../utils/pagination.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const voiceCloneReadRoutes = new Hono<AppEnv>();

// ── GET /voice-clones — caller's own clones (owner view) ─────────────────────
voiceCloneReadRoutes.get("/voice-clones", async (c) => {
  return c.json(success(await listOwnVoiceClones(requireUser(c))));
});

// ── GET /voice-clones/library — every clone the caller can use ──────────────
// Used by VoiceoverPanel to populate the VibeVoice voice picker.
voiceCloneReadRoutes.get("/voice-clones/library", async (c) => {
  return c.json(success(await listVoiceCloneLibrary(requireUser(c))));
});

// ── GET /voice-clones/marketplace — public catalog (no auth) ────────────────
voiceCloneReadRoutes.get("/voice-clones/marketplace", async (c) => {
  const { page, limit } = parsePagination(c, { defaultLimit: 24, maxLimit: 100 });
  const result = await browseVoiceCloneMarketplace({
    search: String(c.req.query("search") ?? "").trim() || undefined,
    language: c.req.query("language") || undefined,
    gender: c.req.query("gender") || undefined,
    sort: c.req.query("sort") ?? "popular", // popular | newest | price_asc | price_desc
    page,
    limit,
  });
  return c.json(success(result));
});

// ── GET /voice-clones/public/by-user/:userId — every public voice clone
// authored by :userId. Used by the public profile (Voice tab). Hidden
// creators (#314 paywall) return an empty list so the consumer renders a
// clean empty state. Same SAFE projection as the marketplace listing
// (sampleAudioUrl/sampleAudioKey omitted — buyers get them after license).
voiceCloneReadRoutes.get("/voice-clones/public/by-user/:userId", async (c) => {
  return c.json(success(await listCreatorPublicVoiceClones(c.req.param("userId"))));
});

// ── GET /voice-clones/public/:id — anonymous-readable public listing ────────
// Mirrors the public-prefix pattern used by /api/studio/public — needed so
// shared marketplace links (`/marketplace/voices/:id`) resolve for users who
// haven't signed in. Returns the SAFE projection only (no sampleAudioUrl /
// sampleAudioKey) and 404s on anything that isn't `visibility = public`. The
// authenticated `/voice-clones/:id` route below still serves owners +
// licensees with the full record.
voiceCloneReadRoutes.get("/voice-clones/public/:id", async (c) => {
  return c.json(success(await getPublicVoiceClone(c.req.param("id"))));
});

// ── GET /voice-clones/:id — single clone (owner / public / licensee) ────────
voiceCloneReadRoutes.get("/voice-clones/:id", async (c) => {
  return c.json(success(await getVoiceCloneForViewer(c.req.param("id"), c.var.userId)));
});
