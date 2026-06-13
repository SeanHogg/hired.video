/**
 * Inbox Profile — the role-keyed unit that generalises the hardwired
 * job-seeker classifier into a first-class, editable aggregate
 * (role-aware inbox processors, gaps #1979–#1985).
 *
 * The runtime is **profile-driven**, not constant-driven:
 *   • `taxonomy`        replaces the hardcoded `JOB_INBOX_CATEGORIES`
 *     as the inbox-visibility SSoT. `isJobCategory()` → `isVisibleCategory`.
 *   • `classifyPrompt`  replaces the literal `CLASSIFY_PROMPT` constant.
 *   • `extractSchema`   adds L1 structured extraction (recruiter presets).
 *   • `defaultRuleSet`  selects which code-pinned Stage-1 rule set runs
 *     (job-seeker ATS rules vs recruiter req/reply rules).
 *   • `minRelevanceScore` generalises the per-account `min_job_score`.
 *
 * Preset BODIES (the seeded system rows) are mirrored in `presets.ts`
 * so the migration seed and the parity test share one SSoT.
 *
 * Lives in `shared/` so the server classifier, the builder UI, the
 * dry-run preview, and the schema tests all agree on one contract.
 */

import type { UserRole } from "../user-roles.js";

/** One classifiable category within a profile's taxonomy. `visible`
 *  controls whether mail in this category reaches the inbox feed —
 *  this is the per-profile replacement for `JOB_INBOX_CATEGORIES`
 *  membership. Non-visible categories (newsletter/spam/personal/other,
 *  plus role-specific noise) stay in the table but are hidden. */
export interface InboxCategory {
  /** Stable machine key persisted on `external_email_messages.category`. */
  key: string;
  /** Human label for the builder UI + LLM enum descriptions. */
  label: string;
  /** Short gloss handed to the LLM so it can disambiguate categories. */
  description?: string;
  /** Reaches the inbox feed when true; kept-but-hidden when false. */
  visible: boolean;
}

/** The "noise" buckets every profile carries regardless of role. The
 *  classifier always needs somewhere to land marketing / spam / personal
 *  / unfit mail, and none of them are visible. Appended to every seeded
 *  taxonomy so the LLM enum is complete and `isVisibleCategory` works
 *  off the stored taxonomy alone. */
export const UNIVERSAL_CATEGORIES: readonly InboxCategory[] = [
  { key: "newsletter", label: "Newsletter", description: "job-board digest, marketing newsletter", visible: false },
  { key: "spam", label: "Spam", description: "unsolicited bulk, scam, fraudulent", visible: false },
  { key: "personal", label: "Personal", description: "friend/family/personal correspondence", visible: false },
  { key: "other", label: "Other", description: "does not fit any category above", visible: false },
] as const;

/** Runtime shape of an inbox profile — the DB row decoded into the form
 *  the classifier, ingest, and builder consume. Numeric/jsonb columns
 *  are coerced (numeric→number, jsonb→typed) at the repo/service edge. */
export interface InboxProfileShape {
  id: string;
  /** Null for seeded system presets; set for user-cloned profiles. */
  ownerId: string | null;
  /** USER_ROLES this profile is offered to / self-gates tabs by. */
  roles: UserRole[];
  name: string;
  description: string | null;
  /** Seeded template (true) vs editable user clone (false). */
  isPreset: boolean;
  /** Stable identifier for a seeded preset (e.g. `job_hunter`). Null for
   *  clones. Lets onboarding pick "the recruiter sourcing preset" without
   *  hardcoding a UUID. */
  presetKey: string | null;
  /** Full category set incl. the universal noise buckets. */
  taxonomy: InboxCategory[];
  /** Stage-2 system prompt. */
  classifyPrompt: string;
  /** Stage-2 summary prompt; null falls back to a generic summariser. */
  summaryPrompt: string | null;
  /** JSON-Schema-ish object describing fields to pull from each message.
   *  Null = no extraction (Job Hunter). */
  extractSchema: Record<string, unknown> | null;
  /** Which code-pinned Stage-1 default rule set applies. Null = none. */
  defaultRuleSet: string | null;
  /** Confidence floor below which a visible-category message is excluded.
   *  The per-account override (`external_email_accounts.min_relevance_score`)
   *  takes precedence when set; this is the profile-level default. */
  minRelevanceScore: number;
  /** Bumped on every edit. Part of the cache key + rules-compile
   *  invalidation token. */
  version: number;
}

/** Does a category reach the inbox feed under this profile? The
 *  per-profile replacement for `isJobCategory(category)`. */
export function isVisibleCategory(
  category: string | null | undefined,
  profile: Pick<InboxProfileShape, "taxonomy">,
): boolean {
  if (!category) return false;
  return profile.taxonomy.some((c) => c.key === category && c.visible);
}

/** Every category key the profile knows — the allowed enum the LLM may
 *  return. Includes the universal noise buckets. */
export function categoryKeys(profile: Pick<InboxProfileShape, "taxonomy">): string[] {
  return profile.taxonomy.map((c) => c.key);
}

/** The visible subset — used by the read query's category filter and the
 *  builder's "what shows in my inbox" preview. */
export function visibleCategoryKeys(profile: Pick<InboxProfileShape, "taxonomy">): string[] {
  return profile.taxonomy.filter((c) => c.visible).map((c) => c.key);
}

/** Coerce a raw DB row (numeric strings, jsonb `unknown`) into the
 *  runtime shape. Single decode seam so the repo and the cache reviver
 *  agree. Defensive against partially-shaped rows. */
export function decodeInboxProfile(row: {
  id: string;
  ownerId: string | null;
  roles: unknown;
  name: string;
  description: string | null;
  isPreset: boolean;
  presetKey: string | null;
  taxonomy: unknown;
  classifyPrompt: string;
  summaryPrompt: string | null;
  extractSchema: unknown;
  defaultRuleSet: string | null;
  minRelevanceScore: string | number | null;
  version: number;
}): InboxProfileShape {
  return {
    id: row.id,
    ownerId: row.ownerId ?? null,
    roles: Array.isArray(row.roles) ? (row.roles as UserRole[]) : [],
    name: row.name,
    description: row.description ?? null,
    isPreset: !!row.isPreset,
    presetKey: row.presetKey ?? null,
    taxonomy: Array.isArray(row.taxonomy) ? (row.taxonomy as InboxCategory[]) : [],
    classifyPrompt: row.classifyPrompt,
    summaryPrompt: row.summaryPrompt ?? null,
    extractSchema:
      row.extractSchema && typeof row.extractSchema === "object"
        ? (row.extractSchema as Record<string, unknown>)
        : null,
    defaultRuleSet: row.defaultRuleSet ?? null,
    minRelevanceScore:
      row.minRelevanceScore == null ? 0.5 : Number(row.minRelevanceScore),
    version: row.version ?? 1,
  };
}
