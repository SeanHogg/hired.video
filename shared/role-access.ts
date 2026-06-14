/**
 * Role Access — the shared resolver that merges Feature Registry defaults with
 * per-role DB overrides into a manifest every surface self-gates on. One seam
 * for client (useRoleAccess) and server (RoleAccessService) so the "what does
 * role X see" decision lives in exactly one place (DRY, gap #2036/#2037).
 *
 * `resolveRoleAccess` is pure (no I/O) so it's trivially unit-testable and the
 * same function runs on both sides of the wire.
 */
import { z } from "zod";
import { USER_ROLES, type UserRole } from "./user-roles.js";
import {
  FEATURE_REGISTRY,
  ALL_ROLES,
  defaultVisibleForRole,
  type FeatureKind,
  type FeatureRegistryEntry,
} from "./feature-registry.js";

/** A delta row from `role_feature_access`. A NULL field inherits the registry
 *  default for that role — only genuine deltas are ever stored. */
export interface RoleFeatureAccessRow {
  role: string;
  featureKey: string;
  visible: boolean | null;
  enabled: boolean | null;
  rank: number | null;
}

export interface ResolvedSurface {
  key: string;
  kind: FeatureKind;
  group: string;
  labelKey: string;
  label: string;
  href?: string;
  icon?: string;
  visible: boolean;
  enabled: boolean;
  rank: number;
  /** True when visibility / enablement / order differs from the code default
   *  for this role — drives the admin "overridden" badge + reset affordance. */
  overridden: boolean;
}

export interface RoleAccessManifest {
  role: UserRole;
  surfaces: ResolvedSurface[];
}

/** Is this string a role the manifest can be resolved for? */
export function isManageableRole(role: string | null | undefined): role is UserRole {
  return !!role && (ALL_ROLES as readonly string[]).includes(role);
}

/** Resolve the role to drive the manifest from a JWT `roles` claim. Falls back
 *  to job_seeker (the broadest consumer surface) so an unknown/empty claim
 *  still gets a sensible menu rather than nothing. Mirrors resolveFeedRole. */
export function resolveAccessRole(roles: readonly string[] | null | undefined): UserRole {
  if (roles) {
    for (const r of ALL_ROLES) {
      if (roles.includes(r)) return r;
    }
  }
  return USER_ROLES.JOB_SEEKER;
}

/**
 * Pure merge: registry defaults ⊕ per-role deltas → manifest. Surfaces are
 * returned in registry order; consumers sort nav by `rank` via `navSurfaces`.
 */
export function resolveRoleAccess(
  role: UserRole,
  overrides: readonly RoleFeatureAccessRow[],
): RoleAccessManifest {
  const byKey = new Map<string, RoleFeatureAccessRow>();
  for (const o of overrides) {
    if (o.role === role) byKey.set(o.featureKey, o);
  }

  const surfaces = FEATURE_REGISTRY.map((entry) => resolveOne(entry, role, byKey.get(entry.key)));
  return { role, surfaces };
}

function resolveOne(
  entry: FeatureRegistryEntry,
  role: UserRole,
  o: RoleFeatureAccessRow | undefined,
): ResolvedSurface {
  const defVisible = defaultVisibleForRole(entry, role);
  const visible = o?.visible ?? defVisible;
  const enabled = o?.enabled ?? entry.defaultEnabled;
  const rank = o?.rank ?? entry.order;
  const overridden =
    (o?.visible != null && o.visible !== defVisible) ||
    (o?.enabled != null && o.enabled !== entry.defaultEnabled) ||
    (o?.rank != null && o.rank !== entry.order);
  return {
    key: entry.key,
    kind: entry.kind,
    group: entry.group,
    labelKey: entry.labelKey,
    label: entry.label,
    href: entry.href,
    icon: entry.icon,
    visible,
    enabled,
    rank,
    overridden,
  };
}

/** Visible nav surfaces for a manifest, sorted by per-role rank. */
export function navSurfaces(manifest: RoleAccessManifest): ResolvedSurface[] {
  return manifest.surfaces
    .filter((s) => s.kind === "nav" && s.visible)
    .sort((a, b) => a.rank - b.rank);
}

/** Lookup a single surface by key (for canSee / isEnabled). */
export function findSurface(
  manifest: RoleAccessManifest,
  key: string,
): ResolvedSurface | undefined {
  return manifest.surfaces.find((s) => s.key === key);
}

// ---------------------------------------------------------------------------
// Wire schemas — the SuperAdmin curation API
// ---------------------------------------------------------------------------
const roleEnum = z.enum([...ALL_ROLES] as [string, ...string[]]);

/** Upsert one delta. `visible`/`enabled`/`rank` are tri-state: `null` clears
 *  the override (back to registry default), a value sets it, omitted leaves it. */
export const UpsertRoleAccessSchema = z.object({
  role: roleEnum,
  featureKey: z.string().min(1).max(200),
  visible: z.boolean().nullable().optional(),
  enabled: z.boolean().nullable().optional(),
  rank: z.number().int().min(0).max(100000).nullable().optional(),
});
export type UpsertRoleAccessInput = z.infer<typeof UpsertRoleAccessSchema>;
