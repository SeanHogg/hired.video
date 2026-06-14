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
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  resolveRoleAccess,
  isManageableRole,
  type RoleAccessManifest,
  type RoleFeatureAccessRow,
} from "../../../../shared/role-access.js";
import { isKnownFeatureKey } from "../../../../shared/feature-registry.js";
import type { UserRole } from "../../../../shared/user-roles.js";

const CACHE_VERSION = "v1";
const CACHE_TTL_SECONDS = 300;
const cacheKey = (role: string) => `role-access:${CACHE_VERSION}:${role}`;

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
  constructor(private readonly repo: IRoleFeatureAccessRepository) {}

  /** Resolved manifest for a viewer's role — registry defaults ⊕ DB deltas.
   *  Cached per role; the read never N+1s (one query per role, then a pure
   *  merge). */
  async getManifestForRole(role: UserRole): Promise<RoleAccessManifest> {
    return getOrSetCached<RoleAccessManifest>({
      key: cacheKey(role),
      ttlSeconds: CACHE_TTL_SECONDS,
      loader: async () => {
        const rows = await this.repo.listByRole(role);
        return resolveRoleAccess(role, rows.map(toResolverRow));
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
    if (!isKnownFeatureKey(input.featureKey)) {
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
export class RoleAccessError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
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
