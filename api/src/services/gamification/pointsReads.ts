/**
 * Read-side use cases for the points / campaign-$ aggregate, bound to the
 * live DB. Keeps `getDb()` and repository wiring out of the route layer
 * (routes/points.ts, routes/campaign-dollars.ts).
 */
import { getDb } from "../../db/index.js";
import { PointsRepository } from "../../repositories/pointsRepository.js";
import { getPublicBadgeCatalog, type PublicBadge } from "../../domains/gamification/badge-catalog.js";

function pointsRepo(): PointsRepository {
  return new PointsRepository(getDb());
}

/** Public showcase of every active badge (cached in badge-catalog). */
export function listPublicBadges(): Promise<PublicBadge[]> {
  return getPublicBadgeCatalog(pointsRepo());
}

/** Per-user redemption history (most recent first). */
export function listUserRedemptions(userId: string, limit = 100) {
  return pointsRepo().findRedemptionsForUser(userId, limit);
}

/** Campaign-$ balance; a zeroed balance when the user has never been granted any. */
export async function getCampaignDollarsBalance(userId: string) {
  const balance = await pointsRepo().findCampaignDollarsBalance(userId);
  return balance ?? {
    userId,
    balanceCents: 0,
    lifetimeGrantedCents: 0,
    lifetimeSpentCents: 0,
    rateCentsPer1kPoints: null,
  };
}

export function listCampaignDollarsTransactions(userId: string, limit: number) {
  return pointsRepo().listCampaignDollarsTransactions(userId, limit);
}
