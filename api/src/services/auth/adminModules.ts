import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { AUDIT_ACTIONS } from "../../utils/audit.js";
import { invalidateModuleStatusCache } from "./moduleStatus.js";
import { type ApiDeps, defaultApiDeps } from "../apiDeps.js";

type Module = InferSelectModel<typeof schema.modules>;

/** Narrow Deps slice. Authz-repo drives module CRUD + assignment; audit
 *  port records every admin action. A raw `db` handle is kept available
 *  for the two queries that touch `userPermissionOverrides` via bulk
 *  insert — the Authz repo currently lacks a bulk-upsert method. */
export type AdminModulesDeps = Pick<ApiDeps, "repos" | "audit"> & {
  db: ReturnType<typeof getDb>;
};

const resolveDeps = (deps?: Partial<AdminModulesDeps>): AdminModulesDeps => {
  if (deps && deps.repos && deps.audit && deps.db) return deps as AdminModulesDeps;
  const api = defaultApiDeps();
  return {
    repos: deps?.repos ?? api.repos,
    audit: deps?.audit ?? api.audit,
    db: deps?.db ?? getDb(),
  };
};

export async function listModules(deps?: Partial<AdminModulesDeps>) {
  const d = resolveDeps(deps);
  return d.repos.authz.listModules();
}

export interface CreateModuleInput {
  name: string;
  description?: string;
  requiredRole: string;
  planTier?: string;
  permissions?: string[];
}

export async function createModule(
  adminId: string,
  input: CreateModuleInput,
  deps?: Partial<AdminModulesDeps>,
) {
  const d = resolveDeps(deps);
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const mod = await d.repos.authz.insertModule({
    name: input.name,
    slug,
    description: input.description,
    requiredRole: input.requiredRole,
    planTier: input.planTier ?? "free",
    permissions: input.permissions ?? [],
  } as any);

  await d.audit.log({
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
  deps?: Partial<AdminModulesDeps>,
): Promise<{ ok: true; mod: Module } | { ok: false; code: "NOT_FOUND" }> {
  const d = resolveDeps(deps);
  const existing = await d.repos.authz.findModuleById(moduleId);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  const updates: Partial<typeof existing> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.requiredRole !== undefined) updates.requiredRole = input.requiredRole;
  if (input.planTier !== undefined) updates.planTier = input.planTier;
  if (input.permissions !== undefined) updates.permissions = input.permissions;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  const updated = await d.repos.authz.updateModuleById(moduleId, updates as any);
  if (!updated) return { ok: false, code: "NOT_FOUND" };

  await d.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.MODULE_UPDATED,
    targetType: "module",
    targetId: moduleId,
    metadata: updates as Record<string, unknown>,
  });

  if (input.isActive !== undefined) invalidateModuleStatusCache();

  return { ok: true, mod: updated };
}

// ── User ↔ Module assignment ──────────────────────────────────────────────────

export async function assignModuleToUser(
  adminId: string,
  userId: string,
  moduleId: string,
  deps?: Partial<AdminModulesDeps>,
): Promise<{ ok: true; moduleName: string } | { ok: false; code: "NOT_FOUND" }> {
  const d = resolveDeps(deps);
  const mod = await d.repos.authz.findModuleById(moduleId);
  if (!mod) return { ok: false, code: "NOT_FOUND" };

  // Idempotent: `onConflictDoNothing` via direct Drizzle because the
  // current Authz repo doesn't expose bulk permission-override insert.
  await d.db
    .insert(schema.userModuleAssignments)
    .values({ userId, moduleId, assignedBy: adminId } as any)
    .onConflictDoNothing();

  const permissions = (mod.permissions as string[] | null) ?? [];
  if (permissions.length > 0) {
    await d.db
      .insert(schema.userPermissionOverrides)
      .values(
        permissions.map((permKey) => ({
          userId,
          permissionKey: permKey,
          granted: true,
          source: `module:${moduleId}`,
          grantedBy: adminId,
        })),
      )
      .onConflictDoNothing();
  }

  await d.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.MODULE_ASSIGNED,
    targetType: "user",
    targetId: userId,
    metadata: { moduleId, moduleName: mod.name },
  });

  return { ok: true, moduleName: mod.name };
}

export async function removeModuleFromUser(
  adminId: string,
  userId: string,
  moduleId: string,
  deps?: Partial<AdminModulesDeps>,
): Promise<void> {
  const d = resolveDeps(deps);
  await d.repos.authz.revokeAssignment(userId, moduleId);

  await d.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.MODULE_REMOVED,
    targetType: "user",
    targetId: userId,
    metadata: { moduleId },
  });
}
