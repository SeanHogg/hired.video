/**
 * Inbox profile resolution + cache.
 *
 * The classifier/ingest path resolves the active profile for a mailbox
 * through `resolveAccountProfile`, which serves a read-through cache
 * (getOrSetIsolateCached — isolate-only, zero KV writes; per-profile keys
 * are unbounded) keyed on the profile id.
 * Profile reads are hot (every sync chunk) and slow-changing, so caching
 * them is a first-class requirement; the cache is invalidated explicitly
 * whenever a profile is edited or deleted (`invalidateInboxProfile`).
 *
 * Fallback chain (zero-regression): an account with no `active_profile_id`
 * — i.e. every mailbox connected before profiles existed — resolves to
 * the seeded **Job Hunter** preset, which reproduces the pre-profiles
 * job-seeker classifier byte-for-byte.
 */

import type { Repos } from "../../repositories/index.js";
import type { InboxProfileRow } from "../../repositories/inboxProfilesRepository.js";
import type { ExternalEmailAccountRow } from "../../repositories/externalEmailAccountsRepository.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import {
  decodeInboxProfile,
  type InboxProfileShape,
  presetToProfile,
  JOB_HUNTER,
  PRESET_IDS,
} from "../../../../shared/email-classification/index.js";

/** Short: invalidation clears this isolate only; others converge in TTL. */
const CACHE_TTL_SECONDS = 120;

function cacheKey(profileId: string): string {
  return `inbox-profile:${profileId}`;
}

type ProfileRepos = Pick<Repos, "inboxProfiles">;

/** Decode a raw DB row into the runtime profile shape. */
function rowToProfile(row: InboxProfileRow): InboxProfileShape {
  return decodeInboxProfile({
    id: row.id,
    ownerId: row.ownerId ?? null,
    roles: row.roles,
    name: row.name,
    description: row.description ?? null,
    isPreset: row.isPreset,
    presetKey: row.presetKey ?? null,
    taxonomy: row.taxonomy,
    classifyPrompt: row.classifyPrompt,
    summaryPrompt: row.summaryPrompt ?? null,
    extractSchema: row.extractSchema,
    defaultRuleSet: row.defaultRuleSet ?? null,
    minRelevanceScore: row.minRelevanceScore as any,
    version: row.version,
  });
}

/** The Job Hunter preset materialised from code — the universal fallback
 *  when an account has no profile and the seed row somehow can't be read
 *  (e.g. a test DB without the seed). Guarantees the job-seeker path
 *  never breaks even if the DB lookup is empty. */
const JOB_HUNTER_FALLBACK: InboxProfileShape = presetToProfile(JOB_HUNTER);

/** Load a profile by id through the cache. Returns null if it doesn't
 *  exist (deleted profile referenced by a stale account FK). */
export async function getInboxProfileById(
  repos: ProfileRepos,
  profileId: string,
): Promise<InboxProfileShape | null> {
  return getOrSetIsolateCached<InboxProfileShape | null>({
    key: cacheKey(profileId),
    ttlSeconds: CACHE_TTL_SECONDS,
    loader: async () => {
      const row = await repos.inboxProfiles.findById(profileId);
      return row ? rowToProfile(row) : null;
    },
  });
}

/** Resolve the active profile for a mailbox. Falls back to the Job Hunter
 *  preset (seeded row, then code constant) so a mailbox with no profile
 *  classifies exactly as before. */
export async function resolveAccountProfile(
  repos: ProfileRepos,
  account: Pick<ExternalEmailAccountRow, "activeProfileId">,
): Promise<InboxProfileShape> {
  if (account.activeProfileId) {
    const profile = await getInboxProfileById(repos, account.activeProfileId);
    if (profile) return profile;
  }
  // No / dangling profile → Job Hunter. Prefer the seeded row (so a user
  // edit to the shared preset is honoured) but fall back to the code
  // constant if the seed is missing.
  const seeded = await getInboxProfileById(repos, PRESET_IDS.job_hunter);
  return seeded ?? JOB_HUNTER_FALLBACK;
}

/** Drop a profile from the cache. MUST be called by every mutation that
 *  edits or deletes a profile (the builder + onboarding seeding). */
export function invalidateInboxProfile(profileId: string): void {
  invalidateIsolateKey(cacheKey(profileId));
}
