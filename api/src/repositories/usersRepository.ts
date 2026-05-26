/**
 * UsersRepository — the user identity aggregate:
 *   • users            — core identity (email, name, role, status)
 *   • userProfiles     — public-facing profile (headline, summary, avatar, skills)
 *   • userConnections  — graph of connections between users
 *
 * These three are one aggregate root: a user IS their identity + their
 * public face + their social graph. Auth-flow sidecars (password reset
 * tokens, 2FA codes, refresh tokens, passkeys, modules, permission
 * overrides, audit log) live in AuthRepository — that's access control,
 * not identity.
 *
 * Layering rule: Routes → Services → Repository. Services call these
 * methods; this file has zero business logic, zero validation — it is a
 * typed Drizzle wrapper and nothing more.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

const { users, userProfiles, userConnections, accountPreferences } = schema;

export type DbLike = any;

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type UserProfileInsert = typeof userProfiles.$inferInsert;
export type UserConnectionRow = typeof userConnections.$inferSelect;
export type UserConnectionInsert = typeof userConnections.$inferInsert;

/** Narrow projection for "who is this user" surfaces — see
 *  `services/user/userActor.ts` for the DTO shape services build from
 *  this. Defined at the repo layer so the join lives behind the repo
 *  boundary. */
export interface UserActorRow {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  customUrlSlug: string | null;
}

export interface UserSearchFilters {
  search?: string;
  role?: string;
  status?: "active" | "suspended";
}

export interface UserSearchResult {
  rows: UserRow[];
  total: number;
}

/** A column subset services may patch. `id`, `passwordHash`, `email` are
 *  written via dedicated methods (setPassword / updateEmail) so audit
 *  trails stay honest. */
export interface UserPatch {
  name?: string;
  role?: string;
  isActive?: boolean;
  isSuspended?: boolean;
  isBanned?: boolean;
  isSuperAdmin?: boolean;
  mfaEnabled?: boolean;
  emailVerified?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: Date;
  updatedAt?: Date;
}

export interface IUsersRepository {
  // ── core identity ─────────────────────────────────────────────────────
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  findManyByIds(ids: string[]): Promise<UserRow[]>;
  listAll(): Promise<UserRow[]>;
  countAll(): Promise<number>;
  countActive(): Promise<number>;
  countCreatedSince(since: Date): Promise<number>;
  countByRole(): Promise<Array<{ role: string; n: number }>>;
  search(filters: UserSearchFilters, page?: number, limit?: number): Promise<UserSearchResult>;
  insertOne(input: UserInsert): Promise<UserRow>;
  updateById(id: string, patch: UserPatch): Promise<UserRow | null>;
  /** Apply the same patch to many users in a single SQL UPDATE. Used by
   *  bulk admin actions to stay under the Cloudflare Workers subrequest
   *  limit — N updateById calls would each be a subrequest, which a 50+
   *  user ban exceeds. Returns the count of rows affected. */
  updateManyByIds(ids: string[], patch: UserPatch): Promise<number>;
  setPasswordHash(id: string, passwordHash: string): Promise<void>;
  setEmail(id: string, email: string, verified: boolean): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  markLogin(id: string): Promise<void>;
  /** IANA timezone for a user, read from `account_preferences.timezone`.
   *  Returns null when the user has no preferences row yet (signup before
   *  the preferences seed lands). Source of truth, not `users.*` — the
   *  `users` table does NOT carry a timezone column. */
  findTimezone(userId: string): Promise<string | null>;
  // ── profile ───────────────────────────────────────────────────────────
  findProfileByUserId(userId: string): Promise<UserProfileRow | null>;
  findProfilesByUserIds(userIds: string[]): Promise<UserProfileRow[]>;
  findProfileBySlug(slug: string): Promise<UserProfileRow | null>;
  upsertProfile(input: UserProfileInsert): Promise<UserProfileRow>;
  /** Minimal "who is this user" projection for actor surfaces
   *  (notifications, mentions, comments, connection requests). One join
   *  for the whole batch — call this once with every actor id you need
   *  in a single feature, not once per id. */
  findActorsByIds(ids: string[]): Promise<UserActorRow[]>;
  /** Active super-admin user ids. Used by services that need to fan a
   *  notification or inbox message out to every moderator (e.g. content
   *  abuse reports per #641). Returns ids only — callers that need
   *  display names should pair this with `findActorsByIds`. */
  findSuperAdminIds(): Promise<string[]>;
  // ── connections (social graph) ────────────────────────────────────────
  findConnection(a: string, b: string): Promise<UserConnectionRow | null>;
  findConnectionsForUser(userId: string): Promise<UserConnectionRow[]>;
  insertConnection(input: UserConnectionInsert): Promise<UserConnectionRow>;
  updateConnectionStatus(id: string, status: string, responseMessage?: string): Promise<void>;
}

export class UsersRepository implements IUsersRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return (row as UserRow) ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return (row as UserRow) ?? null;
  }

  async findManyByIds(ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return (await this.db.select().from(users).where(inArray(users.id, ids))) as UserRow[];
  }

  async findTimezone(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ tz: accountPreferences.timezone })
      .from(accountPreferences)
      .where(eq(accountPreferences.userId, userId))
      .limit(1);
    return (row?.tz as string | null | undefined) ?? null;
  }

  async findSuperAdminIds(): Promise<string[]> {
    const rows = (await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isSuperAdmin, true), eq(users.isActive, true)))) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  async listAll(): Promise<UserRow[]> {
    return (await this.db.select().from(users).orderBy(desc(users.createdAt))) as UserRow[];
  }

  async countAll(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(users);
    return Number(row?.n ?? 0);
  }

  async countActive(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(users).where(eq(users.isActive, true));
    return Number(row?.n ?? 0);
  }

  async countCreatedSince(since: Date): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(users).where(gte(users.createdAt, since));
    return Number(row?.n ?? 0);
  }

  /** Grouped count by role — drives the admin-dashboard pie chart. */
  async countByRole(): Promise<Array<{ role: string; n: number }>> {
    const rows = await this.db.select({ role: users.role, n: count() }).from(users).groupBy(users.role);
    return (rows as Array<{ role: string; n: number }>).map((r) => ({ role: r.role, n: Number(r.n) }));
  }

  async search(filters: UserSearchFilters, page = 1, limit = 50): Promise<UserSearchResult> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * safeLimit;

    const conds: SQL[] = [];
    if (filters.search) {
      conds.push(
        or(
          ilike(users.email, `%${filters.search}%`),
          ilike(users.name, `%${filters.search}%`),
        )!,
      );
    }
    if (filters.role) conds.push(eq(users.role, filters.role));
    if (filters.status === "active") conds.push(eq(users.isActive, true));
    if (filters.status === "suspended") conds.push(eq(users.isSuspended, true));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(safeLimit)
        .offset(offset),
      this.db.select({ total: count() }).from(users).where(where),
    ]);
    return { rows: rows as UserRow[], total: Number(total) };
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  async insertOne(input: UserInsert): Promise<UserRow> {
    const [created] = await this.db.insert(users).values(input as any).returning();
    return created as UserRow;
  }

  async updateById(id: string, patch: UserPatch): Promise<UserRow | null> {
    const [updated] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(users.id, id))
      .returning();
    return (updated as UserRow) ?? null;
  }

  async updateManyByIds(ids: string[], patch: UserPatch): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.db
      .update(users)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(inArray(users.id, ids))
      .returning({ id: users.id });
    return Array.isArray(result) ? result.length : 0;
  }

  /** Rotates a user's password hash. Separate from `updateById` so audit
   *  logs can pick this call out specifically — it's security-sensitive. */
  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: this.now() } as any)
      .where(eq(users.id, id));
  }

  /** Email + verification toggle atomically — prevents "email changed but
   *  still verified" states. Tests assert the verified flag moves with
   *  the email. */
  async setEmail(id: string, email: string, verified: boolean): Promise<void> {
    await this.db
      .update(users)
      .set({ email, emailVerified: verified, updatedAt: this.now() } as any)
      .where(eq(users.id, id));
  }

  async deleteById(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    await this.db.delete(users).where(eq(users.id, id));
    return true;
  }

  /** Touch `lastLoginAt` without bumping `updatedAt`. `updatedAt` is a
   *  mutation-timestamp; a login isn't a mutation to the user's data. */
  async markLogin(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: this.now() } as any)
      .where(eq(users.id, id));
  }

  // ── profile (public-facing) ───────────────────────────────────────────────

  async findProfileByUserId(userId: string): Promise<UserProfileRow | null> {
    const [row] = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return (row as UserProfileRow) ?? null;
  }

  async findProfilesByUserIds(userIds: string[]): Promise<UserProfileRow[]> {
    if (userIds.length === 0) return [];
    return (await this.db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds))) as UserProfileRow[];
  }

  async findProfileBySlug(slug: string): Promise<UserProfileRow | null> {
    const [row] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.customUrlSlug, slug))
      .limit(1);
    return (row as UserProfileRow) ?? null;
  }

  async upsertProfile(input: UserProfileInsert): Promise<UserProfileRow> {
    const [row] = await this.db
      .insert(userProfiles)
      .values({ ...(input as any), updatedAt: this.now() })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { ...(input as any), updatedAt: this.now() },
      })
      .returning();
    return row as UserProfileRow;
  }

  async findActorsByIds(ids: string[]): Promise<UserActorRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: userProfiles.avatarUrl,
        customUrlSlug: userProfiles.customUrlSlug,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(inArray(users.id, ids));
    return rows as UserActorRow[];
  }

  // ── connections (social graph) ────────────────────────────────────────────

  async findConnection(a: string, b: string): Promise<UserConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(userConnections)
      .where(or(
        and(eq(userConnections.fromUserId, a), eq(userConnections.toUserId, b)),
        and(eq(userConnections.fromUserId, b), eq(userConnections.toUserId, a)),
      ))
      .limit(1);
    return (row as UserConnectionRow) ?? null;
  }

  async findConnectionsForUser(userId: string): Promise<UserConnectionRow[]> {
    return (await this.db
      .select()
      .from(userConnections)
      .where(or(eq(userConnections.fromUserId, userId), eq(userConnections.toUserId, userId)))) as UserConnectionRow[];
  }

  async insertConnection(input: UserConnectionInsert): Promise<UserConnectionRow> {
    const [row] = await this.db.insert(userConnections).values(input as any).returning();
    return row as UserConnectionRow;
  }

  async updateConnectionStatus(id: string, status: string, responseMessage?: string): Promise<void> {
    await this.db
      .update(userConnections)
      .set({
        status,
        ...(responseMessage !== undefined ? { responseMessage } : {}),
        updatedAt: this.now(),
      } as any)
      .where(eq(userConnections.id, id));
  }

  // Sentinel to keep the unused `asc` import honest — reserved for future
  // "oldest first" endpoints without re-editing the import line.
  private readonly _ascPinned = asc;
  private readonly _sqlPinned = sql;
}
