/**
 * SSoT for the gamification service across HTTP routes.
 *
 * Two entry points:
 *   • `gamificationFromContext(c)` — build a configured GamificationService
 *     scoped to the current request. Both user routes (`/api/points/*`)
 *     and SuperAdmin routes (`/api/admin/impersonate/points/*`) use this
 *     so the Tremendous client can read `c.env.TREMENDOUS_*` without
 *     each call site re-implementing the env passthrough.
 *
 *   • `withGamification(c, label, fn)` — fire an event from a route
 *     handler. Resolves the scoring role from the JWT, runs the body
 *     in a try/catch that warns-but-doesn't-throw so a gamification
 *     glitch never fails the calling request (apply / save / etc.).
 *
 * Webhook / cron callers without a Hono context use
 * `GamificationService.awardWithRoleLookup` directly — that path
 * resolves the role from the DB because there's no JWT.
 */

import type { Context } from "hono";
import type { AppEnv, Env } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { pickScoringRole, type ScoringRole } from "../../../../shared/user-roles.js";
import { GamificationService } from "./index.js";

/** Cloudflare Worker env shape that survives the `Bindings` type-erasure
 *  the redemption engine needs (TREMENDOUS_*). Not all bindings are
 *  primitive strings (R2 buckets, KV namespaces), so we narrow via
 *  index-signature to `string | undefined` for the env keys we use. */
function workerEnvOf(c: Context<AppEnv>): Record<string, string | undefined> {
  const env = (c.env ?? {}) as Env;
  return env as unknown as Record<string, string | undefined>;
}

/** #1363 — `buildRepos(getDb())` rebuilt all 31 repos (and a fresh Neon
 *  client) on every gamification event. Both the db handle and the worker
 *  env are isolate-stable (one Cloudflare isolate = one DATABASE_URL + one
 *  set of TREMENDOUS_* bindings), so the configured service is built once
 *  per isolate and reused — the award methods take `userId`/`role` per call
 *  and hold no request state. This is dependency memoization (an isolate-
 *  level singleton), not a data cache. */
let cachedService: GamificationService | null = null;

export function gamificationFromContext(c: Context<AppEnv>): GamificationService {
  if (!cachedService) {
    cachedService = new GamificationService(buildRepos(getDb()), {
      workerEnv: workerEnvOf(c),
    });
  }
  return cachedService;
}

/** Callback runs inside withGamification's try/catch; the return value
 *  is awaited but discarded, so callers can simply return
 *  `game.onXxx(...)` (which resolves to `AwardOutcome`) without an extra
 *  `void` cast. */
export type GamificationCallback = (
  game: GamificationService,
  role: ScoringRole,
  userId: string,
) => Promise<unknown>;

export async function withGamification(
  c: Context<AppEnv>,
  label: string,
  fn: GamificationCallback,
): Promise<void> {
  const userId = c.var.user?.sub;
  if (!userId) return;

  const role = pickScoringRole(c.var.user?.roles);
  if (!role) return;

  try {
    await fn(gamificationFromContext(c), role, userId);
  } catch (e) {
    console.warn(`[gamification] ${label} failed`, {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
