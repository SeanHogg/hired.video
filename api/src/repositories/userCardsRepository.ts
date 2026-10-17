/**
 * UserCardsRepository — the People-card read model (users ⟕ userProfiles ⟕
 * active creatorProfiles). ONE select feeds every card surface: the public
 * directory (`GET /api/users/public`) and the viewer's connections
 * (`/me/connections/cards`, `/me/connections/search`), so the row shape
 * can't drift (DRY). Rows are raw; `services/user/userDtos.ts`
 * `toPublicUserCardDto` maps them to the wire card.
 */
import { and, count, eq, ilike, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { NON_CANDIDATE_ROLES } from "../../../shared/user-roles.js";

const { users, userProfiles, creatorProfiles } = schema;

export interface UserCardRow {
  id: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  headline: string | null;
  summary: string | null;
  location: string | null;
  avatarUrl: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  openToWork: boolean | null;
  skills: string[] | null;
  yearsOfExperience: number | null;
  profileVisibility: string | null;
  customUrlSlug: string | null;
  creatorIsActive: boolean | null;
  creatorEndedAt: Date | string | null;
  creatorVideoActive: boolean | null;
  creatorVoiceActive: boolean | null;
  creatorServicesActive: boolean | null;
  creatorArticlesActive: boolean | null;
  creatorCoursesActive: boolean | null;
  creatorTemplatesActive: boolean | null;
}

async function selectCardRows(
  conds: SQL[],
  opts: { limit?: number; offset?: number; orderByName?: boolean } = {},
): Promise<UserCardRow[]> {
  let q = getDb()
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
    .where(and(...conds))
    .$dynamic();
  if (opts.orderByName) q = q.orderBy(users.name);
  if (opts.limit != null) q = q.limit(opts.limit);
  if (opts.offset != null) q = q.offset(opts.offset);
  return (await q) as UserCardRow[];
}

/** WHERE for the public People directory. References only userProfiles (the
 *  lone join the count query also carries). */
function publicDirectoryConds(): SQL[] {
  return [
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
}

/** One page of the public People directory. */
export function findPublicDirectoryCardRows(limit: number, offset: number): Promise<UserCardRow[]> {
  return selectCardRows(publicDirectoryConds(), { limit, offset });
}

/** Global count of the public People directory (same WHERE as the page). */
export async function countPublicDirectory(): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(...publicDirectoryConds()));
  return Number(row?.value ?? 0);
}

/** Active users among `ids` as card rows. Your own connections are visible
 *  regardless of public-directory visibility; only the account must still be
 *  active. `q` filters name/headline (ILIKE) for the typeahead. */
export function findActiveCardRowsByIds(
  ids: string[],
  opts: { q?: string; limit?: number; orderByName?: boolean } = {},
): Promise<UserCardRow[]> {
  const conds: SQL[] = [eq(users.isActive, true), inArray(users.id, ids)];
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(users.name, like), ilike(userProfiles.headline, like))!);
  }
  return selectCardRows(conds, { limit: opts.limit, orderByName: opts.orderByName });
}
