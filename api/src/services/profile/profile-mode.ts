/**
 * Profile-mode resolver — single source of truth per
 * `project_creator_persona_model.md`.
 *
 * Every consumer that needs to know "is this profile rendering as a
 * resume or as a channel?" calls `resolveProfileMode()`. The recruiter
 * search index, the public profile route, the channel banner, the
 * monetization gates — they all import this one function. Per the
 * standing DRY rule, no caller re-implements the multi-signal flip.
 *
 * The signals (in priority order):
 *   1. Explicit user opt-in via `profile_mode = 'resume' | 'channel'`.
 *      The user's choice always wins.
 *   2. Followed: 50+ followers → channel.
 *   3. Watched: 1000+ total channel views → channel.
 *   4. Library size: 5+ public videos → channel.
 *   5. Otherwise → resume.
 */

import { and, count, eq } from "drizzle-orm";
import { isNotRenderVariant } from "../../repositories/renderVariantRepository.js";

import type { Db } from "../../db/index.js";
import { users, type User } from "../../db/schema/users.js";
import { videos } from "../../db/schema/videos.js";
import { creatorYoutubeIngests } from "../../db/schema/creators.js";

// NOTE: this module previously imported `postgres` and
// `drizzle-orm/postgres-js` to type the `db` parameter. Those packages
// rely on Node's `net` module and don't bundle for Cloudflare Workers
// (the deploy fails with "Could not resolve 'postgres'"). The whole
// project uses `@neondatabase/serverless` via `getDb()` everywhere
// else — type the parameter as `Db` and let the caller hand us the
// right instance. The runtime only ever calls `db.select()` etc.,
// which are identical across Drizzle drivers.

export type ProfileMode = "resume" | "channel";
export type ProfileModeSetting = "resume" | "channel" | "auto";

export interface ProfileSignals {
  publicVideoCount: number;
  totalViews: number;
  followerCount: number;
}

export interface ProfileModeResolution {
  mode: ProfileMode;
  setting: ProfileModeSetting;
  /** True when the resolution came from auto-flip rather than explicit opt-in. */
  auto: boolean;
  signals: ProfileSignals;
}

const FOLLOWERS_FLIP = 50;
const VIEWS_FLIP = 1000;
const VIDEOS_FLIP = 5;

/**
 * Pure resolver — given the explicit setting and the signals, return
 * the effective mode. Exported for tests and for any caller that
 * already has the signals materialised (e.g. server-rendered profile
 * pages that fetch them in batch).
 */
export function decideProfileMode(
  setting: ProfileModeSetting,
  signals: ProfileSignals,
): ProfileModeResolution {
  if (setting === "resume" || setting === "channel") {
    return { mode: setting, setting, auto: false, signals };
  }
  if (signals.followerCount >= FOLLOWERS_FLIP) {
    return { mode: "channel", setting, auto: true, signals };
  }
  if (signals.totalViews >= VIEWS_FLIP) {
    return { mode: "channel", setting, auto: true, signals };
  }
  if (signals.publicVideoCount >= VIDEOS_FLIP) {
    return { mode: "channel", setting, auto: true, signals };
  }
  return { mode: "resume", setting, auto: true, signals };
}

/**
 * Live resolver — fetches the signals for a user from the DB and runs
 * the pure resolver. The public profile route, recruiter search index
 * builder, and channel banner all call this.
 */
export async function resolveProfileMode(
  db: Db,
  user: Pick<User, "id" | "profileMode">,
): Promise<ProfileModeResolution> {
  const setting = (user.profileMode as ProfileModeSetting | null) ?? "auto";
  // Fast path: explicit opt-in needs no signal fetch.
  if (setting === "resume" || setting === "channel") {
    return decideProfileMode(setting, {
      publicVideoCount: 0,
      totalViews: 0,
      followerCount: 0,
    });
  }
  const signals = await loadSignals(db, user.id);
  return decideProfileMode(setting, signals);
}

async function loadSignals(
  db: Db,
  userId: string,
): Promise<ProfileSignals> {
  // Public videos owned by the user. Pulls from native `videos` and
  // adds YouTube ingests so the channel "Videos" tab has a single
  // count that matches what visitors see. Hidden YouTube ingests
  // don't contribute.
  const [nativeRow] = await db
    .select({ publicCount: count(videos.id) })
    .from(videos)
    .where(and(eq(videos.userId, userId), eq(videos.privacyStatus, "public"), isNotRenderVariant(videos.id)));

  const [ytRow] = await db
    .select({ count: count(creatorYoutubeIngests.id) })
    .from(creatorYoutubeIngests)
    .where(
      and(
        eq(creatorYoutubeIngests.userId, userId),
        eq(creatorYoutubeIngests.isHidden, false),
      ),
    );

  return {
    publicVideoCount:
      Number(nativeRow?.publicCount ?? 0) + Number(ytRow?.count ?? 0),
    // The view-counter and follow-graph tables are roadmap items —
    // returning 0 here keeps the resolver honest (channel auto-flip
    // currently triggers only on the video count signal). Day they
    // land, this single function picks up both signals and every
    // caller benefits without churn.
    totalViews: 0,
    followerCount: 0,
  };
}

/**
 * Look up a user by their external public handle (the creator-brand
 * identifier shown in `/u/<handle>` URLs). Single source of truth
 * for the channel route's slug resolution — never inline this query
 * elsewhere.
 */
export async function findUserByHandle(
  db: Db,
  handle: string,
): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.externalPublicHandle, handle))
    .limit(1);
  return row ?? null;
}

// Re-export `Db` so legacy callers that imported it from this module
// (rather than ../../db/index.js) keep working. New callers should
// import `Db` directly from `db/index.ts`.
export type { Db } from "../../db/index.js";
