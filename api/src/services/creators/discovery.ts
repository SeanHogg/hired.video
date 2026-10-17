/**
 * Public creator discovery: the rating-sorted browse list and the public
 * creator profile (profile card + public portfolio + recent reviews).
 *
 * Both surfaces hide unverified accounts and creators without an active paid
 * subscription (`services/creators/visibility.ts`). Hidden creators read as
 * "not found" so anonymous callers can't probe half-created accounts.
 */
import { getDb } from "../../db/index.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import {
  listBrowseCandidates,
  findActivePublicCreator,
  listPublishedPromoReviews,
  findProfileCard,
  type CreatorProfileRow,
} from "../../repositories/creatorProfilesRepository.js";
import { listPublicPortfolio, type PortfolioItemRow } from "../../repositories/creatorPortfolioRepository.js";
import { filterVisibleCreators, isCreatorVisible } from "./visibility.js";
import { ok, fail, type CreatorResult } from "./result.js";

/** Visible creators, optionally within one marketplace category. */
export async function browseCreators(opts: { category?: string; limit: number }) {
  // Pull a wider candidate set than `limit` so the post-filter on paid-sub
  // status doesn't return short pages. Visibility is resolved for the whole
  // candidate set in one batched call (fixed query count, not per row).
  const candidates = await listBrowseCandidates(getDb(), { category: opts.category, limit: opts.limit * 3 });
  const visible = await filterVisibleCreators(candidates.map((row) => row.user.id));
  return candidates.filter((row) => visible.has(row.user.id)).slice(0, opts.limit);
}

/** Whether the user exists and has verified their email address. */
export async function isEmailVerifiedUser(userId: string): Promise<boolean> {
  const status = await new UsersRepository(getDb()).findVerificationStatus(userId);
  return !!status?.emailVerified;
}

const REVIEW_LIMIT = 20;

export interface PublicCreatorProfile {
  creator: CreatorProfileRow;
  profile: { avatarUrl: string | null; headline: string | null } | null;
  portfolio: PortfolioItemRow[];
  reviews: Awaited<ReturnType<typeof listPublishedPromoReviews>>;
}

export async function getPublicCreatorProfile(targetId: string): Promise<CreatorResult<PublicCreatorProfile>> {
  const notFound = () => fail<PublicCreatorProfile>(404, "NOT_FOUND", "Creator not found");
  if (!(await isEmailVerifiedUser(targetId))) return notFound();

  const db = getDb();
  const creator = await findActivePublicCreator(db, targetId);
  if (!creator) return notFound();
  if (!(await isCreatorVisible(targetId))) return notFound();

  const [portfolio, reviews, profile] = await Promise.all([
    listPublicPortfolio(db, targetId),
    listPublishedPromoReviews(db, targetId, REVIEW_LIMIT),
    findProfileCard(db, targetId),
  ]);
  return ok({ creator, profile: profile[0] ?? null, portfolio, reviews });
}
