/**
 * Feature Registry — the single source of truth for every per-role gateable
 * surface in the app (navigation items today; tools / feature modules /
 * admin tabs as later phases register them).
 *
 * Why this exists: role→surface visibility used to be hardcoded across six
 * disconnected places (Sidebar `hideForRoles`, MobileBottomNav switch, the
 * tools-catalog `audienceRoles`, etc. — see the gap register #1995/#2036).
 * This registry is the catalog the SuperAdmin `/admin/role-access` UI renders
 * and the defaults the resolver merges DB overrides onto. The DB table
 * (`role_feature_access`) stores ONLY deltas from these defaults, so an empty
 * table reproduces exactly today's behaviour (zero regression by construction).
 *
 * Adding a new gateable surface = one entry here; it then appears in the admin
 * UI automatically and is consumed by the shared resolver (see role-access.ts).
 *
 * Both client and server import from here so the catalog can't drift.
 */
import { USER_ROLES, type UserRole } from "./user-roles.js";

export type FeatureKind = "nav" | "tool" | "module" | "admin_tab";

export interface FeatureRegistryEntry {
  /** Stable, namespaced key — `nav:studio`, `tool:resume-roast`, … */
  key: string;
  kind: FeatureKind;
  /** Admin-UI grouping label. */
  group: string;
  /** i18n key for the rendered label (nav) + admin list. */
  labelKey: string;
  /** Plain-English fallback when no i18n context (admin list / tests). */
  label: string;
  /** Roles that see this surface by default — a faithful snapshot of the
   *  hardcoded behaviour at the time of authoring. */
  defaultRoles: readonly UserRole[];
  /** Whether the underlying feature is on by default. */
  defaultEnabled: boolean;
  /** When true, disabling also blocks the server route (Phase 3, #2039).
   *  When false the toggle is cosmetic (hides the menu link only). */
  enforce: boolean;
  /** Default ordering within its `kind` (nav rail order). */
  order: number;
  href?: string;
  /** Icon-name SSoT — the frontend maps this to a Lucide component. */
  icon?: string;
}

/** Every manageable role, in admin-UI display order (product personas first,
 *  then staff). This is the role axis the registry + resolver reason over. */
export const ALL_ROLES: readonly UserRole[] = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.EMPLOYEE,
  USER_ROLES.CREATOR,
  USER_ROLES.AFFILIATE,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
] as const;

/** Every role EXCEPT the given ones — mirrors the Sidebar deny-list so the
 *  registry default reproduces the current `hideForRoles` behaviour. */
function allExcept(...roles: UserRole[]): readonly UserRole[] {
  return ALL_ROLES.filter((r) => !roles.includes(r));
}

const { AFFILIATE, CREATOR } = USER_ROLES;

function nav(
  slug: string,
  labelKey: string,
  label: string,
  icon: string,
  href: string,
  defaultRoles: readonly UserRole[],
  order: number,
): FeatureRegistryEntry {
  return {
    key: `nav:${slug}`,
    kind: "nav",
    group: "Navigation",
    labelKey,
    label,
    defaultRoles,
    defaultEnabled: true,
    enforce: false, // nav visibility is cosmetic; route access stays server-side
    order,
    href,
    icon,
  };
}

/**
 * Phase 1 registry — the main sidebar rail. `defaultRoles` is a 1:1 snapshot
 * of [Sidebar.tsx] `hideForRoles` at authoring time (affiliate/creator
 * trimmed), so `resolveRoleAccess(role, [])` === the pre-#2037 menu for every
 * role. Tool / module / admin_tab kinds are added in later phases (#2038-#2040).
 */
export const FEATURE_REGISTRY: readonly FeatureRegistryEntry[] = [
  nav("dashboard", "labels.dashboard", "Dashboard", "TrendingUp", "/dashboard", ALL_ROLES, 0),
  nav("studio", "labels.studio", "Studio", "Palette", "/studio", allExcept(AFFILIATE), 1),
  nav("tools", "labels.tools", "Tools", "Wrench", "/tools", ALL_ROLES, 2),
  nav("resumes", "labels.resumes", "Resumes", "FileText", "/resumes", allExcept(AFFILIATE), 3),
  nav("jobs", "labels.jobs", "Jobs", "Briefcase", "/jobs", ALL_ROLES, 4),
  nav("companies", "labels.companies", "Companies", "Building2", "/companies", allExcept(AFFILIATE), 5),
  nav("people", "labels.people", "People", "Users", "/people", ALL_ROLES, 6),
  nav("tasks", "labels.tasksAndEvents", "Tasks / Events", "CheckSquare", "/tasks", ALL_ROLES, 7),
  nav("outreach", "labels.outreach", "Outreach", "Send", "/outreach", allExcept(AFFILIATE, CREATOR), 8),
  nav("marketplace", "labels.marketplace", "Marketplace", "Store", "/search", ALL_ROLES, 9),
  nav("gigs", "labels.gigs", "Gigs", "Handshake", "/gigs", allExcept(AFFILIATE), 10),
  nav("services", "labels.myServices", "My Services", "ShoppingBag", "/services", ALL_ROLES, 11),
] as const;

const REGISTRY_BY_KEY: ReadonlyMap<string, FeatureRegistryEntry> = new Map(
  FEATURE_REGISTRY.map((e) => [e.key, e]),
);

export function getRegistryEntry(key: string): FeatureRegistryEntry | undefined {
  return REGISTRY_BY_KEY.get(key);
}

export function isKnownFeatureKey(key: string): boolean {
  return REGISTRY_BY_KEY.has(key);
}

/** Does this role see the surface by default (before any DB override)? */
export function defaultVisibleForRole(
  entry: FeatureRegistryEntry,
  role: string,
): boolean {
  return (entry.defaultRoles as readonly string[]).includes(role);
}
