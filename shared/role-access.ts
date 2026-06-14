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
  STATIC_REGISTRY,
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
  /** When true, disabling (`enabled=false`) is enforced server-side (the
   *  feature's API is blocked), not just hidden. Drives the admin Enabled
   *  toggle. Cosmetic surfaces (nav, tools) are enforce=false. */
  enforce: boolean;
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
 *
 * `registry` is parameterized so the SAME resolver runs everywhere: the server
 * resolves the shared FEATURE_REGISTRY (nav/modules), while the client passes a
 * combined registry that also includes tool surfaces derived from the frontend
 * tools catalog (which can't live in shared). One function, no drift.
 */
export function resolveRoleAccess(
  role: UserRole,
  overrides: readonly RoleFeatureAccessRow[],
  registry: readonly FeatureRegistryEntry[] = STATIC_REGISTRY,
  opts?: {
    /** Per-USER deltas, applied as the highest-precedence tier over the role
     *  overrides (#2042). Same shape; rows whose role !== the viewer's role are
     *  ignored, so callers can pass the user's rows tagged with their role. */
    userOverrides?: readonly RoleFeatureAccessRow[];
    /** Capabilities (RBAC verbs) the viewer holds. When provided, a surface
     *  with `requiresCapability` is hidden unless its capability is present.
     *  Omit to skip capability gating entirely (zero regression). */
    capabilities?: ReadonlySet<string>;
  },
): RoleAccessManifest {
  const byKey = new Map<string, RoleFeatureAccessRow>();
  for (const o of overrides) {
    if (o.role === role) byKey.set(o.featureKey, o);
  }
  // Per-user tier wins over role tier.
  for (const o of opts?.userOverrides ?? []) {
    if (o.role === role) byKey.set(o.featureKey, o);
  }

  const surfaces = registry.map((entry) =>
    resolveOne(entry, role, byKey.get(entry.key), opts?.capabilities),
  );
  return { role, surfaces };
}

/** Stable feature-registry key for a catalog tool id. Single seam so client +
 *  server agree on how a tool maps to an override row. */
export function toolFeatureKey(toolId: string): string {
  return `tool:${toolId}`;
}

function resolveOne(
  entry: FeatureRegistryEntry,
  role: UserRole,
  o: RoleFeatureAccessRow | undefined,
  capabilities?: ReadonlySet<string>,
): ResolvedSurface {
  const defVisible = defaultVisibleForRole(entry, role);
  // Capability gate (#2042): a surface that requires a capability is hidden
  // when the caller supplies a capability set lacking it — applied on top of
  // the visibility override (capability wins, it's authorization).
  const capabilityOk =
    !entry.requiresCapability ||
    capabilities === undefined ||
    capabilities.has(entry.requiresCapability);
  const visible = (o?.visible ?? defVisible) && capabilityOk;
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
    enforce: entry.enforce,
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
