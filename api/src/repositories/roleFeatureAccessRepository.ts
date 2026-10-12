/**
 * RoleFeatureAccessRepository — pure data access for role_feature_access
 * (migration 0214), the SuperAdmin per-role overrides for the Feature
 * Registry.
 *
 * No business logic / caching — that lives in
 * services/admin/RoleAccessService.ts, which owns the per-role read-through
 * cache + the merge against the registry (shared/role-access.ts).
 */
import { and, asc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { roleFeatureAccess } = schema;

export type DbLike = any;

export type RoleFeatureAccessRow = typeof roleFeatureAccess.$inferSelect;
export type RoleFeatureAccessInsert = typeof roleFeatureAccess.$inferInsert;

export interface UpsertRoleFeatureAccessInput {
  role: string;
  featureKey: string;
  visible?: boolean | null;
  enabled?: boolean | null;
  rank?: number | null;
  updatedBy?: string | null;
}

export interface IRoleFeatureAccessRepository {
  /** Every override row, ordered by role then feature — the admin read. */
  listAll(): Promise<RoleFeatureAccessRow[]>;
  /** A single role's deltas — the per-role manifest read. */
  listByRole(role: string): Promise<RoleFeatureAccessRow[]>;
  /** Insert or update the (role, feature_key) override in place. */
  upsert(input: UpsertRoleFeatureAccessInput): Promise<RoleFeatureAccessRow>;
  /** Drop one override (back to the registry default for that surface). */
  remove(role: string, featureKey: string): Promise<boolean>;
  /** Drop every override for a role — "reset role to defaults". Returns count. */
  removeByRole(role: string): Promise<number>;
}

export class RoleFeatureAccessRepository implements IRoleFeatureAccessRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listAll(): Promise<RoleFeatureAccessRow[]> {
    return this.db
      .select()
      .from(roleFeatureAccess)
      .orderBy(asc(roleFeatureAccess.role), asc(roleFeatureAccess.featureKey));
  }

  async listByRole(role: string): Promise<RoleFeatureAccessRow[]> {
    return this.db
      .select()
      .from(roleFeatureAccess)
      .where(eq(roleFeatureAccess.role, role))
      .orderBy(asc(roleFeatureAccess.featureKey));
  }

  async upsert(input: UpsertRoleFeatureAccessInput): Promise<RoleFeatureAccessRow> {
    const now = this.now();
    const [row] = await this.db
      .insert(roleFeatureAccess)
      .values({
        role: input.role,
        featureKey: input.featureKey,
        visible: input.visible ?? null,
        enabled: input.enabled ?? null,
        rank: input.rank ?? null,
        updatedBy: input.updatedBy ?? null,
        createdAt: now,
        updatedAt: now,
      } as RoleFeatureAccessInsert)
      .onConflictDoUpdate({
        target: [roleFeatureAccess.role, roleFeatureAccess.featureKey],
        set: {
          visible: input.visible ?? null,
          enabled: input.enabled ?? null,
          rank: input.rank ?? null,
          updatedBy: input.updatedBy ?? null,
          updatedAt: now,
        },
      })
      .returning();
    return row;
  }

  async remove(role: string, featureKey: string): Promise<boolean> {
    const rows = await this.db
      .delete(roleFeatureAccess)
      .where(
        and(
          eq(roleFeatureAccess.role, role),
          eq(roleFeatureAccess.featureKey, featureKey),
        ),
      )
      .returning({ id: roleFeatureAccess.id });
    return rows.length > 0;
  }

  async removeByRole(role: string): Promise<number> {
    const rows = await this.db
      .delete(roleFeatureAccess)
      .where(eq(roleFeatureAccess.role, role))
      .returning({ id: roleFeatureAccess.id });
    return rows.length;
  }
}
