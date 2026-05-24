/**
 * SSoT for "I'm in a route handler, fire a points event". Resolves the
 * scoring role from the JWT, builds the service, runs the body inside a
 * try/catch that warns-but-doesn't-throw so a gamification glitch never
 * fails the calling request (apply / save / etc.).
 *
 * Use this in any HTTP route that wants to record an action. Webhook /
 * cron callers should use `GamificationService.awardWithRoleLookup`
 * directly instead — that path resolves the role from the DB because
 * there's no JWT.
 */

import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { pickScoringRole, type ScoringRole } from "../../../../shared/user-roles.js";
import { GamificationService } from "./index.js";

export type GamificationCallback = (
  game: GamificationService,
  role: ScoringRole,
  userId: string,
) => Promise<void>;

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
    const game = new GamificationService(buildRepos(getDb()), {
      workerEnv: c.env as never,
    });
    await fn(game, role, userId);
  } catch (e) {
    console.warn(`[gamification] ${label} failed`, {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
