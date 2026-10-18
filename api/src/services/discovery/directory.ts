/**
 * Discovery directory surfaces: the TikTok-style talent feed (#78), top-rated
 * companies, and creator / influencer mode (#82 — leaderboard + product
 * listings). Reads go through usersProfileRepository, companyDirectoryRepository,
 * feedPostsRepository and usersRepository.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import {
  findProfileWithVerification,
  listPublicTalentProfiles,
} from "../../repositories/usersProfileRepository.js";
import { listTopRatedCompanies } from "../../repositories/companyDirectoryRepository.js";
import { selectTopPosters } from "../../repositories/feedPostsRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { MarketingRepository } from "../../repositories/marketingRepository.js";

// ── Talent feed ─────────────────────────────────────────────────────────────

export interface TalentFeedQuery {
  limit: number;
  offset: number;
  skills: string[];
}

/** Ranked page of public, verified candidate profiles. */
export async function getTalentFeed({ limit, offset, skills }: TalentFeedQuery) {
  const rows = await listPublicTalentProfiles(limit, offset).catch(
    () => [] as Awaited<ReturnType<typeof listPublicTalentProfiles>>,
  );

  // In-memory skill filter (a DB-level filter would use the GIN index).
  const filtered = skills.length
    ? rows.filter((r) => {
        const own = Array.isArray(r.skills) ? (r.skills as string[]) : [];
        return skills.some((s) => own.some((rs) => rs.toLowerCase().includes(s.toLowerCase())));
      })
    : rows;

  // Score: video present → boost.
  const items = filtered
    .map((r) => ({
      ...r,
      score:
        (r.videoResumeUrl ? 30 : 0) + (r.headline ? 15 : 0) + (r.location ? 10 : 0) + Math.floor(Math.random() * 20),
    }))
    .sort((a, b) => b.score - a.score);

  return { items, nextCursor: rows.length === limit ? offset + limit : null };
}

/** One public candidate card. Unverified / non-public reads as not found so
 *  anonymous callers can't probe half-created accounts. */
export async function getTalentCard(userId: string) {
  const row = await findProfileWithVerification(userId);
  if (!row || row.profile.profileVisibility !== "public" || !row.emailVerified) {
    throw new DomainError(404, "NOT_FOUND", "Profile not found");
  }
  return row.profile;
}

// ── Companies ───────────────────────────────────────────────────────────────

/** Companies ranked by review aggregate, with a minimum review count. */
export async function getTopRatedCompanies(minReviews: number, limit: number) {
  const rows = await listTopRatedCompanies(minReviews, limit).catch(
    () => [] as Awaited<ReturnType<typeof listTopRatedCompanies>>,
  );
  return rows.map((r) => ({
    ...r,
    reviewAvgOverall: typeof r.reviewAvgOverall === "string" ? Number(r.reviewAvgOverall) : r.reviewAvgOverall,
  }));
}

// ── Creators ────────────────────────────────────────────────────────────────

export interface CreatorLeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  postCount: number;
}

async function loadCreatorLeaderboard(): Promise<CreatorLeaderboardEntry[]> {
  const db = getDb();
  const rows = await selectTopPosters(db, 20);
  const actors = await new UsersRepository(db).findActorsByIds(rows.map((r) => r.userId));
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    name: names.get(r.userId) ?? "Anonymous",
    postCount: Number(r.postCount),
  }));
}

/** Top creators by feed post count. Anonymous + shared, slow-moving →
 *  edge cache 300s (TTL-only). Loader errors propagate so they're never
 *  cached; the caller degrades to an empty list. */
export function getCreatorLeaderboard(): Promise<CreatorLeaderboardEntry[]> {
  return getOrSetCached({
    key: "discovery:v1:creator-leaderboard",
    ttlSeconds: 300,
    loader: loadCreatorLeaderboard,
  }).catch(() => [] as CreatorLeaderboardEntry[]);
}

export interface CreatorProductInput {
  title?: unknown;
  priceUsd?: unknown;
  [key: string]: unknown;
}

/**
 * Submit a resume template / career resource for sale. There is no
 * creator-products table yet, so the listing is recorded as a marketing-lead
 * signal and echoed back as `pending_review`.
 */
export async function submitCreatorProduct(userId: string, body: CreatorProductInput) {
  if (!body.title || !body.priceUsd) {
    throw new DomainError(400, "VALIDATION_ERROR", "title and priceUsd are required");
  }
  await new MarketingRepository(getDb())
    .insertMarketingLead({
      email: `creator+${userId}@stub`,
      source: "creator_product",
      metadata: { title: body.title, priceUsd: body.priceUsd, creatorId: userId },
    })
    .catch(() => undefined);
  return { id: `stub-${Date.now()}`, ...body, creatorId: userId, status: "pending_review" };
}

/** Published creator products — none until the products table exists. */
export function listCreatorProducts(): unknown[] {
  return [];
}
