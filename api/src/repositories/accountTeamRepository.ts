/**
 * Reads behind the Team Members panel (`GET /api/account/users`,
 * services/user/account.ts `listAccountUsers`).
 *
 * The account model is single-tenant: a platform admin's "team" is every
 * user plus every open invitation, so the scope is the platform — but the
 * read is PAGED (it used to load every users row, secrets included) and
 * projects only the columns the AccountUser DTO is built from. Invitation
 * rows never ship their accept `token`.
 */
import { desc, eq, or } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { users, accountInvitations } = schema;

/** Default + hard cap for one Team Members page. */
export const ACCOUNT_TEAM_PAGE_DEFAULT = 100;
export const ACCOUNT_TEAM_PAGE_MAX = 200;

export const accountTeamUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  isSuperAdmin: users.isSuperAdmin,
  createdAt: users.createdAt,
};

export const accountTeamInvitationColumns = {
  id: accountInvitations.id,
  email: accountInvitations.email,
  role: accountInvitations.role,
  status: accountInvitations.status,
  createdAt: accountInvitations.createdAt,
};

export type AccountTeamUserRow = Pick<typeof users.$inferSelect, keyof typeof accountTeamUserColumns>;
export type AccountTeamInvitationRow = Pick<
  typeof accountInvitations.$inferSelect,
  keyof typeof accountTeamInvitationColumns
>;

export interface AccountTeamPage {
  limit: number;
  offset: number;
}

/** Clamp caller-supplied paging to sane bounds. */
export function clampAccountTeamPage(raw: { limit?: number; offset?: number } = {}): AccountTeamPage {
  const { limit: l, offset: o } = raw;
  const limit = l !== undefined && Number.isFinite(l) && l > 0
    ? Math.min(ACCOUNT_TEAM_PAGE_MAX, Math.floor(l))
    : ACCOUNT_TEAM_PAGE_DEFAULT;
  const offset = o !== undefined && Number.isFinite(o) && o > 0 ? Math.floor(o) : 0;
  return { limit, offset };
}

/** One page of users (newest first) + one page of open invitations. */
export async function listAccountTeamPage(
  db: Db,
  page: AccountTeamPage,
): Promise<{ users: AccountTeamUserRow[]; invitations: AccountTeamInvitationRow[] }> {
  const [userRows, invitationRows] = await Promise.all([
    db
      .select(accountTeamUserColumns)
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select(accountTeamInvitationColumns)
      .from(accountInvitations)
      .where(or(eq(accountInvitations.status, "pending"), eq(accountInvitations.status, "cancelled")))
      .orderBy(desc(accountInvitations.createdAt))
      .limit(page.limit)
      .offset(page.offset),
  ]);
  return { users: userRows, invitations: invitationRows };
}

/** The viewer's own Team Members row. */
export async function findAccountTeamUser(db: Db, userId: string): Promise<AccountTeamUserRow | null> {
  const [row] = await db.select(accountTeamUserColumns).from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}
