/**
 * UsersProfileRepository — the reads/writes behind `/api/users` self-service
 * and public-profile endpoints: identity rows, the explicit `userProfiles`
 * column projection, slug/avatar upserts, privacy flags, public videos and
 * the active creator row. Typed Drizzle wrappers only; rules live in
 * services/user/{myProfile,publicProfile,slugAndAvatar}.ts.
 */
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { isNotRenderVariant } from "./renderVariantRepository.js";
import { savedSettingsOf } from "./preferencesRepository.js";

const { users, userProfiles, userSettings, creatorProfiles, videos } = schema;

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

const identityCols = {
  id: users.id, email: users.email, name: users.name, role: users.role,
  emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt,
} as const;

export type ProfileColsRow = Awaited<ReturnType<typeof selectProfile>>[number];

export interface UserIdentityRow {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  externalPublicHandle?: string | null;
}

function selectProfile(userId: string) {
  return getDb().select(profileCols).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
}

/** The explicit-column profile row, or null when the user has none. */
export async function findProfileCols(userId: string): Promise<ProfileColsRow | null> {
  const [row] = await selectProfile(userId);
  return row ?? null;
}

/** Identity row for the signed-in user (`GET /me`). */
export async function findIdentity(userId: string): Promise<UserIdentityRow | null> {
  const [row] = await getDb().select(identityCols).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

/** Identity row + booking host handle for the public profile. */
export async function findPublicIdentity(userId: string): Promise<UserIdentityRow | null> {
  const [row] = await getDb()
    .select({ ...identityCols, externalPublicHandle: users.externalPublicHandle })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Patch the identity row; returns the updated identity or null when missing. */
export async function updateIdentity(
  userId: string,
  patch: Partial<{ name: string; role: string; updatedAt: Date }>,
): Promise<UserIdentityRow | null> {
  const [row] = await getDb()
    .update(users)
    .set(patch as Partial<typeof users.$inferInsert>)
    .where(eq(users.id, userId))
    .returning(identityCols);
  return row ?? null;
}

const PROFILE_INSERT_DEFAULTS = {
  openToWork: false,
  openToRemote: false,
  skills: [] as string[],
  industries: [] as string[],
  preferredRoles: [] as string[],
};

/** Insert-or-merge the given profile fields (insert path gets the defaults). */
export async function upsertProfileFields(
  userId: string,
  updates: Record<string, unknown>,
): Promise<typeof userProfiles.$inferSelect | undefined> {
  const [profile] = await getDb()
    .insert(userProfiles)
    .values({ userId, ...PROFILE_INSERT_DEFAULTS, ...updates, createdAt: new Date() } as unknown as typeof userProfiles.$inferInsert)
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: updates as Partial<typeof userProfiles.$inferInsert>,
    })
    .returning();
  return profile;
}

/** Owner of a custom URL slug, or null when unclaimed. */
export async function findSlugOwnerId(slug: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, slug))
    .limit(1);
  return row?.userId ?? null;
}

/** Upsert a single profile column (slug / avatar) with fresh timestamps. */
async function upsertProfileColumn(
  userId: string,
  set: { customUrlSlug: string } | { avatarUrl: string },
): Promise<void> {
  await getDb()
    .insert(userProfiles)
    .values({ userId, ...set, createdAt: new Date(), updatedAt: new Date() } as typeof userProfiles.$inferInsert)
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...set, updatedAt: new Date() } });
}

export function upsertSlug(userId: string, slug: string): Promise<void> {
  return upsertProfileColumn(userId, { customUrlSlug: slug });
}

export function upsertAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
  return upsertProfileColumn(userId, { avatarUrl });
}

export async function findAvatarUrl(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ avatarUrl: userProfiles.avatarUrl })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row?.avatarUrl ?? null;
}

export interface ProfilePrivacyRow {
  showEmail: boolean | null;
  showPhone: boolean | null;
  showLocation: boolean | null;
  promoteWithoutAuth: boolean | null;
  profileVisibleToPublic: boolean | null;
}

export async function findPrivacyFlags(userId: string): Promise<ProfilePrivacyRow | null> {
  const [row] = await getDb()
    .select({
      showEmail: userSettings.showEmail,
      showPhone: userSettings.showPhone,
      showLocation: userSettings.showLocation,
      promoteWithoutAuth: userSettings.promoteWithoutAuth,
      profileVisibleToPublic: userSettings.profileVisibleToPublic,
    })
    .from(userSettings)
    .where(savedSettingsOf(userId, "privacy"))
    .limit(1);
  return row ?? null;
}

/** The user's public, non-render-variant videos for the profile page. */
export function findPublicVideos(userId: string) {
  return getDb()
    .select({ id: videos.id, title: videos.title, thumbnailUrl: videos.thumbnailUrl, youtubeUrl: videos.youtubeUrl, createdAt: videos.createdAt })
    .from(videos)
    .where(and(eq(videos.userId, userId), eq(videos.privacyStatus, "public"), isNotRenderVariant(videos.id)));
}

export interface ActiveCreatorRow {
  isActive: boolean | null;
  endedAt: Date | string | null;
  bookingsActive: boolean | null;
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
}

/** The user's live (not ended) creator row, or null. */
export async function findActiveCreator(userId: string): Promise<ActiveCreatorRow | null> {
  const [row] = await getDb()
    .select({
      isActive: creatorProfiles.isActive,
      endedAt: creatorProfiles.endedAt,
      bookingsActive: creatorProfiles.bookingsActive,
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
    .where(and(eq(creatorProfiles.userId, userId), sql`${creatorProfiles.endedAt} IS NULL`))
    .limit(1);
  return (row as ActiveCreatorRow) ?? null;
}

// ── Services provider flag ──────────────────────────────────────────────────

export async function findProvidesServices(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ providesServices: userProfiles.providesServices })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row?.providesServices === true;
}

export async function setProvidesServices(userId: string, providesServices: boolean): Promise<void> {
  await getDb()
    .update(userProfiles)
    .set({ providesServices, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId));
}

/** Flip providesServices on; a no-op UPDATE when it is already on. */
export async function enableProvidesServicesIfOff(userId: string): Promise<void> {
  await getDb()
    .update(userProfiles)
    .set({ providesServices: true, updatedAt: new Date() })
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.providesServices, false)));
}

// ── Talent discovery feed ───────────────────────────────────────────────────

/** Public-visibility profiles of verified users, most recently updated first. */
export function listPublicTalentProfiles(limit: number, offset: number) {
  return getDb()
    .select({
      userId: userProfiles.userId,
      headline: userProfiles.headline,
      location: userProfiles.location,
      avatarUrl: userProfiles.avatarUrl,
      skills: userProfiles.skills,
      // No video-resume column since migration 0062 (legacy table dropped).
      videoResumeUrl: sql<string | null>`null`,
      updatedAt: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(and(eq(userProfiles.profileVisibility, "public"), eq(users.emailVerified, true)))
    .orderBy(desc(userProfiles.updatedAt))
    .limit(limit)
    .offset(offset);
}

/** The full profile row plus the owner's verification flag, or null. */
export async function findProfileWithVerification(userId: string) {
  const [row] = await getDb()
    .select({ profile: userProfiles, emailVerified: users.emailVerified })
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/** The user's role + stored profile-section overrides (null when the user has
 *  no profile row), or null when the user doesn't exist. Feeds the per-section
 *  visibility gate (shared/profile-sections.ts). */
export async function findRoleAndProfileSections(
  userId: string,
): Promise<{ role: string; sections: unknown } | null> {
  const [row] = await getDb()
    .select({ role: users.role, sections: userProfiles.profileSections })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Hard-delete the user row (FK cascades own the rest). */
export async function deleteUserRow(userId: string): Promise<void> {
  await getDb().delete(users).where(eq(users.id, userId));
}

export interface CompanyPersonRow {
  userId: string;
  name: string;
  title: string | null;
  company: string | null;
}

/** Of `userIds`, the people whose current company matches `company`
 *  (case-insensitive substring), capped at `limit` — /api/network/warm-intros. */
export async function findAtCompanyAmong(userIds: string[], company: string, limit: number): Promise<CompanyPersonRow[]> {
  return getDb()
    .select({
      userId: users.id,
      name: users.name,
      title: userProfiles.currentRole,
      company: userProfiles.currentCompany,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(inArray(users.id, userIds), ilike(userProfiles.currentCompany, `%${company}%`)))
    .limit(limit);
}

/** id → display name for each existing user in `userIds`. */
export async function findNamesByIds(userIds: string[]): Promise<Map<string, string>> {
  const rows = await getDb().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}
