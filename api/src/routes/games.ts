/**
 * Games routes — endpoints serving the 3D world game studio
 * (`mediaKind: "game"` + `engine: "world-3d"`). Mounts at /api/games.
 *
 * Covers (gap entries reference the README Consolidated Gap Register):
 *   - Phase 2 (#1635) — challenge completion endpoint that awards
 *     gamification points via the existing PointsEngine.
 *   - Phase 4 (#1637) — friend-invite share-links (create / list /
 *     resolve / join / revoke) for opening the world to friends.
 *
 * The Phase-5 AI agent route lives in `game-agent.ts` (separate file
 * because it owns a long-running streaming handler + token-billing
 * surface that doesn't belong next to the CRUD endpoints).
 *
 * Ownership: every authoring endpoint funnels through
 * `services/studio/workspace.ts::canActFor` so personal +
 * company-owned + delegated-grant projects all hit one auth seam
 * (same model as [[project_studio_workspaces]]).
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import {
  createGameInvite,
  getGameProjectState,
  joinGameInvite,
  listGameInvites,
  notifyGameOwner,
  resolveGameInvite,
  revokeGameInvite,
} from "../services/studio/game-play.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const gamesRoutes = new Hono<AppEnv>();

const invalidProjectId = () => error("VALIDATION_ERROR", "Invalid projectId");

// ─── Phase 2 — challenge-complete (gap #1635) ────────────────────────────
//
// POST /api/games/:projectId/challenge-complete
// Body: { challengeId: string, durationMs?: number, metadata?: unknown }
//
// Validates the player is allowed to play this project (open today —
// every authed user can play; once invites land we'll also accept an
// invite token here), and awards `PLAY_GAME_CHALLENGE` points through
// the gamification service. Points are dedup'd by refId so re-firing
// the same `(projectId, challengeId, userId)` won't double-pay.

const ChallengeCompleteSchema = z.object({
  challengeId: z.string().min(1).max(80),
  durationMs: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

gamesRoutes.post("/:projectId/challenge-complete", validateJson(ChallengeCompleteSchema, () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  requireUser(c);

  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(invalidProjectId(), 400);
  }
  const body = c.req.valid("json");

  // Project must exist + be readable. Owners + delegated editors + any
  // future "invited player" pass through the same seam.
  await getGameProjectState(projectId);

  // Award through the standard gamification surface. Lazy import keeps
  // the route file slim + matches the existing call-site convention in
  // `routes/jobs.ts`.
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "play-game-challenge", (game, role, uid) =>
    game.award("play.game.challenge", {
      userId: uid,
      role,
      refId: `${projectId}:${body.challengeId}`,
      refType: "game_challenge",
      metadata: {
        projectId,
        challengeId: body.challengeId,
        durationMs: body.durationMs,
        ...(body.metadata ?? {}),
      },
    }),
  );

  return c.json(success({ projectId, challengeId: body.challengeId }));
});

// ─── #1656 — Game-event PWA push to the project owner ────────────────────
//
// POST /api/games/:projectId/notify-owner
// Body: { event: "peer_joined" | "challenge_awarded", peerName?, challengeId? }
//
// Called by the GameSignalingRoom Durable Object via internal fetch
// (same pattern as the existing challenge-complete forwarder). Resolves
// the project's owner, builds a stable headline + body per event kind,
// and fans out via the shared `sendPushToUser` helper. Auth model:
// trust the `x-internal-user-id` header (signaling DO is part of the
// same worker bundle — no external caller can spoof it because the
// route is mounted under the auth-required `/api/games` prefix unless
// the worker chooses to allow service-binding traffic). Best-effort —
// failure returns 200 so the DO doesn't block the gameplay loop on
// push delivery.

const NotifyOwnerSchema = z.object({
  event: z.enum(["peer_joined", "challenge_awarded"]),
  peerName: z.string().max(120).optional(),
  challengeId: z.string().max(120).optional(),
  pointsAwarded: z.number().int().optional(),
});

gamesRoutes.post("/:projectId/notify-owner", validateJson(NotifyOwnerSchema, () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(invalidProjectId(), 400);
  }
  await notifyGameOwner(projectId, c.req.valid("json"));
  return c.json(success({ delivered: true }));
});

// ─── Phase 4 — friend-invite share-links (gap #1637) ─────────────────────
//
// Owner-only:
//   POST   /:projectId/invites       — create
//   GET    /:projectId/invites       — list
//   DELETE /:projectId/invites/:id   — revoke
// Public (no auth required for resolve; join is also public — anonymous
// guests join as themselves; authed users join with their account):
//   GET  /invites/:token             — resolve token to project metadata
//   POST /invites/:token/join        — bump joined count, return gameState

const CreateInviteSchema = z.object({
  label: z.string().max(80).optional(),
  expiresInHours: z.number().min(1).max(24 * 365).optional(),
  maxUses: z.number().min(1).max(10_000).optional(),
  restrictToUserId: UuidLikeSchema.optional(),
});

gamesRoutes.post("/:projectId/invites", validateJson(CreateInviteSchema, () => error("VALIDATION_ERROR", "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(invalidProjectId(), 400);
  }
  const invite = await createGameInvite(userId, projectId, c.req.valid("json"));
  return c.json(success(invite), 201);
});

gamesRoutes.get("/:projectId/invites", async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(invalidProjectId(), 400);
  }
  return c.json(success(await listGameInvites(userId, projectId)));
});

gamesRoutes.delete("/:projectId/invites/:inviteId", async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  const inviteId = c.req.param("inviteId");
  if (!UuidLikeSchema.safeParse(projectId).success || !UuidLikeSchema.safeParse(inviteId).success) {
    return c.json(error("VALIDATION_ERROR", "Invalid id"), 400);
  }
  await revokeGameInvite(userId, projectId, inviteId);
  return c.json(success({ inviteId }));
});

// Public — anonymous guests can resolve + join. Owner identity not
// required because the token is the credential.
gamesRoutes.get("/invites/:token", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length < 8) return c.json(error("VALIDATION_ERROR", "Invalid token"), 400);
  return c.json(success(await resolveGameInvite(token)));
});

gamesRoutes.post("/invites/:token/join", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length < 8) return c.json(error("VALIDATION_ERROR", "Invalid token"), 400);
  return c.json(success(await joinGameInvite(token, c.var.userId ?? null)));
});
