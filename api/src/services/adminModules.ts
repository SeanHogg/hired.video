import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { auditLog, AUDIT_ACTIONS } from "../utils/audit.js";

type Module = InferSelectModel<typeof schema.modules>;

export async function listModules() {
  const db = getDb();
  return db.select().from(schema.modules).orderBy(schema.modules.name);
}

export interface CreateModuleInput {
  name: string;
  description?: string;
  requiredRole: string;
  planTier?: string;
  permissions?: string[];
}

export async function createModule(adminId: string, input: CreateModuleInput) {
  const db = getDb();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const [mod] = await db
    .insert(schema.modules)
    .values({
      name: input.name,
      slug,
      description: input.description,
      requiredRole: input.requiredRole,
      planTier: input.planTier ?? "free",
      permissions: input.permissions ?? [],
    })
    .returning();

  await auditLog({
    actorId: adminId,
    action: AUDIT_ACTIONS.MODULE_CREATED,
    targetType: "module",
    targetId: mod.id,
    metadata: { name: input.name, requiredRole: input.requiredRole },
  });

  return mod;
}

export interface UpdateModuleInput {
  name?: string;
  description?: string;
  requiredRole?: string;
  planTier?: string;
  permissions?: string[];
  isActive?: boolean;
}

export async function updateModule(
  adminId: string,
  moduleId: string,
  input: UpdateModuleInput,
): Promise<{ ok: true; mod: Module } | { ok: false; code: "NOT_FOUND" }> {
  const db = getDb();
  const [existing] = await db.select().from(schema.modules).where(eq(schema.modules.id, moduleId)).limit(1);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  const updates: Partial<typeof existing> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.requiredRole !== undefined) updates.requiredRole = input.requiredRole;
  if (input.planTier !== undefined) updates.planTier = input.planTier;
  if (input.permissions !== undefined) updates.permissions = input.permissions;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  const [updated] = await db
    .update(schema.modules)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(schema.modules.id, moduleId))
    .returning();

  await auditLog({
    actorId: adminId,
    action: AUDIT_ACTIONS.MODULE_UPDATED,
    targetType: "module",
    targetId: moduleId,
    metadata: updates as Record<string, unknown>,
  });

  return { ok: true, mod: updated };
}

