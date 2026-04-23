/**
 * AuthzRepository — post-auth access control.
 *
 * Covers:
 *   • modules, userModuleAssignments — feature-module grants
 *   • userPermissionOverrides        — per-user permission overrides
 *   • apiKeys                        — programmatic API key credentials
 *
 * Grouped because these all answer "what is this user allowed to do?"
 * after they've already proven who they are (AuthTokens). API keys are
 * here because they're a form of access — issuing/revoking one is an
 * authz operation, not a session-bearer token like refreshTokens.
 */

import { and, eq, isNull } from "drizzle-orm";
import { schema } from "../db/index.js";

const { modules, userModuleAssignments, userPermissionOverrides, apiKeys } = schema;

export type DbLike = any;

export type ModuleRow = typeof modules.$inferSelect;
export type ModuleInsert = typeof modules.$inferInsert;
export type UserModuleAssignmentRow = typeof userModuleAssignments.$inferSelect;
export type UserModuleAssignmentInsert = typeof userModuleAssignments.$inferInsert;
export type UserPermissionOverrideRow = typeof userPermissionOverrides.$inferSelect;
export type UserPermissionOverrideInsert = typeof userPermissionOverrides.$inferInsert;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type ApiKeyInsert = typeof apiKeys.$inferInsert;

export interface IAuthzRepository {
  // modules + assignments
  listModules(): Promise<ModuleRow[]>;
  findModuleById(id: string): Promise<ModuleRow | null>;
  findModuleBySlug(slug: string): Promise<ModuleRow | null>;
  insertModule(input: ModuleInsert): Promise<ModuleRow>;
  updateModuleById(id: string, patch: Partial<ModuleInsert>): Promise<ModuleRow | null>;
  findActiveAssignmentsForUser(userId: string): Promise<Array<UserModuleAssignmentRow & { name: string; slug: string }>>;
  findActiveAssignment(userId: string, moduleId: string): Promise<UserModuleAssignmentRow | null>;
  insertAssignment(input: UserModuleAssignmentInsert): Promise<UserModuleAssignmentRow>;
  revokeAssignment(userId: string, moduleId: string): Promise<void>;
  // permission overrides
  findPermissionOverridesForUser(userId: string): Promise<UserPermissionOverrideRow[]>;
  upsertPermissionOverride(input: UserPermissionOverrideInsert): Promise<void>;
  // api keys
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null>;
  findApiKeysForUser(userId: string): Promise<ApiKeyRow[]>;
  insertApiKey(input: ApiKeyInsert): Promise<ApiKeyRow>;
  revokeApiKey(id: string, userId: string): Promise<boolean>;
}

export class AuthzRepository implements IAuthzRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async listModules(): Promise<ModuleRow[]> {
    return (await this.db.select().from(modules)) as ModuleRow[];
  }

  async findModuleById(id: string): Promise<ModuleRow | null> {
    const [row] = await this.db.select().from(modules).where(eq(modules.id, id)).limit(1);
    return (row as ModuleRow) ?? null;
  }

  async findModuleBySlug(slug: string): Promise<ModuleRow | null> {
    const [row] = await this.db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    return (row as ModuleRow) ?? null;
  }

  async insertModule(input: ModuleInsert): Promise<ModuleRow> {
    const [row] = await this.db.insert(modules).values(input as any).returning();
    return row as ModuleRow;
  }

  async updateModuleById(id: string, patch: Partial<ModuleInsert>): Promise<ModuleRow | null> {
    const [row] = await this.db
      .update(modules)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(modules.id, id))
      .returning();
    return (row as ModuleRow) ?? null;
  }

  async findActiveAssignmentsForUser(userId: string) {
    const rows = await this.db
      .select({
        id: userModuleAssignments.id,
        userId: userModuleAssignments.userId,
        moduleId: userModuleAssignments.moduleId,
        assignedAt: userModuleAssignments.assignedAt,
        revokedAt: userModuleAssignments.revokedAt,
        name: modules.name,
        slug: modules.slug,
      })
      .from(userModuleAssignments)
      .innerJoin(modules, eq(userModuleAssignments.moduleId, modules.id))
      .where(and(
        eq(userModuleAssignments.userId, userId),
        isNull(userModuleAssignments.revokedAt),
      ));
    return rows as any;
  }

  async findActiveAssignment(userId: string, moduleId: string): Promise<UserModuleAssignmentRow | null> {
    const [row] = await this.db
      .select()
      .from(userModuleAssignments)
      .where(and(
        eq(userModuleAssignments.userId, userId),
        eq(userModuleAssignments.moduleId, moduleId),
        isNull(userModuleAssignments.revokedAt),
      ))
      .limit(1);
    return (row as UserModuleAssignmentRow) ?? null;
  }

  async insertAssignment(input: UserModuleAssignmentInsert): Promise<UserModuleAssignmentRow> {
    const [row] = await this.db.insert(userModuleAssignments).values(input as any).returning();
    return row as UserModuleAssignmentRow;
  }

  async revokeAssignment(userId: string, moduleId: string): Promise<void> {
    await this.db
      .update(userModuleAssignments)
      .set({ revokedAt: this.now() } as any)
      .where(and(
        eq(userModuleAssignments.userId, userId),
        eq(userModuleAssignments.moduleId, moduleId),
        isNull(userModuleAssignments.revokedAt),
      ));
  }

  async findPermissionOverridesForUser(userId: string): Promise<UserPermissionOverrideRow[]> {
    return (await this.db
      .select()
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId))) as UserPermissionOverrideRow[];
  }

  async upsertPermissionOverride(input: UserPermissionOverrideInsert): Promise<void> {
    await this.db
      .insert(userPermissionOverrides)
      .values({ ...(input as any), updatedAt: this.now() })
      .onConflictDoUpdate({
        target: [userPermissionOverrides.userId, userPermissionOverrides.permissionKey],
        set: { ...(input as any), updatedAt: this.now() },
      });
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    return (row as ApiKeyRow) ?? null;
  }

  async findApiKeysForUser(userId: string): Promise<ApiKeyRow[]> {
    return (await this.db.select().from(apiKeys).where(eq(apiKeys.userId, userId))) as ApiKeyRow[];
  }

  async insertApiKey(input: ApiKeyInsert): Promise<ApiKeyRow> {
    const [row] = await this.db.insert(apiKeys).values(input as any).returning();
    return row as ApiKeyRow;
  }

  async revokeApiKey(id: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .limit(1);
    if (!row) return false;
    await this.db
      .update(apiKeys)
      .set({ revokedAt: this.now() } as any)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
    return true;
  }
}
