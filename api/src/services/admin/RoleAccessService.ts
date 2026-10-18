/**
 * RoleAccessService — business logic for the SuperAdmin per-role feature &
 * navigation manifest (role_feature_access, migration 0214; #2037).
 *
 * Read path (`getManifestForRole`) is hot: every authenticated page load
 * resolves the viewer's menu/feature manifest, the override set changes
 * rarely, and it's identical for everyone of a given role. So it's served
 * through the canonical read-through cache (getOrSetCached — L1 isolate Map +
 * L2 KV) keyed per role, and every write invalidates that role's key. The
 * merge against the registry is pure (shared/role-access.ts) so the same
 * resolver runs here and on the client.
 */
import type {
  IRoleFeatureAccessRepository,
  RoleFeatureAccessRow as DbRow,
} from "../../repositories/roleFeatureAccessRepository.js";
import type { IAuthzRepository } from "../../repositories/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import {
  resolveRoleAccess,
  isManageableRole,
  type RoleAccessManifest,
  type RoleFeatureAccessRow,
} from "../../../../shared/role-access.js";
import {
  isAssignableFeatureKey,
  getRegistryEntry,
} from "../../../../shared/feature-registry.js";
import type { UserRole } from "../../../../shared/user-roles.js";
import { DomainError } from "../../domains/errors.js";

const CACHE_VERSION = "v1";
const CACHE_TTL_SECONDS = 300;
const cacheKey = (role: string) => `role-access:${CACHE_VERSION}:${role}`;
const userModulesKey = (userId: string) => `user-modules:${CACHE_VERSION}:${userId}`;

/** Drop a user's cached module-assignment slugs — call on grant/revoke so the
 *  per-user feature gate (#2042) reflects the change immediately. */
export function invalidateUserModulesCache(userId: string): void {
  invalidateIsolateKey(userModulesKey(userId));
}

/** Admin DTO — one stored override row, ISO-stamped for the wire. */
export interface RoleAccessOverrideDto {
  role: string;
  featureKey: string;
  visible: boolean | null;
  enabled: boolean | null;
  rank: number | null;
  updatedAt: string;
}

export class RoleAccessService {
  constructor(
    private readonly repo: IRoleFeatureAccessRepository,
    /** Optional — only needed for the per-user feature gate (#2042). */
    private readonly authz?: IAuthzRepository,
  ) {}

  /** A role's raw override deltas (resolver-shaped), cached per role. This is
   *  the single cached read both `/me` (client resolves the combined registry
   *  from it) and `getManifestForRole` (server-side enforcement) share — one
   *  query per role, no N+1. */
  async getOverridesForRole(role: UserRole): Promise<RoleFeatureAccessRow[]> {
    return getOrSetCached<RoleFeatureAccessRow[]>({
      key: cacheKey(role),
      ttlSeconds: CACHE_TTL_SECONDS,
      loader: async () => {
        const rows = await this.repo.listByRole(role);
        return rows.map(toResolverRow);
      },
    });
  }

  /** Server-resolved manifest over the SHARED registry (nav/modules) — used by
   *  server-side enforcement (the feature gate). The client resolves a fuller
   *  registry (incl. tools) itself from `getOverridesForRole`. */
  async getManifestForRole(role: UserRole): Promise<RoleAccessManifest> {
    const overrides = await this.getOverridesForRole(role);
    return resolveRoleAccess(role, overrides);
  }

  /**
   * Is an enforced feature enabled for a role? Used by the server-side gate
   * (#2039). Resolution: explicit per-role override → registry default →
   * true (unknown key = not gated here; the global module switch handles that).
   * Reads the per-role cached overrides, so it's safe on the hot path.
   */
  async isFeatureEnabledForRole(role: string, key: string): Promise<boolean> {
    if (!isManageableRole(role)) return true;
    const overrides = await this.getOverridesForRole(role);
    const o = overrides.find((r) => r.featureKey === key);
    if (o?.enabled != null) return o.enabled;
    const entry = getRegistryEntry(key);
    return entry ? entry.defaultEnabled : true;
  }

  /**
   * Per-user precedence over the role gate (#2042): an explicit module
   * assignment (userModuleAssignments) enables a `module:<slug>` for that user
   * even if their role disabled it. Falls through to the role gate otherwise.
   * The per-user assignment slugs are cached (120s) — invalidate on
   * grant/revoke via `invalidateUserModulesCache`.
   */
  async isFeatureEnabledForUser(
    userId: string | undefined | null,
    role: string,
    key: string,
  ): Promise<boolean> {
    if (userId && this.authz && key.startsWith("module:")) {
      const slug = key.slice("module:".length);
      if ((await this.userModuleSlugs(userId)).includes(slug)) return true;
    }
    return this.isFeatureEnabledForRole(role, key);
  }

  private async userModuleSlugs(userId: string): Promise<string[]> {
    if (!this.authz) return [];
    const authz = this.authz;
    // Per-user → isolate-local (no KV write per miss on Workers Free).
    return getOrSetIsolateCached<string[]>({
      key: userModulesKey(userId),
      ttlSeconds: 120,
      loader: async () => {
        const rows = await authz.findActiveAssignmentsForUser(userId);
        return rows.map((r) => r.slug).filter(Boolean);
      },
    });
  }

  /** Every override row — the admin curation read. The admin UI resolves each
   *  role's manifest itself with the same shared resolver, so this returns the
   *  raw deltas (not per-role manifests) to avoid N round-trips. Uncached so
   *  writes reflect immediately. */
  async listOverridesForAdmin(): Promise<RoleAccessOverrideDto[]> {
    const rows = await this.repo.listAll();
    return rows.map(toAdminDto);
  }

  /** Set / clear one (role, feature) override. `null` on a field clears it
   *  back to the registry default. Invalidates that role's cached manifest. */
  async upsert(
    input: {
      role: string;
      featureKey: string;
      visible?: boolean | null;
      enabled?: boolean | null;
      rank?: number | null;
    },
    actorId?: string | null,
  ): Promise<RoleAccessOverrideDto> {
    if (!isManageableRole(input.role)) {
      throw new RoleAccessError("INVALID_ROLE", `Unknown role: ${input.role}`);
    }
    if (!isAssignableFeatureKey(input.featureKey)) {
      throw new RoleAccessError(
        "UNKNOWN_FEATURE",
        `Unknown feature key: ${input.featureKey}`,
      );
    }
    const row = await this.repo.upsert({ ...input, updatedBy: actorId ?? null });
    this.invalidate(input.role);
    return toAdminDto(row);
  }

  /** Reset a role to registry defaults (delete all its deltas). */
  async resetRole(role: string): Promise<number> {
    if (!isManageableRole(role)) {
      throw new RoleAccessError("INVALID_ROLE", `Unknown role: ${role}`);
    }
    const count = await this.repo.removeByRole(role);
    this.invalidate(role);
    return count;
  }

  private invalidate(role: string): void {
    invalidateCachedKey(cacheKey(role));
  }
}

/** Typed service error so routes can map to the right HTTP status. */
export class RoleAccessError extends DomainError {
  constructor(code: string, message: string) {
    super(400, code, message);
    this.name = "RoleAccessError";
  }
}

function toResolverRow(r: DbRow): RoleFeatureAccessRow {
  return {
    role: r.role,
    featureKey: r.featureKey,
    visible: r.visible ?? null,
    enabled: r.enabled ?? null,
    rank: r.rank ?? null,
  };
}

function toAdminDto(r: DbRow): RoleAccessOverrideDto {
  return {
    role: r.role,
    featureKey: r.featureKey,
    visible: r.visible ?? null,
    enabled: r.enabled ?? null,
    rank: r.rank ?? null,
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}
