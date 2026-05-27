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
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { studioProjects } from "../db/schema/resumes.js";
import { gamePlayInvites } from "../db/schema/games.js";
import { canActFor } from "../services/studio/workspace.js";

export const gamesRoutes = new Hono<AppEnv>();

// ─── Shared response helpers ─────────────────────────────────────────────
//
// Inlined (and identical to studio-features.ts / studio.ts copies) — the
// `ok` / `fail` helpers are a project-wide convention. Extracting them
// to a shared module is tracked separately; for now the duplication is
// intentional to keep route files self-contained.

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

type ProjectGuard =
  | { ok: true; userId: string; companyId: string | null; gameState: unknown }
  | { ok: false; status: 404; code: "NOT_FOUND" };

/** Resolve a project + assert the caller can act on it. Returns a
 *  discriminated-union result every route here can narrow against
 *  without duplicating the auth seam. */
async function loadActableProject(projectId: string, actorUserId: string): Promise<ProjectGuard> {
  const db = getDb();
  const [row] = await db
    .select({
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      gameState: studioProjects.gameState,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!row) return { ok: false, status: 404, code: "NOT_FOUND" };
  const allowed = await canActFor(actorUserId, row.userId, row.companyId ?? null);
  if (!allowed) return { ok: false, status: 404, code: "NOT_FOUND" };
  return { ok: true, userId: row.userId, companyId: row.companyId ?? null, gameState: row.gameState };
}

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

gamesRoutes.post("/:projectId/challenge-complete", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in to earn points"), 401);

  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid projectId"), 400);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = ChallengeCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);
  }

  // Project must exist + be readable. Owners + delegated editors + any
  // future "invited player" pass through the same seam.
  const db = getDb();
  const [project] = await db
    .select({
      id: studioProjects.id,
      gameState: studioProjects.gameState,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  // Award through the standard gamification surface. Lazy import keeps
  // the route file slim + matches the existing call-site convention in
  // `routes/jobs.ts`.
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "play-game-challenge", (game, role, uid) =>
    game.award("play.game.challenge", {
      userId: uid,
      role,
      refId: `${projectId}:${parsed.data.challengeId}`,
      refType: "game_challenge",
      metadata: {
        projectId,
        challengeId: parsed.data.challengeId,
        durationMs: parsed.data.durationMs,
        ...(parsed.data.metadata ?? {}),
      },
    }),
  );

  return c.json(ok({ projectId, challengeId: parsed.data.challengeId }));
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

/** URL-safe random token. 18 bytes → ~24 base64url chars. Enough
 *  entropy to make guessing impractical; short enough that the share
 *  link fits in a single tap-to-copy line. */
function randomInviteToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

gamesRoutes.post("/:projectId/invites", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid projectId"), 400);
  }
  const guard = await loadActableProject(projectId, user.sub);
  if (guard.ok === false) {
    return c.json(fail(guard.code, "Project not found"), guard.status);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateInviteSchema.safeParse(body ?? {});
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const expiresAt = parsed.data.expiresInHours
    ? new Date(Date.now() + parsed.data.expiresInHours * 3600_000)
    : null;

  const db = getDb();
  const [invite] = await db
    .insert(gamePlayInvites)
    .values({
      projectId,
      createdBy: user.sub,
      token: randomInviteToken(),
      label: parsed.data.label ?? null,
      maxUses: parsed.data.maxUses ?? null,
      restrictToUserId: parsed.data.restrictToUserId ?? null,
      expiresAt,
    })
    .returning();

  return c.json(ok(invite), 201);
});

gamesRoutes.get("/:projectId/invites", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const projectId = c.req.param("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid projectId"), 400);
  }
  const guard = await loadActableProject(projectId, user.sub);
  if (guard.ok === false) {
    return c.json(fail(guard.code, "Project not found"), guard.status);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(gamePlayInvites)
    .where(eq(gamePlayInvites.projectId, projectId))
    .orderBy(desc(gamePlayInvites.createdAt))
    .limit(50);
  return c.json(ok(rows));
});

gamesRoutes.delete("/:projectId/invites/:inviteId", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const projectId = c.req.param("projectId");
  const inviteId = c.req.param("inviteId");
  if (!UuidLikeSchema.safeParse(projectId).success || !UuidLikeSchema.safeParse(inviteId).success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid id"), 400);
  }
  const guard = await loadActableProject(projectId, user.sub);
  if (guard.ok === false) {
    return c.json(fail(guard.code, "Project not found"), guard.status);
  }

  const db = getDb();
  await db
    .update(gamePlayInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(gamePlayInvites.id, inviteId), eq(gamePlayInvites.projectId, projectId)));
  return c.json(ok({ inviteId }));
});

// Public — anonymous guests can resolve + join. Owner identity not
// required because the token is the credential.
gamesRoutes.get("/invites/:token", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length < 8) return c.json(fail("VALIDATION_ERROR", "Invalid token"), 400);

  const db = getDb();
  const [invite] = await db
    .select({
      id: gamePlayInvites.id,
      projectId: gamePlayInvites.projectId,
      label: gamePlayInvites.label,
      maxUses: gamePlayInvites.maxUses,
      joinedCount: gamePlayInvites.joinedCount,
      restrictToUserId: gamePlayInvites.restrictToUserId,
      revokedAt: gamePlayInvites.revokedAt,
      expiresAt: gamePlayInvites.expiresAt,
    })
    .from(gamePlayInvites)
    .where(eq(gamePlayInvites.token, token))
    .limit(1);
  if (!invite) return c.json(fail("NOT_FOUND", "Invite not found"), 404);

  const inviteStatus = computeInviteStatus(invite);
  if (inviteStatus !== "active") {
    return c.json(fail(inviteStatus.toUpperCase(), `Invite is ${inviteStatus}`), 410);
  }

  const [project] = await db
    .select({
      id: studioProjects.id,
      // `studio_projects` doesn't carry a per-row display name — the
      // project's identity is the `studio_templates` template that
      // seeded it + the user's local "draft" naming convention. Invite
      // label is the user-facing title on the play landing.
      gameState: studioProjects.gameState,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, invite.projectId))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  return c.json(
    ok({
      projectId: project.id,
      label: invite.label,
      gameState: project.gameState,
    }),
  );
});

gamesRoutes.post("/invites/:token/join", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length < 8) return c.json(fail("VALIDATION_ERROR", "Invalid token"), 400);

  const db = getDb();
  const [invite] = await db
    .select()
    .from(gamePlayInvites)
    .where(eq(gamePlayInvites.token, token))
    .limit(1);
  if (!invite) return c.json(fail("NOT_FOUND", "Invite not found"), 404);

  const inviteStatus = computeInviteStatus(invite);
  if (inviteStatus !== "active") {
    return c.json(fail(inviteStatus.toUpperCase(), `Invite is ${inviteStatus}`), 410);
  }

  // Optional account-bound link — only the matched user may join.
  // Anonymous callers (no JWT) are rejected when restrictToUserId is set.
  const callerUserId = c.var.user?.sub ?? null;
  if (invite.restrictToUserId && invite.restrictToUserId !== callerUserId) {
    return c.json(fail("FORBIDDEN", "This invite is bound to a specific account"), 403);
  }

  await db
    .update(gamePlayInvites)
    .set({ joinedCount: sql`${gamePlayInvites.joinedCount} + 1` })
    .where(eq(gamePlayInvites.id, invite.id));

  return c.json(ok({ projectId: invite.projectId }));
});

/** Compute the current status of an invite — single seam so the
 *  resolve + join paths can't drift on what "expired" means. */
function computeInviteStatus(invite: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  joinedCount: number;
}): "active" | "revoked" | "expired" | "exhausted" {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return "expired";
  if (invite.maxUses != null && invite.joinedCount >= invite.maxUses) return "exhausted";
  return "active";
}
