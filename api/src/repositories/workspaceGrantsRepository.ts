/**
 * WorkspaceGrantsRepository — the `workspace_grants` aggregate (delegated
 * Studio edit rights: a subject invites a contributor). Backs the grant
 * management endpoints in routes/workspaces.ts. The authorization-side
 * grant lookups (canActFor / listAccessibleWorkspaces) stay in
 * services/studio/workspace.ts with `activeGrantConditions`.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { users, workspaceGrants } = schema;

export type WorkspaceGrantRow = typeof workspaceGrants.$inferSelect;
export type WorkspaceGrantInsert = typeof workspaceGrants.$inferInsert;

export interface GrantGivenRow {
  id: string;
  contributorUserId: string;
  contributorName: string | null;
  contributorEmail: string | null;
  role: string;
  scope: string;
  isActive: boolean;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface GrantReceivedRow {
  id: string;
  subjectUserId: string;
  subjectName: string | null;
  subjectEmail: string | null;
  role: string;
  scope: string;
  isActive: boolean;
  grantedAt: Date;
  expiresAt: Date | null;
}

export interface IWorkspaceGrantsRepository {
  /** Every grant the subject has given (any state), with contributor identity. */
  listGivenBy(subjectUserId: string): Promise<GrantGivenRow[]>;
  /** Live (active, unexpired) grants the contributor has received, any scope. */
  listActiveReceivedBy(contributorUserId: string): Promise<GrantReceivedRow[]>;
  findActive(subjectUserId: string, contributorUserId: string, scope: string): Promise<WorkspaceGrantRow | null>;
  insert(values: WorkspaceGrantInsert): Promise<WorkspaceGrantRow>;
  insertIfAbsent(values: WorkspaceGrantInsert): Promise<void>;
  /** Deactivate a grant the subject owns; null when no such grant. */
  revoke(id: string, subjectUserId: string): Promise<{ id: string } | null>;
}

export class WorkspaceGrantsRepository implements IWorkspaceGrantsRepository {
  constructor(private readonly db: Db) {}

  async listGivenBy(subjectUserId: string): Promise<GrantGivenRow[]> {
    return this.db
      .select({
        id: workspaceGrants.id,
        contributorUserId: workspaceGrants.contributorUserId,
        contributorName: users.name,
        contributorEmail: users.email,
        role: workspaceGrants.role,
        scope: workspaceGrants.scope,
        isActive: workspaceGrants.isActive,
        grantedAt: workspaceGrants.grantedAt,
        expiresAt: workspaceGrants.expiresAt,
        revokedAt: workspaceGrants.revokedAt,
      })
      .from(workspaceGrants)
      .leftJoin(users, eq(users.id, workspaceGrants.contributorUserId))
      .where(eq(workspaceGrants.subjectUserId, subjectUserId));
  }

  async listActiveReceivedBy(contributorUserId: string): Promise<GrantReceivedRow[]> {
    return this.db
      .select({
        id: workspaceGrants.id,
        subjectUserId: workspaceGrants.subjectUserId,
        subjectName: users.name,
        subjectEmail: users.email,
        role: workspaceGrants.role,
        scope: workspaceGrants.scope,
        isActive: workspaceGrants.isActive,
        grantedAt: workspaceGrants.grantedAt,
        expiresAt: workspaceGrants.expiresAt,
      })
      .from(workspaceGrants)
      .leftJoin(users, eq(users.id, workspaceGrants.subjectUserId))
      .where(
        and(
          eq(workspaceGrants.contributorUserId, contributorUserId),
          eq(workspaceGrants.isActive, true),
          or(isNull(workspaceGrants.expiresAt), sql`${workspaceGrants.expiresAt} > NOW()`),
        ),
      );
  }

  async findActive(subjectUserId: string, contributorUserId: string, scope: string): Promise<WorkspaceGrantRow | null> {
    const [row] = await this.db
      .select()
      .from(workspaceGrants)
      .where(
        and(
          eq(workspaceGrants.subjectUserId, subjectUserId),
          eq(workspaceGrants.contributorUserId, contributorUserId),
          eq(workspaceGrants.scope, scope),
          eq(workspaceGrants.isActive, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async insert(values: WorkspaceGrantInsert): Promise<WorkspaceGrantRow> {
    const [row] = await this.db.insert(workspaceGrants).values(values).returning();
    return row;
  }

  /** Insert that is a no-op when it would duplicate a live grant (the unique
   *  partial index `uq_workspace_grants_active`). */
  async insertIfAbsent(values: WorkspaceGrantInsert): Promise<void> {
    await this.db.insert(workspaceGrants).values(values).onConflictDoNothing();
  }

  async revoke(id: string, subjectUserId: string): Promise<{ id: string } | null> {
    const now = new Date();
    const [row] = await this.db
      .update(workspaceGrants)
      .set({ isActive: false, revokedAt: now, updatedAt: now })
      .where(and(eq(workspaceGrants.id, id), eq(workspaceGrants.subjectUserId, subjectUserId)))
      .returning({ id: workspaceGrants.id });
    return row ?? null;
  }
}
