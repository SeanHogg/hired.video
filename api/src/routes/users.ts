import { Hono } from "hono";
import { eq, or, and, lte, isNull, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { getDb, schema } from "../db/index.js";
import { bumpSearchVersion } from "../utils/search-cache.js";
import { buildRepos } from "../repositories/index.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { cdnUrl } from "../utils/cdn.js";
import { sendConnectionRequestEmail } from "../services/adapters/email.js";
import { USER_ROLES, NON_CANDIDATE_ROLES } from "../../../shared/user-roles.js";
import {
  resolveProfileSections,
  sanitizeProfileSectionsInput,
  type StoredProfileSections,
} from "../../../shared/profile-sections.js";
import { USER_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
import type { UserActorRow } from "../repositories/usersRepository.js";
import { splitName, toUserActor } from "../services/user/userActor.js";
import { resolveUserRef } from "../services/user/resolveUserRef.js";
import { emitNotification, resolveActor } from "../services/notifications/notificationService.js";
import { projectUserResumes } from "../handlers/resume-serializer.js";

const { users, userProfiles, userConnections, tasks, privacyPreferences, creatorProfiles } = schema;

// Explicit column list for userProfiles — avoids SELECT * and protects against
// schema columns that haven't been migrated to the DB yet.
const profileCols = {
  userId: userProfiles.userId, headline: userProfiles.headline, summary: userProfiles.summary,
  location: userProfiles.location, website: userProfiles.website, phone: userProfiles.phone,
  linkedIn: userProfiles.linkedIn, github: userProfiles.github, twitter: userProfiles.twitter,
  currentRole: userProfiles.currentRole, currentCompany: userProfiles.currentCompany,
  avatarUrl: userProfiles.avatarUrl, yearsOfExperience: userProfiles.yearsOfExperience,
  openToWork: userProfiles.openToWork, openToRemote: userProfiles.openToRemote,
  salaryCurrency: userProfiles.salaryCurrency, salaryExpectation: userProfiles.salaryExpectation,
  skills: userProfiles.skills, industries: userProfiles.industries, preferredRoles: userProfiles.preferredRoles,
  profileVisibility: userProfiles.profileVisibility, customUrlSlug: userProfiles.customUrlSlug,
  confidentialMode: userProfiles.confidentialMode,
  confidentialBlocklist: userProfiles.confidentialBlocklist,
  providesServices: userProfiles.providesServices,
  profileSections: userProfiles.profileSections,
  updatedAt: userProfiles.updatedAt,
} as const;

/** Map frontend PascalCase role to DB snake_case role */
function normalizeRole(role: string): string | null {
  const map: Record<string, string> = {
    jobseeker: "job_seeker",
    job_seeker: "job_seeker",
    recruiter: "recruiter",
    employer: "employer",
    // creator + affiliate are first-class roles (2026-06-13) — they map to
    // themselves so the /people role facet filters correctly and a role
    // change to creator/affiliate persists instead of silently coercing.
    creator: "creator",
    affiliate: "affiliate",
    admin: "admin",
  };
  return map[role.toLowerCase()] ?? null;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  linkedIn: z.string().optional(),
  gitHub: z.string().optional(),  // frontend sends camelCase gitHub
  github: z.string().optional(),
  twitter: z.string().optional(),
  currentRole: z.string().optional(),
  currentCompany: z.string().optional(),
  avatar: z.string().optional(),
  avatarUrl: z.string().optional(),
  openToWork: z.boolean().optional(),
  openToRemote: z.boolean().optional(),
  salaryCurrency: z.string().optional(),
  salaryExpectation: z.number().int().optional(),
  yearsOfExperience: z.number().int().optional(),
  skills: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  preferredRoles: z.array(z.string()).optional(),
  role: z.string().optional(),
  profileVisibility: z.enum(["public", "private", "connections"]).optional(),
  // Confidential search mode (#1627) — opt out of the public people
  // directory while staying able to apply.
  confidentialMode: z.boolean().optional(),
  // Confidential employer blocklist (#1679) — company names hidden from
  // in recruiter search.
  confidentialBlocklist: z.array(z.string().max(200)).max(50).optional(),
  // Partial of `ProfileSections` (shared/profile-sections.ts). Each key
  // is optional and merged over current storage via upsert. Unknown keys
  // are dropped by `sanitizeProfileSectionsInput` server-side.
  profileSections: z.record(z.string(), z.boolean()).optional(),
});

const SendConnectionRequestSchema = z.object({
  toUserId: z.string().min(1),
  message: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const userRoutes = new Hono<AppEnv>();

/**
 * Standard public card DTO for user listings.
 *
 * Every endpoint that returns user cards for the frontend should use this
 * so the shape is consistent and avatar URLs are resolved once.
 */
function toPublicUserCardDto(r: {
  id: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  headline?: string | null;
  summary?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  openToWork?: boolean | null;
  skills?: string[] | null;
  yearsOfExperience?: number | null;
  profileVisibility?: string | null;
  customUrlSlug?: string | null;
  externalPublicHandle?: string | null;
  isCreator?: boolean | null;
  creatorPrograms?: { video: boolean; voice: boolean; services: boolean; articles: boolean; courses: boolean; templates: boolean } | null;
}) {
  // Server-side guarantee: fullName is never empty. Fallback to the
  // public handle (creator brand) if set, else a generic "User <id4>"
  // so the frontend never has to do its own fallback chain (#1657 —
  // the duplicate-fallback anti-pattern that blanked names on the
  // People grid when consumers diverged on which fallback to use).
  const trimmedName = (r.name ?? "").trim();
  const fullName =
    trimmedName
    || (r.externalPublicHandle ?? "").trim()
    || `User ${r.id.slice(0, 4)}`;
  const { firstName, lastName } = splitName(fullName);
  return {
    id: r.id,
    type: "people" as const,
    firstName,
    lastName,
    fullName,
    role: r.role,
    headline: r.headline ?? r.currentRole ?? "",
    summary: r.summary ?? "",
    location: r.location ?? "",
    avatar: r.avatarUrl ? cdnUrl(r.avatarUrl) : null,
    currentRole: r.currentRole ?? "",
    currentCompany: r.currentCompany ?? "",
    openToWork: r.openToWork ?? false,
    skills: r.skills ?? [],
    yearsOfExperience: r.yearsOfExperience ?? null,
    emailConfirmed: r.emailVerified,
    slug: r.customUrlSlug ?? r.id,
    isCreator: r.isCreator === true,
    creatorPrograms: r.creatorPrograms ?? { video: false, voice: false, services: false, articles: false, courses: false, templates: false },
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

function makeConnectionDto(
  row: {
    id: string; fromUserId: string; toUserId: string; status: string;
    requestMessage: string | null; responseMessage: string | null;
    createdAt: Date | string; updatedAt: Date | string;
  },
  parties?: { fromUser?: UserActorRow | null; toUser?: UserActorRow | null },
) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status.toLowerCase(),
    // `message` is the canonical name on the frontend ConnectionSchema; keep
    // `requestMessage` for any older consumers still reading it directly.
    message: row.requestMessage ?? "",
    requestMessage: row.requestMessage ?? "",
    responseMessage: row.responseMessage ?? "",
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    fromUser: parties?.fromUser ? toUserActor(parties.fromUser) : undefined,
    toUser: parties?.toUser ? toUserActor(parties.toUser) : undefined,
  };
}

function toUserProfileDto(
  row: {
    id: string; email: string; name: string; role: string;
    emailVerified: boolean; createdAt: Date | string; updatedAt?: Date | string;
  },
  profile?: {
    headline?: string | null; summary?: string | null; location?: string | null;
    website?: string | null; phone?: string | null;
    customUrlSlug?: string | null;
    linkedIn?: string | null; github?: string | null; twitter?: string | null;
    currentRole?: string | null; currentCompany?: string | null;
    avatarUrl?: string | null; openToWork?: boolean | null; openToRemote?: boolean | null;
    salaryCurrency?: string | null; salaryExpectation?: number | null;
    yearsOfExperience?: number | null;
    skills?: string[] | null; industries?: string[] | null; preferredRoles?: string[] | null;
    providesServices?: boolean | null;
    profileVisibility?: string | null;
    confidentialMode?: boolean | null;
    confidentialBlocklist?: string[] | null;
    profileSections?: StoredProfileSections | Record<string, boolean> | null;
    updatedAt?: Date | string | null;
  } | null,
  privacyOptions?: {
    isOwner?: boolean;
    privacy?: {
      showEmail?: boolean;
      showPhone?: boolean;
      showLocation?: boolean;
      promoteWithoutAuth?: boolean;
    } | null;
  },
  creator?: {
    isActive: boolean | null;
    endedAt: Date | string | null;
    videoActive: boolean | null;
    voiceActive: boolean | null;
    servicesActive: boolean | null;
    articlesActive: boolean | null;
    coursesActive: boolean | null;
    templatesActive: boolean | null;
    displayName: string | null;
    tagline: string | null;
    bio: string | null;
    categories: string[] | null;
  } | null,
) {
  const { firstName, lastName } = splitName(row.name);
  const profileUpdatedAt = profile?.updatedAt ?? row.updatedAt ?? row.createdAt;

  // Privacy gating: redact contact fields for non-owners when toggled off.
  // Owners always see their own data. Defaults: email/phone/location hidden.
  const isOwner = privacyOptions?.isOwner ?? true;
  const showEmail = privacyOptions?.privacy?.showEmail ?? false;
  const showPhone = privacyOptions?.privacy?.showPhone ?? false;
  const showLocation = privacyOptions?.privacy?.showLocation ?? false;
  // Opt-in: when true, the frontend lets unauthenticated visitors view the
  // full /people/:slug page (no AuthOverlay sign-in mask) so creators /
  // service providers can share their profile as a promotion link.
  const promoteWithoutAuth = privacyOptions?.privacy?.promoteWithoutAuth ?? false;

  const visibleEmail = isOwner || showEmail ? row.email : null;
  const visiblePhone = isOwner || showPhone ? (profile?.phone ?? "") : null;
  const visibleLocation = isOwner || showLocation ? (profile?.location ?? "") : null;

  return {
    id: row.id,
    // #383 — return null (not "") when no custom slug is set so downstream
    // `?? id` fallbacks fire correctly. Frontend boundary coerces legacy
    // empty strings already; the proper-shape DTO removes the need.
    slug: profile?.customUrlSlug || null,
    email: visibleEmail,
    userName: row.email,
    showEmail,
    showPhone,
    showLocation,
    promoteWithoutAuth,
    data: {
      firstName,
      lastName,
      avatar: profile?.avatarUrl ?? "",
      headline: profile?.headline ?? "",
      summary: profile?.summary ?? "",
      location: visibleLocation,
      website: profile?.website ?? "",
      linkedIn: profile?.linkedIn ?? "",
      github: profile?.github ?? "",
      twitter: profile?.twitter ?? "",
      phone: visiblePhone,
      currentRole: profile?.currentRole ?? "",
      currentCompany: profile?.currentCompany ?? "",
      showEmail,
      showPhone,
      showLocation,
    },
    role: row.role,
    isPro: row.role === USER_ROLES.SUPER_ADMIN || row.role === USER_ROLES.ADMIN,
    isDemo: false,
    isVerified: row.emailVerified,
    profileVisibility: profile?.profileVisibility ?? "public",
    confidentialMode: profile?.confidentialMode ?? false,
    confidentialBlocklist: profile?.confidentialBlocklist ?? [],
    openToWork: profile?.openToWork ?? false,
    openToRemote: profile?.openToRemote ?? false,
    salaryCurrency: profile?.salaryCurrency ?? "USD",
    salaryExpectation: profile?.salaryExpectation ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    skills: profile?.skills ?? [],
    industries: profile?.industries ?? [],
    preferredRoles: profile?.preferredRoles ?? [],
    providesServices: profile?.providesServices ?? false,
    // Resolved client-friendly visibility map. The raw partial lives at
    // `profileSectionsRaw` (only set if the owner has stored overrides) so
    // the settings UI knows which keys were explicit vs. inherited from
    // `getDefaultProfileSections(role)`.
    profileSections: resolveProfileSections(
      (profile?.profileSections ?? null) as StoredProfileSections | null,
      row.role,
    ),
    profileSectionsRaw: (profile?.profileSections ?? null) as StoredProfileSections | null,
    isCreator: creator?.isActive === true && creator?.endedAt == null,
    creatorPrograms: {
      video: creator?.videoActive === true,
      voice: creator?.voiceActive === true,
      services: creator?.servicesActive === true,
      articles: creator?.articlesActive === true,
      courses: creator?.coursesActive === true,
      templates: creator?.templatesActive === true,
    },
    creatorProfile: creator
      ? {
          displayName: creator.displayName ?? null,
          tagline: creator.tagline ?? null,
          bio: creator.bio ?? null,
          categories: creator.categories ?? [],
        }
      : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(profileUpdatedAt).toISOString(),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function makeConnection(id: string, fromUserId: string, toUserId: string, status: "Pending" | "Accepted" | "Rejected") {
  const now = nowIso();
  return {
    id,
    fromUserId,
    toUserId,
    status,
    requestMessage: "",
    responseMessage: "",
    createdAt: now,
    updatedAt: now,
  };
}

const inMemoryConnections = new Map<string, ReturnType<typeof makeConnection>>();

/** GET /api/users/public — list public users (optional auth).
 *
 * Joins users + userProfiles so the response carries every field the
 * PeopleCard needs (headline, avatar, location, current role/company,
 * openToWork, slug). Only profiles with profileVisibility === "public"
 * (or NULL — the default public) are returned. */
userRoutes.get("/public", async (c) => {
  const db = getDb();
  const page = Number(c.req.query("page") ?? 1) || 1;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
  const offset = (page - 1) * limit;

  const baseConds = [
    eq(users.isActive, true),
    // Hide unverified accounts — keeps spam signups out of the public
    // directory until they prove ownership of the email address.
    eq(users.emailVerified, true),
    // Hide workforce members + platform staff from candidate discovery.
    // SSoT is shared/user-roles.ts NON_CANDIDATE_ROLES so other surfaces
    // (talent pools, pitch decks) read the same list (#1407, DRY rule).
    notInArray(users.role, NON_CANDIDATE_ROLES as unknown as string[]),
    or(
      eq(userProfiles.profileVisibility, "public"),
      // Users without a userProfiles row fall through the left join with
      // NULL — still include them since the default visibility is public.
      isNull(userProfiles.userId),
    )!,
    // Confidential search mode (#1627) — fail-closed exclusion. IS NOT
    // TRUE (not `= false`) so profile-less users (NULL via the left join)
    // stay included; only an explicit confidential_mode=true is hidden.
    sql`${userProfiles.confidentialMode} IS NOT TRUE`,
  ];

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      headline: userProfiles.headline,
      summary: userProfiles.summary,
      location: userProfiles.location,
      avatarUrl: userProfiles.avatarUrl,
      currentRole: userProfiles.currentRole,
      currentCompany: userProfiles.currentCompany,
      openToWork: userProfiles.openToWork,
      skills: userProfiles.skills,
      yearsOfExperience: userProfiles.yearsOfExperience,
      profileVisibility: userProfiles.profileVisibility,
      customUrlSlug: userProfiles.customUrlSlug,
      creatorIsActive: creatorProfiles.isActive,
      creatorEndedAt: creatorProfiles.endedAt,
      creatorVideoActive: creatorProfiles.videoActive,
      creatorVoiceActive: creatorProfiles.voiceActive,
      creatorServicesActive: creatorProfiles.servicesActive,
      creatorArticlesActive: creatorProfiles.articlesActive,
      creatorCoursesActive: creatorProfiles.coursesActive,
      creatorTemplatesActive: creatorProfiles.templatesActive,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(
      creatorProfiles,
      and(eq(creatorProfiles.userId, users.id), sql`${creatorProfiles.endedAt} IS NULL`),
    )
    .where(and(...baseConds))
    .limit(limit)
    .offset(offset);

  const items = rows.map((r) => toPublicUserCardDto({
    ...r,
    isCreator: r.creatorIsActive === true && r.creatorEndedAt === null,
    creatorPrograms: {
      video: r.creatorVideoActive === true,
      voice: r.creatorVoiceActive === true,
      services: r.creatorServicesActive === true,
      articles: r.creatorArticlesActive === true,
      courses: r.creatorCoursesActive === true,
      templates: r.creatorTemplatesActive === true,
    },
  }));

  // `?fields=id,fullName,avatar,headline,...` projection (gap #1370) — the
  // /people directory card view only needs a handful of fields; clipping the
  // payload here saves the skills JSON + creator-program flags on every
  // call. Field names are `toPublicUserCardDto` DTO keys (see USER_LIST_FIELDS
  // note). Detail endpoints still return the full row.
  const fields = parseFields(c.req.query("fields"), USER_LIST_FIELDS);
  const projected = projectRows(items as unknown as Array<Record<string, unknown>>, fields);
  return c.json(success({ items: projected, total: items.length, page, limit }));
});

/** GET /api/users/me — frontend compatibility endpoint */
userRoutes.get("/me", async (c) => {
  const user = c.var.user;
  const db = getDb();

  const [me] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,

    })
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  if (!me) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  const [profile] = await db
    .select(profileCols)
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.sub))
    .limit(1);

  const meDto = toUserProfileDto(me, profile ?? null);
  const meSub = await getSubscription(user.sub);
  meDto.isPro = meSub.isPro;
  return c.json(success(meDto), 200);
});

// ── Shared profile update logic (DRY) ─────────────────────────────────────────
type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** Build a partial profile updates object from only the fields that were provided */
function buildProfileUpdates(d: UpdateProfileInput): Record<string, unknown> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.headline !== undefined) updates.headline = d.headline;
  if (d.summary !== undefined) updates.summary = d.summary;
  if (d.location !== undefined) updates.location = d.location;
  if (d.website !== undefined) updates.website = d.website;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.linkedIn !== undefined) updates.linkedIn = d.linkedIn;
  if (d.github !== undefined || d.gitHub !== undefined) updates.github = d.github ?? d.gitHub;
  if (d.twitter !== undefined) updates.twitter = d.twitter;
  if (d.currentRole !== undefined) updates.currentRole = d.currentRole;
  if (d.currentCompany !== undefined) updates.currentCompany = d.currentCompany;
  if (d.avatar !== undefined || d.avatarUrl !== undefined) updates.avatarUrl = d.avatar ?? d.avatarUrl;
  if (d.openToWork !== undefined) updates.openToWork = d.openToWork;
  if (d.openToRemote !== undefined) updates.openToRemote = d.openToRemote;
  if (d.salaryCurrency !== undefined) updates.salaryCurrency = d.salaryCurrency;
  if (d.salaryExpectation !== undefined) updates.salaryExpectation = d.salaryExpectation;
  if (d.yearsOfExperience !== undefined) updates.yearsOfExperience = d.yearsOfExperience;
  if (d.skills !== undefined) updates.skills = d.skills;
  if (d.industries !== undefined) updates.industries = d.industries;
  if (d.preferredRoles !== undefined) updates.preferredRoles = d.preferredRoles;
  if (d.profileVisibility !== undefined) updates.profileVisibility = d.profileVisibility;
  if (d.confidentialMode !== undefined) updates.confidentialMode = d.confidentialMode;
  if (d.confidentialBlocklist !== undefined) updates.confidentialBlocklist = d.confidentialBlocklist;
  if (d.profileSections !== undefined) {
    updates.profileSections = sanitizeProfileSectionsInput(d.profileSections);
  }
  return updates;
}

const PROFILE_INSERT_DEFAULTS = {
  openToWork: false,
  openToRemote: false,
  skills: [] as string[],
  industries: [] as string[],
  preferredRoles: [] as string[],
};

async function upsertProfile(userId: string, profileUpdates: Record<string, unknown>) {
  const db = getDb();
  const [profile] = await db
    .insert(userProfiles)
    .values({ userId, ...PROFILE_INSERT_DEFAULTS, ...profileUpdates, createdAt: new Date() } as any)
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: profileUpdates as any,
    })
    .returning();
  // Name/headline/skills + profileVisibility all funnel through here and
  // feed the public `people` search bucket — invalidate the search index.
  bumpSearchVersion();
  return profile;
}

/** PUT /api/users/me (and /profile alias) — update authenticated user's profile */
const handleUpdateProfile = async (c: any) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const d = parsed.data;

  const firstName = d.firstName ?? "";
  const lastName = d.lastName ?? "";
  const fullName = d.name ?? (firstName || lastName ? `${firstName} ${lastName}`.trim() : undefined);

  const userUpdates: Partial<{ name: string; email: string; role: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (fullName) userUpdates.name = fullName;
  if (d.email) userUpdates.email = d.email;

  const newRole = d.role ? normalizeRole(d.role) : null;
  if (newRole) userUpdates.role = newRole;

  const [updated] = await db
    .update(users)
    .set(userUpdates as any)
    .where(eq(users.id, user.sub))
    .returning({
      id: users.id, email: users.email, name: users.name, role: users.role,
      emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt,
    });

  if (!updated) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  const profile = await upsertProfile(user.sub, buildProfileUpdates(d));

  // When the role changes, replace onboarding tasks for the new role (fire-and-forget)
  if (newRole) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const existingTasks = await db.select({ id: tasks.id, metadata: tasks.metadata }).from(tasks).where(and(eq(tasks.userId, user.sub), isNull(tasks.segmentId)));
          const onboardingIds = existingTasks
            .filter((t) => {
              const meta = (t.metadata ?? {}) as Record<string, unknown>;
              const tt = typeof meta.taskType === "number" ? meta.taskType : -1;
              return tt >= 10 && tt <= 19;
            })
            .map((t) => t.id);
          for (const id of onboardingIds) {
            await db.delete(tasks).where(eq(tasks.id, id));
          }
          await seedOnboardingTasks(user.sub, newRole);
        } catch (err) {
          console.error("[users/me] Failed to re-seed onboarding tasks:", err);
        }
      })(),
    );
  }

  return c.json(success(toUserProfileDto(updated, profile ?? null)), 200);
};
userRoutes.put("/me", handleUpdateProfile);

/** POST /api/users/connections — send connection request */
userRoutes.post("/connections", async (c) => {
  const from = c.var.user.sub;
  const body = await c.req.json().catch(() => null);
  const parsed = SendConnectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  if (from === parsed.data.toUserId) {
    return c.json(error("BAD_REQUEST", "Cannot send connection request to yourself"), 400);
  }

  const db = getDb();

  // Prevent duplicates: if a connection already exists in either direction, return it.
  const [existing] = await db
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, from), eq(userConnections.toUserId, parsed.data.toUserId)),
        and(eq(userConnections.fromUserId, parsed.data.toUserId), eq(userConnections.toUserId, from)),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json(success(makeConnectionDto(existing)), 200);
  }

  const [conn] = await db
    .insert(userConnections)
    .values({
      fromUserId: from,
      toUserId: parsed.data.toUserId,
      status: "Pending",
      requestMessage: parsed.data.message ?? null,
    } as any)
    .returning();

  // Fire-and-forget side effects: inbox notification + email. Don't block the response.
  (async () => {
    try {
      const repos = buildRepos(db);
      const { actor, actorName } = await resolveActor({ repos }, from);
      const [recipient] = await repos.users.findManyByIds([parsed.data.toUserId]);

      const message = parsed.data.message?.trim();
      await emitNotification(
        { repos },
        {
          recipientIds: [parsed.data.toUserId],
          type: "connection_request",
          actor,
          title: `${actorName} wants to connect`,
          message: message || `${actorName} sent you a connection request.`,
          target: { id: conn.id, type: "connection" },
        },
      ).catch((err) => console.error("[connections] notification insert failed:", err));

      if (recipient?.email) {
        await sendConnectionRequestEmail(
          recipient.email,
          recipient.name ?? "there",
          actorName,
          from,
          parsed.data.message ?? null,
        ).catch((err) => console.error("[connections] email send failed:", err));
      }
    } catch (err) {
      console.error("[connections] post-send side effects failed:", err);
    }
  })();

  return c.json(success(makeConnectionDto(conn)), 201);
});

/** GET /api/users/me/connections */
userRoutes.get("/me/connections", async (c) => {
  const me = c.var.user.sub;
  const db = getDb();
  const list = await db
    .select()
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, "Accepted"),
        or(eq(userConnections.fromUserId, me), eq(userConnections.toUserId, me)),
      ),
    );
  return c.json(success(list.map((row) => makeConnectionDto(row))), 200);
});

/** GET /api/users/me/connections/pending */
userRoutes.get("/me/connections/pending", async (c) => {
  const me = c.var.user.sub;
  const db = getDb();
  const repos = buildRepos(db);

  const rows = await db
    .select()
    .from(userConnections)
    .where(and(eq(userConnections.status, "Pending"), eq(userConnections.toUserId, me)));

  // One actor lookup for the whole batch — far cheaper than a join per row
  // and keeps the actor projection identical to every other notification
  // surface.
  const senderIds = [...new Set(rows.map((r) => r.fromUserId))];
  const actors = await repos.users.findActorsByIds(senderIds);
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const dtos = rows.map((row) =>
    makeConnectionDto(row, { fromUser: actorById.get(row.fromUserId) ?? null }),
  );
  return c.json(success(dtos), 200);
});

/** PUT /api/users/connections/:id/accept */
userRoutes.put("/connections/:id/accept", async (c) => {
  const id = c.req.param("id");
  const me = c.var.user.sub;
  const db = getDb();

  const [updated] = await db
    .update(userConnections)
    .set({ status: "Accepted", updatedAt: new Date() } as any)
    .where(and(eq(userConnections.id, id), eq(userConnections.toUserId, me)))
    .returning();

  if (!updated) {
    return c.json(error("NOT_FOUND", "Connection request not found"), 404);
  }

  // Notify the original sender that their request was accepted.
  (async () => {
    try {
      const repos = buildRepos(db);
      const { actor, actorName } = await resolveActor({ repos }, me);
      await emitNotification(
        { repos },
        {
          recipientIds: [updated.fromUserId],
          type: "connection_accepted",
          actor,
          title: `${actorName} accepted your connection request`,
          message: `You and ${actorName} are now connected on hired.video.`,
          target: { id: updated.id, type: "connection" },
        },
      ).catch((err) => console.error("[connections] accept notification failed:", err));
    } catch (err) {
      console.error("[connections] accept side effects failed:", err);
    }
  })();

  return c.json(success(makeConnectionDto(updated)), 200);
});

/** DELETE /api/users/connections/:id */
userRoutes.delete("/connections/:id", async (c) => {
  const id = c.req.param("id");
  const me = c.var.user.sub;
  const db = getDb();

  await db
    .delete(userConnections)
    .where(
      and(
        eq(userConnections.id, id),
        or(eq(userConnections.fromUserId, me), eq(userConnections.toUserId, me)),
      ),
    );
  return c.json(success(null), 200);
});

/** GET /api/users/connections/status */
userRoutes.get("/connections/status", async (c) => {
  const fromUserId = c.req.query("fromUserId") ?? "";
  const toUserId = c.req.query("toUserId") ?? "";
  const db = getDb();

  const [found] = await db
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, fromUserId), eq(userConnections.toUserId, toUserId)),
        and(eq(userConnections.fromUserId, toUserId), eq(userConnections.toUserId, fromUserId)),
      ),
    )
    .limit(1);

  if (!found) {
    return c.json(success({ connected: false, status: "none" }), 200);
  }
  return c.json(success({ connected: true, ...makeConnectionDto(found) }), 200);
});

/** POST /api/users/connections/statuses — batch lookup */
userRoutes.post("/connections/statuses", async (c) => {
  const body = await c.req.json<{ userIds: string[] }>();
  const me = c.var.user.sub;
  const userIds = (body.userIds ?? []).slice(0, 100); // cap at 100

  if (userIds.length === 0) {
    return c.json(success({}), 200);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(userConnections)
    .where(
      or(
        and(eq(userConnections.fromUserId, me), inArray(userConnections.toUserId, userIds)),
        and(eq(userConnections.toUserId, me), inArray(userConnections.fromUserId, userIds)),
      ),
    );

  const statuses: Record<string, { connected: boolean; status: string; id?: string; fromUserId?: string }> = {};
  for (const id of userIds) {
    statuses[id] = { connected: false, status: "none" };
  }
  for (const row of rows) {
    const otherId = row.fromUserId === me ? row.toUserId : row.fromUserId;
    const dto = makeConnectionDto(row);
    statuses[otherId] = { connected: true, ...dto };
  }

  return c.json(success(statuses), 200);
});

/** GET /api/users/me/recommendations */
userRoutes.get("/me/recommendations", async (c) => {
  return c.json(success([]), 200);
});

/** GET /api/users/:id/connections */
userRoutes.get("/:id/connections", async (c) => {
  const userId = c.req.param("id");
  const db = getDb();
  const list = await db
    .select()
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, "Accepted"),
        or(eq(userConnections.fromUserId, userId), eq(userConnections.toUserId, userId)),
      ),
    );
  return c.json(success(list.map((row) => makeConnectionDto(row))), 200);
});

/** GET /api/users/:id/can-message */
userRoutes.get("/:id/can-message", async (c) => {
  return c.json(success({ canMessage: true }), 200);
});

/** GET /api/users/:id/stats */
userRoutes.get("/:id/stats", async (c) => {
  return c.json(
    success({
      resumeCount: 0,
      connectionCount: 0,
      jobApplicationCount: 0,
    }),
    200,
  );
});

/** GET /api/users/:id/resumes — return public resumes for a user (privacyLevel=0) */
userRoutes.get("/:id/resumes", async (c) => {
  const id = c.req.param("id");
  const caller = c.var.user;
  const db = getDb();

  const targetUserId = await resolveUserRef(db, id);
  if (!targetUserId) return c.json(success([]), 200);

  const isOwner = caller?.sub === targetUserId;
  // Filter + project via the shared serializer — keeps the wire shape
  // documented + tested in one place. The projection MUST include
  // `isMaster`, `slug`, etc. so the profile page can find the master
  // resume; see resume-serializer.test.ts (`projectUserResumes`).
  const all = await buildRepos(db).resumes.findAllForOwner(targetUserId);
  const rows = projectUserResumes(all as any, { isOwner });

  return c.json(success(rows), 200);
});

/** PATCH /api/users/slug — update the authenticated user's custom URL slug */
userRoutes.patch("/slug", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens"),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid slug", { issues: parsed.error.flatten() }), 400);
  }
  const db = getDb();
  // Check uniqueness across userProfiles
  const [existing] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, parsed.data.slug))
    .limit(1);
  if (existing && existing.userId !== user.sub) {
    return c.json(error("CONFLICT", "This slug is already taken"), 409);
  }
  // Upsert profile row with new slug
  await db
    .insert(userProfiles)
    .values({ userId: user.sub, customUrlSlug: parsed.data.slug, createdAt: new Date(), updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: userProfiles.userId, set: { customUrlSlug: parsed.data.slug, updatedAt: new Date() } as any });
  return c.json(success({ slug: parsed.data.slug }), 200);
});

/** GET /api/users/check-slug/:slug — check if a slug is available (no auth required) */
userRoutes.get("/check-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const meId = (c.var as any).user?.sub as string | undefined;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    return c.json(success({ available: false, reason: "Invalid format" }), 200);
  }
  const db = getDb();
  const [existing] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, slug))
    .limit(1);
  const available = !existing || existing.userId === meId;
  return c.json(success({ available }), 200);
});

/** GET /api/users/:id — profile by id or custom slug; visibility-conditional */
userRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const caller = c.var.user; // set by optionalAuthMiddleware — may be undefined
  const db = getDb();

  let me: { id: string; email: string; name: string; role: string; emailVerified: boolean; createdAt: Date | string; updatedAt?: Date | string } | undefined;
  let profile: typeof userProfiles.$inferSelect | undefined;

  // `:id` is the public user ref — a UUID or a customUrlSlug. Resolve once
  // via the shared seam, then fetch identity + profile uniformly by userId.
  const targetUserId = await resolveUserRef(db, id);
  if (targetUserId) {
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    me = row;
    if (me) {
      const [p] = await db.select(profileCols).from(userProfiles).where(eq(userProfiles.userId, me.id)).limit(1);
      profile = p as any;
    }
  }

  if (!me) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  const visibility = profile?.profileVisibility ?? "public";
  const isOwner = caller?.sub === me.id;
  const isSuperAdmin =
    caller?.isSuperAdmin === true ||
    caller?.roles?.includes(USER_ROLES.SUPER_ADMIN);

  // Fetched up-front (not in the enrich Promise.all below) because two of
  // these flags participate in the visibility gates that follow:
  //   • profileVisibleToPublic — Settings → Privacy → "Public Profile"
  //     toggle. When false, other authenticated users can't see the
  //     profile (only owner / SuperAdmin / connections fall through).
  //   • promoteWithoutAuth — Settings → Privacy → "Promote Services &
  //     Content Without Authentication". When true, anonymous viewers can
  //     also reach the page even if profileVisibleToPublic is true (the
  //     anonymous gate is the page-level AuthOverlay, not the API).
  const [privacyRow] = await db
    .select({
      showEmail: privacyPreferences.showEmail,
      showPhone: privacyPreferences.showPhone,
      showLocation: privacyPreferences.showLocation,
      promoteWithoutAuth: privacyPreferences.promoteWithoutAuth,
      profileVisibleToPublic: privacyPreferences.profileVisibleToPublic,
    })
    .from(privacyPreferences)
    .where(eq(privacyPreferences.userId, me.id))
    .limit(1);
  const profileVisibleToPublic = privacyRow?.profileVisibleToPublic ?? true;

  // Private profiles are only visible to the owner (SuperAdmins bypass)
  if (visibility === "private" && !isOwner && !isSuperAdmin) {
    return c.json(error("FORBIDDEN", "This profile is private"), 403);
  }

  // Unverified accounts are hidden from everyone except the owner and
  // SuperAdmins. Returning 404 (rather than a verification-specific error)
  // avoids leaking the existence of half-created accounts to anonymous
  // callers — same shape as if the user simply didn't exist.
  if (!me.emailVerified && !isOwner && !isSuperAdmin) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  // Connections-only profiles require authentication at minimum
  if (visibility === "connections" && !caller) {
    return c.json(error("UNAUTHORIZED", "Authentication required to view this profile"), 401);
  }

  // "Public Profile" toggle off → hide from other authenticated users.
  // Anonymous callers are governed by promoteWithoutAuth (the page-level
  // AuthOverlay) and are not blocked here so a creator can keep their
  // profile open to anonymous promotion traffic while keeping it hidden
  // from random signed-in users — the two axes are independent.
  if (!profileVisibleToPublic && caller && !isOwner && !isSuperAdmin) {
    return c.json(error("FORBIDDEN", "This profile is private"), 403);
  }

  // Enrich with public resume and video counts for "Hire Me" profile page.
  // The resume list goes through ResumeRepository; we filter to public
  // rows + project to ids in memory rather than widen the repo for this
  // one caller's shape.
  const resumeRepo = buildRepos(db).resumes;
  const [publicResumes, publicVideos, creatorRow] = await Promise.all([
    resumeRepo.findAllForOwner(me.id).then((rows) =>
      rows.filter((r) => r.privacyLevel <= 0).map((r) => ({ id: r.id })),
    ),
    db.select({ id: schema.videos.id, title: schema.videos.title, thumbnailUrl: schema.videos.thumbnailUrl, youtubeUrl: schema.videos.youtubeUrl, createdAt: schema.videos.createdAt })
      .from(schema.videos)
      .where(and(eq(schema.videos.userId, me.id), eq(schema.videos.privacyStatus, "public"))),
    db.select({
      isActive: creatorProfiles.isActive,
      endedAt: creatorProfiles.endedAt,
      videoActive: creatorProfiles.videoActive,
      voiceActive: creatorProfiles.voiceActive,
      servicesActive: creatorProfiles.servicesActive,
      articlesActive: creatorProfiles.articlesActive,
      coursesActive: creatorProfiles.coursesActive,
      templatesActive: creatorProfiles.templatesActive,
      displayName: creatorProfiles.displayName,
      tagline: creatorProfiles.tagline,
      bio: creatorProfiles.bio,
      categories: creatorProfiles.categories,
    })
      .from(creatorProfiles)
      .where(and(eq(creatorProfiles.userId, me.id), sql`${creatorProfiles.endedAt} IS NULL`))
      .limit(1),
  ]);

  return c.json(success({
    ...toUserProfileDto(me, profile ?? null, { isOwner, privacy: privacyRow ?? null }, creatorRow[0] ?? null),
    publicResumeCount: publicResumes.length,
    publicVideos,
  }), 200);
});

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** POST /api/users/me/avatar — upload a new avatar (5MB, jpg/png/gif/webp only) */
userRoutes.post("/me/avatar", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const part = (form?.get("avatar") ?? form?.get("file")) as File | null;

  if (!part || typeof part.arrayBuffer !== "function") {
    return c.json(error("VALIDATION_ERROR", "Missing avatar file in form field 'avatar'"), 400);
  }

  const contentType = part.type || "application/octet-stream";
  if (!AVATAR_ALLOWED_TYPES.has(contentType)) {
    return c.json(error("VALIDATION_ERROR", `Only jpg, png, gif, and webp images are allowed. Got: ${contentType}`), 415);
  }

  const bytes = await part.arrayBuffer();
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    return c.json(error("PAYLOAD_TOO_LARGE", `Avatar must be under 5 MB. File is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`), 413);
  }

  const ext = part.name?.split(".").pop()?.toLowerCase() ?? "jpg";
  const key = `uploads/${user.sub}/avatars/${crypto.randomUUID()}.${ext}`;

  const bucket: any = (globalThis as any).__ENV?.VIDEO_BUCKET;
  if (!bucket) {
    // No bucket configured (local dev) — return a data URL stub
    const db = getDb();
    const stubUrl = cdnUrl(key);
    await db.insert(userProfiles)
      .values({ userId: user.sub, avatarUrl: stubUrl, createdAt: new Date(), updatedAt: new Date() } as any)
      .onConflictDoUpdate({ target: userProfiles.userId, set: { avatarUrl: stubUrl, updatedAt: new Date() } as any });
    return c.json(success({ avatarUrl: stubUrl }), 200);
  }

  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  const avatarUrl = cdnUrl(key);

  const db = getDb();
  await db.insert(userProfiles)
    .values({ userId: user.sub, avatarUrl, createdAt: new Date(), updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: userProfiles.userId, set: { avatarUrl, updatedAt: new Date() } as any });

  return c.json(success({ avatarUrl }), 200);
});

/** DELETE /api/users/account — permanently delete the authenticated user's account */
userRoutes.delete("/account", async (c) => {
  const user = c.var.user;
  const db = getDb();

  await db.delete(users).where(eq(users.id, user.sub));

  return c.json(success(null));
});
