/**
 * Partner job-seeker service — account creation, connect-existing-account, and
 * the live profile payload a partner reads / embeds.
 *
 * Resume creation is intentionally NOT here: the partner route delegates to the
 * canonical `handleCreateResume` (services/resume/ResumeService.ts) with the
 * connected user's id, so partner uploads go through the exact same heal +
 * validate + auto-promote write path as the first-party UI (DRY).
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { hashPassword } from "../../routes/auth.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { buildRepos } from "../../repositories/index.js";
import { getVisiblePitch } from "../pitch/pitchService.js";
import { rowToResume } from "../../handlers/resume-serializer.js";
import { getDefaultProfileSections } from "../../../../shared/profile-sections.js";
import {
  upsertConnection,
  findUserByEmail,
  getConnectionByExternalUserId,
  partnerProfileCacheKey,
  type PartnerConnectionRow,
} from "./connections.js";
import type { PartnerResumeStatus, PartnerScope } from "../../../../shared/partner.js";

const { users, userProfiles } = schema;

/** Public base URL of the app (where claim / consent links resolve). */
export function appBaseUrl(): string {
  return (
    process?.env?.PUBLIC_APP_URL ||
    process?.env?.FRONTEND_URL ||
    process?.env?.APP_URL ||
    (globalThis as any).__ENV?.PUBLIC_APP_URL ||
    (globalThis as any).__ENV?.FRONTEND_URL ||
    "https://hired.video"
  ).replace(/\/$/, "");
}

async function issueClaimLink(email: string, name: string, db = getDb()): Promise<string> {
  // Mirror routes/auth.ts magic-link mint: invalidate old tokens, mint a fresh
  // 24h token (longer than the 15m login link — a partner-provisioned user may
  // not check email immediately), point it at onboarding.
  await db
    .update(schema.magicLinkTokens)
    .set({ used: true } as any)
    .where(and(eq(schema.magicLinkTokens.email, email), eq(schema.magicLinkTokens.used, false)));
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const redirect = "/dashboard";
  await db
    .insert(schema.magicLinkTokens)
    .values({ email, token, expiresAt, redirect, used: false } as any);
  return `${appBaseUrl()}/auth/magic-link?token=${token}&redirect=${encodeURIComponent(redirect)}`;
}

export interface CreateJobSeekerInput {
  partnerId: string;
  email: string;
  name: string;
  /** Optional — if omitted a random password + mustChangePassword is set and
   *  the job seeker sets their own via the claim link. */
  password?: string | null;
  externalUserId?: string | null;
  grantScopes: PartnerScope[];
}

export type CreateJobSeekerResult =
  | {
      ok: true;
      userId: string;
      connection: PartnerConnectionRow;
      claimUrl: string;
      /** True when this externalUserId was already provisioned — the call was a
       *  no-op idempotent hit, not a fresh account. */
      alreadyExisted: boolean;
    }
  | { ok: false; code: "EMAIL_EXISTS"; userId: string };

/**
 * Create a Hired.Video job-seeker account attributed to the partner. The
 * account is real and first-class — the job seeker can log in via the returned
 * claim link and their edits flow back to every surface. Attribution (utm) is
 * pinned so growth reporting can group signups by partner.
 */
export async function createJobSeekerForPartner(
  input: CreateJobSeekerInput,
  db = getDb(),
): Promise<CreateJobSeekerResult> {
  const email = input.email.toLowerCase().trim();

  // Idempotency (#5): a repeat create for the same externalUserId (retry, at-
  // least-once webhook, re-registration) returns the EXISTING account instead
  // of erroring, so callers can treat create as find-or-create. Keyed on
  // (partnerId, externalUserId) — the partner's own id for the user.
  if (input.externalUserId) {
    const prior = await getConnectionByExternalUserId(input.partnerId, input.externalUserId, db);
    if (prior) {
      const claimUrl = await issueClaimLink(email, input.name || email, db);
      return { ok: true, userId: prior.userId, connection: prior, claimUrl, alreadyExisted: true };
    }
  }

  const existing = await findUserByEmail(email, db);
  if (existing) {
    // Don't silently take over an existing account — the partner must run the
    // consent-gated connect flow instead.
    return { ok: false, code: "EMAIL_EXISTS", userId: existing.id };
  }

  const rawPassword = input.password || crypto.randomUUID() + crypto.randomUUID();
  const passwordHash = await hashPassword(rawPassword);
  const [user] = await db
    .insert(users)
    .values({
      email,
      name: input.name || email,
      passwordHash,
      role: "job_seeker",
      // No password supplied → force a reset on first login via claim link.
      mustChangePassword: !input.password,
      // Partner attribution — mirrors the organic signup attribution snapshot.
      utmSource: "partner",
      utmMedium: "sdk",
      utmCampaign: input.partnerId,
    } as any)
    .returning({ id: users.id });

  if (!user) throw new Error("Failed to create job seeker account.");

  // Seed the user_profiles row with role-based section-visibility defaults —
  // the same seed handleRegister does, so partner-created accounts render
  // /people/[id] identically to organic signups (was missing before).
  await db
    .insert(userProfiles)
    .values({ userId: user.id, profileSections: getDefaultProfileSections("job_seeker") } as any)
    .onConflictDoNothing({ target: userProfiles.userId })
    .catch(() => undefined);

  const connection = await upsertConnection(
    {
      partnerId: input.partnerId,
      userId: user.id,
      source: "partner_created",
      scopes: input.grantScopes,
      externalUserId: input.externalUserId,
      activate: true, // partner provisioned it → consent implicit
    },
    db,
  );

  const claimUrl = await issueClaimLink(email, input.name || email, db);
  return { ok: true, userId: user.id, connection, claimUrl, alreadyExisted: false };
}

export interface ConnectExistingInput {
  partnerId: string;
  partnerSlug: string;
  email: string;
  externalUserId?: string | null;
  grantScopes: PartnerScope[];
  /** Where to send the job seeker back after they approve/deny. */
  redirectUrl?: string | null;
}

export type ConnectExistingResult =
  | { ok: true; userId: string; connectionId: string; consentUrl: string; status: string }
  | { ok: false; code: "NOT_FOUND" };

/**
 * Begin connecting an EXISTING Hired.Video account to the partner. Creates a
 * `pending` connection and returns a hosted consent URL the partner sends the
 * job seeker to. Access does NOT activate until the job seeker approves there.
 */
export async function connectExistingAccount(
  input: ConnectExistingInput,
  db = getDb(),
): Promise<ConnectExistingResult> {
  const user = await findUserByEmail(input.email, db);
  if (!user) return { ok: false, code: "NOT_FOUND" };

  const connection = await upsertConnection(
    {
      partnerId: input.partnerId,
      userId: user.id,
      source: "connected",
      scopes: input.grantScopes,
      externalUserId: input.externalUserId,
      activate: false, // pending until the job seeker consents
    },
    db,
  );

  const params = new URLSearchParams({ connection: connection.id });
  if (input.redirectUrl) params.set("redirect", input.redirectUrl);
  const consentUrl = `${appBaseUrl()}/connect/authorize?${params.toString()}`;
  return { ok: true, userId: user.id, connectionId: connection.id, consentUrl, status: connection.status };
}

// ── Live profile payload (partner read + embed) ─────────────────────────────
export interface PartnerExperienceItem {
  company: string;
  position: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  highlights: string[];
}

export interface PartnerEducationItem {
  institution: string;
  area: string | null;
  studyType: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** Flat, typed extract for skill-prefill + display — derived from the active
 *  résumé so a partner never has to parse JSON Resume themselves (#2). */
export interface PartnerProfileSummary {
  skills: string[];
  headline: string | null;
  summary: string | null;
  location: string | null;
  experience: PartnerExperienceItem[];
  education: PartnerEducationItem[];
}

export interface PartnerProfilePayload {
  user: {
    id: string;
    name: string;
    email: string | null;
    handle: string | null;
    headline: string | null;
    location: string | null;
    avatarUrl: string | null;
    videoPitchUrl: string | null;
  };
  /** Documented, stable extract for prefill/display (#2). */
  profile: PartnerProfileSummary;
  /** Whether the résumé is populated yet (#4). */
  resumeStatus: PartnerResumeStatus;
  /** ISO timestamp of the most recent résumé/profile change — poll/ETag key
   *  for keeping a cached copy fresh (#6 polling contract). */
  updatedAt: string | null;
  resume: ReturnType<typeof rowToResume> | null;
}

/** Newer of two timestamps (either may be null) — a pitch change must move
 *  the partner's poll/ETag key just like a résumé edit. */
function latestTimestamp(a: Date | string | null, b: Date | string | null): Date | string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/** Case-insensitive field read (JSON Resume lowercase vs legacy PascalCase). */
function ci(obj: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!obj) return undefined;
  return obj[key] ?? obj[key.charAt(0).toUpperCase() + key.slice(1)];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Derive the flat {@link PartnerProfileSummary} from a résumé's JSON content.
 * Pure — no DB/AI — so it's identical for the API read and the embed. Handles
 * both JSON Resume (lowercase) and legacy PascalCase keys.
 */
export function deriveStructuredProfile(
  content: Record<string, unknown> | null | undefined,
  fallback: { headline: string | null; location: string | null },
): PartnerProfileSummary {
  const basics = (ci(content, "basics") ?? {}) as Record<string, unknown>;

  // Skills: JSON Resume `skills[]` is [{ name, keywords[] }] | string[].
  const skillSet = new Set<string>();
  const rawSkills = ci(content, "skills");
  if (Array.isArray(rawSkills)) {
    for (const s of rawSkills) {
      if (typeof s === "string") {
        if (s.trim()) skillSet.add(s.trim());
      } else if (s && typeof s === "object") {
        const name = str(ci(s as Record<string, unknown>, "name"));
        if (name) skillSet.add(name);
        const kw = ci(s as Record<string, unknown>, "keywords");
        if (Array.isArray(kw)) for (const k of kw) if (typeof k === "string" && k.trim()) skillSet.add(k.trim());
      }
    }
  }

  const experience: PartnerExperienceItem[] = (
    Array.isArray(ci(content, "work")) ? (ci(content, "work") as unknown[]) : []
  ).map((w) => {
    const j = (w ?? {}) as Record<string, unknown>;
    const highlights = ci(j, "highlights");
    return {
      company: str(ci(j, "name")) ?? str(ci(j, "company")) ?? "",
      position: str(ci(j, "position")) ?? str(ci(j, "title")) ?? "",
      startDate: str(ci(j, "startDate")),
      endDate: str(ci(j, "endDate")),
      summary: str(ci(j, "summary")),
      highlights: Array.isArray(highlights) ? highlights.filter((h): h is string => typeof h === "string") : [],
    };
  });

  const education: PartnerEducationItem[] = (
    Array.isArray(ci(content, "education")) ? (ci(content, "education") as unknown[]) : []
  ).map((e) => {
    const ed = (e ?? {}) as Record<string, unknown>;
    return {
      institution: str(ci(ed, "institution")) ?? str(ci(ed, "school")) ?? "",
      area: str(ci(ed, "area")),
      studyType: str(ci(ed, "studyType")),
      startDate: str(ci(ed, "startDate")),
      endDate: str(ci(ed, "endDate")),
    };
  });

  const loc = ci(basics, "location") as Record<string, unknown> | null | undefined;
  const locFromResume = loc
    ? [str(ci(loc, "city")), str(ci(loc, "region")) ?? str(ci(loc, "countryCode"))].filter(Boolean).join(", ")
    : "";

  return {
    skills: [...skillSet],
    headline: fallback.headline ?? str(ci(basics, "label")),
    summary: str(ci(basics, "summary")),
    location: fallback.location ?? (locFromResume || null),
    experience,
    education,
  };
}

/**
 * Build the live profile + active resume payload. This is the SAME payload
 * returned to a partner via the API and rendered in the embed iframe, so the
 * two can never drift. Returns null when the user doesn't exist.
 */
export async function buildPartnerProfilePayload(
  userId: string,
  opts: { includeEmail?: boolean } = {},
  db = getDb(),
): Promise<PartnerProfilePayload | null> {
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      handle: userProfiles.customUrlSlug,
      headline: userProfiles.headline,
      location: userProfiles.location,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;

  // The active (or first master) resume — the one the extension/public views
  // surface. Read via the repo so serialization matches every other surface.
  // The pitch (#1237) is the user's current `purpose: "pitch"` studio
  // project; `videoPitchUrl` keeps its name on the partner contract. The
  // partner republishes the profile, so a hidden "videoResume" section
  // means no pitch here either (#2391).
  const { resumes: repo, pitches } = buildRepos(db);
  const [rows, pitch] = await Promise.all([
    repo.findAllForOwner(userId),
    getVisiblePitch(userId, pitches),
  ]);
  const chosen = selectPrimaryResume(rows as Array<any>);

  const content = (chosen?.content ?? null) as Record<string, unknown> | null;
  const profile = deriveStructuredProfile(content, {
    headline: u.headline ?? null,
    location: u.location ?? null,
  });
  const chosenUpdatedAt = latestTimestamp(chosen?.updatedAt ?? chosen?.createdAt ?? null, pitch?.recordedAt ?? null);

  return {
    user: {
      id: u.id,
      name: u.name,
      email: opts.includeEmail ? u.email : null,
      handle: u.handle ?? null,
      headline: u.headline ?? null,
      location: u.location ?? null,
      avatarUrl: u.avatarUrl ?? null,
      videoPitchUrl: pitch?.videoUrl ?? null,
    },
    profile,
    resumeStatus: chosen ? "ready" : "none",
    updatedAt: chosenUpdatedAt ? new Date(chosenUpdatedAt).toISOString() : null,
    resume: chosen ? rowToResume(chosen, { isOwner: false, isWatched: false, viewCount: 0 }) : null,
  };
}

/**
 * Resolve a partner's externalUserId → the Hired.Video account + connection
 * status (#5/#7). Returns null when the partner has never provisioned/connected
 * that externalUserId. Reads the connection directly (no active-connection
 * gate) so a partner can learn the mapping even while a connect() consent is
 * still `pending`.
 */
export async function getByExternalUserIdForPartner(
  partnerId: string,
  externalUserId: string,
  db = getDb(),
): Promise<{
  userId: string;
  connectionId: string;
  externalUserId: string | null;
  status: string;
  source: string;
} | null> {
  const conn = await getConnectionByExternalUserId(partnerId, externalUserId, db);
  if (!conn) return null;
  return {
    userId: conn.userId,
    connectionId: conn.id,
    externalUserId: conn.externalUserId,
    status: conn.status,
    source: conn.source,
  };
}

/** Pick the resume a partner surfaces — the active one, else master, else the
 *  first. ONE selection rule shared by the profile payload and embed minting. */
export function selectPrimaryResume<T extends { isActive?: boolean; isMaster?: boolean }>(
  rows: T[],
): T | null {
  return rows.find((r) => r.isActive) ?? rows.find((r) => r.isMaster) ?? rows[0] ?? null;
}

/** The identifier the partner embed iframe points at (reuses the canonical
 *  `/embedded/resume/:identifier` surface). Null when the user has no resume. */
export async function getPrimaryResumeId(userId: string, db = getDb()): Promise<string | null> {
  const rows = await buildRepos(db).resumes.findAllForOwner(userId);
  return selectPrimaryResume(rows as Array<{ id: string; isActive?: boolean; isMaster?: boolean }>)?.id ?? null;
}

/**
 * Read-through cached profile payload for the partner API. Cached until a write
 * (resume create / connection change) busts `partnerProfileCacheKey`, so
 * profile edits still surface promptly while repeated partner reads stay cheap.
 */
export async function getProfileForPartner(
  partnerId: string,
  userId: string,
  db = getDb(),
): Promise<PartnerProfilePayload | null> {
  return getOrSetCached({
    key: partnerProfileCacheKey(partnerId, userId),
    ttlSeconds: 300,
    loader: () => buildPartnerProfilePayload(userId, { includeEmail: true }, db),
  });
}
