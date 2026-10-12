/**
 * Create intent — what a visitor is here to make (#2363). ONE resolver shared
 * by the studio home's chooser and the /for/:audience landing pages, so the
 * studio opens on the right creation without asking "what do you want to
 * make?" first, and never through a per-page branch.
 *
 *   resume  → a career kit: résumé + cover letter + video (/studio/new)
 *   video   → a studio video seeded from a template (upload your footage)
 *   job     → a job post on the studio's document canvas (#1915)
 *   company → a company page on the studio's document canvas (#1915)
 *
 * `job` and `company` are the hiring side: they are offered only while the
 * hiring personas are on (HIRING_PERSONAS_ENABLED), the same switch every
 * other hiring surface follows. With it off, a recruiter / employer account
 * sees the job-seeker set (see shared/user-roles.ts).
 *
 * Pure (no React, no storage) so it is unit-testable; the per-viewer memory
 * of the last pick and the landing page they came from lives in
 * components/landing/create-intent-memory.ts.
 */
import { HIRING_PERSONAS_ENABLED, USER_ROLES } from "@shared/user-roles";
import { audienceKeyFromSlug, taxonomyOf, type LifeStageAudience } from "@shared/audiences";
import { lifeStageAudienceMeta } from "@shared/audiences-registry";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { ALL_AUDIENCES } from "@/lib/studio/templates/audiences";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";

export const CREATE_INTENTS = ["resume", "video", "job", "company"] as const;
export type CreateIntent = (typeof CREATE_INTENTS)[number];

/** The intents that belong to the hiring side (gated by the persona switch). */
const HIRING_INTENTS: ReadonlySet<CreateIntent> = new Set<CreateIntent>(["job", "company"]);

/** The `/studio?for=<audience>` param a landing page hands its source off
 *  with (not a studio deep-link param, so the chooser renders). */
export const LANDING_SOURCE_PARAM = "for";

/** Fallback when nothing else says what the visitor wants: the core loop. */
export const DEFAULT_CREATE_INTENT: CreateIntent = "resume";

/** The studio format a video start opens when the caller names none
 *  ("Video from scratch" — the New menu's blank video). */
export const DEFAULT_VIDEO_TEMPLATE = "basic";

export function isCreateIntent(value: unknown): value is CreateIntent {
  return typeof value === "string" && (CREATE_INTENTS as readonly string[]).includes(value);
}

/** The intents currently offered, in display order. */
export function availableCreateIntents(hiringEnabled: boolean = HIRING_PERSONAS_ENABLED): CreateIntent[] {
  return CREATE_INTENTS.filter((i) => hiringEnabled || !HIRING_INTENTS.has(i));
}

/** Where an intent's upload step lives. `videoTemplate` seeds a video start
 *  with an audience's own template instead of the blank one. */
export function createIntentHref(intent: CreateIntent, opts: { videoTemplate?: string } = {}): string {
  switch (intent) {
    case "resume":
      return NEW_KIT_PATH;
    case "video":
      return `/studio?contentTemplate=${encodeURIComponent(opts.videoTemplate ?? DEFAULT_VIDEO_TEMPLATE)}`;
    case "job":
      return studioNewEntityHref("job");
    case "company":
      return studioNewEntityHref("company");
  }
}

/** The document an intent creates — the create step (#2221) offers a design
 *  template (and, for a résumé, master or variant) before it starts. A video
 *  start has no such step (null). */
export function documentKindForIntent(intent: CreateIntent): "resume" | "job" | "company" | null {
  return intent === "video" ? null : intent;
}

/** The intent a USER_ROLES value implies (unknown / staff roles → null). */
export function intentForRole(role: string | null | undefined): CreateIntent | null {
  switch (role) {
    case USER_ROLES.JOB_SEEKER:
    case USER_ROLES.EMPLOYEE:
      return "resume";
    case USER_ROLES.CREATOR:
      return "video";
    case USER_ROLES.RECRUITER:
      return "job";
    case USER_ROLES.EMPLOYER:
      return "company";
    default:
      return null;
  }
}

const PROFESSION_INTENT = new Map<string, CreateIntent>(ALL_AUDIENCES.map((a) => [a.id, a.createIntent]));

/**
 * The intent a /for/:audience page implies. Accepts the URL slug as either
 * taxonomy spells it: profession ids are snake_case (`/for/data_analyst`),
 * life-stage slugs kebab-case (`/for/recent-graduates`). Life-stage pages
 * follow their audience's primary role. Unknown → null.
 */
export function intentForAudienceSlug(slug: string | null | undefined): CreateIntent | null {
  const raw = (slug ?? "").trim().toLowerCase();
  if (!raw) return null;
  const profession = PROFESSION_INTENT.get(raw) ?? PROFESSION_INTENT.get(raw.replace(/-/g, "_"));
  if (profession) return profession;
  const key = audienceKeyFromSlug(raw);
  if (!key || taxonomyOf(key) !== "life_stage") return null;
  const meta = lifeStageAudienceMeta(key as LifeStageAudience);
  return meta ? intentForRole(meta.primaryRole) ?? DEFAULT_CREATE_INTENT : null;
}

/** The loop a /for/:audience page starts — its slug's intent, else the default. */
export function startIntentForAudience(slug: string): CreateIntent {
  return intentForAudienceSlug(slug) ?? DEFAULT_CREATE_INTENT;
}

/** What the resolver needs from the signed-in user (null = signed out). */
export interface CreateIntentUser {
  role?: string | null;
}

/** Saved per-viewer preferences: the intent they last picked. */
export interface CreateIntentPreferences {
  lastIntent?: string | null;
}

/** The landing page the visitor arrived from (`/for/<audience>`). */
export interface CreateIntentLandingSource {
  audience?: string | null;
}

export interface ResolveCreateIntentOptions {
  /** Injectable persona switch (tests); defaults to HIRING_PERSONAS_ENABLED. */
  hiringEnabled?: boolean;
}

/**
 * The intent the studio opens on. Precedence — the freshest, most explicit
 * signal wins:
 *
 *   1. the landing page they just came from (they told us by clicking it)
 *   2. the intent they last picked themselves
 *   3. their role
 *   4. the core loop (`resume`)
 *
 * Any candidate that isn't currently offered (a hiring intent while the
 * hiring personas are off) is skipped, so the result is always available.
 */
export function resolveCreateIntent(
  user: CreateIntentUser | null | undefined,
  preferences: CreateIntentPreferences | null | undefined,
  landingSource: CreateIntentLandingSource | null | undefined,
  options: ResolveCreateIntentOptions = {},
): CreateIntent {
  const available = new Set(availableCreateIntents(options.hiringEnabled));
  const lastIntent = preferences?.lastIntent;
  const candidates: (CreateIntent | null)[] = [
    intentForAudienceSlug(landingSource?.audience),
    isCreateIntent(lastIntent) ? lastIntent : null,
    intentForRole(user?.role),
  ];
  return candidates.find((c): c is CreateIntent => c !== null && available.has(c)) ?? DEFAULT_CREATE_INTENT;
}

/** The offered intents with `first` leading (the chooser's order). */
export function orderCreateIntents(first: CreateIntent, hiringEnabled?: boolean): CreateIntent[] {
  const rest = availableCreateIntents(hiringEnabled).filter((i) => i !== first);
  return [first, ...rest];
}
