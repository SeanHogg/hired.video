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
import { USER_ROLES, HIRING_PERSONAS_ENABLED, type UserRole } from "./user-roles.js";
import { STUDIO_NEW_JOB_PATH } from "./studio-paths.js";

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
  /** Capability (RBAC verb) this surface ALSO requires — the reconcile of the
   *  capability axis (rolePermissionOverrides / userPermissionOverrides) with
   *  surface visibility (#2042). When set, the surface is visible only if the
   *  role-access manifest allows it AND the viewer holds this capability. No
   *  current entry sets it (forward seam); the resolver only gates when both a
   *  capability is required and the caller supplies the capability set. */
  requiresCapability?: string;
  /** Hiring-side surface (recruiter / employer workflow). When the persona
   *  switch `HIRING_PERSONAS_ENABLED` is off the resolver forces it hidden +
   *  disabled for EVERY role, regardless of defaults or DB overrides. */
  hiringOnly?: boolean;
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
  // Cross-job candidate pipeline (#405) — hiring-side only, so scoped to
  // recruiter / employer / admin (job_seeker / employee / creator / affiliate
  // never see it). Sits right after Jobs in the rail. hiringOnly → off for
  // everyone while HIRING_PERSONAS_ENABLED is false.
  {
    ...nav(
      "pipeline",
      "labels.candidatePipeline",
      "Pipeline",
      "KanbanSquare",
      "/recruit/pipeline",
      [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN],
      5,
    ),
    hiringOnly: true,
  },
  nav("companies", "labels.companies", "Companies", "Building2", "/companies", allExcept(AFFILIATE), 6),
  nav("people", "labels.people", "People", "Users", "/people", ALL_ROLES, 7),
  nav("tasks", "labels.tasksAndEvents", "Tasks / Events", "CheckSquare", "/tasks", ALL_ROLES, 8),
  nav("outreach", "labels.outreach", "Outreach", "Send", "/outreach", allExcept(AFFILIATE, CREATOR), 9),
  nav("marketplace", "labels.marketplace", "Marketplace", "Store", "/search", ALL_ROLES, 10),
  // Gigs folded into the My Services hub as a tab (/services/gigs); the
  // standalone /gigs nav entry was retired — the hub link covers both. The
  // affiliate gate that gigs carried now lives on the in-hub Gigs tab.
  nav("services", "labels.servicesGigs", "Services / Gigs", "ShoppingBag", "/services", ALL_ROLES, 11),
] as const;

/**
 * Feature modules — the back-end "feature bundle" kill-switches that used to be
 * a GLOBAL-only on/off (`modules` table + moduleGateByPath, #2039). Registered
 * here as enforced surfaces (enforce=true) so a SuperAdmin can disable a module
 * PER ROLE — disabling blocks the module's API for that role (the path gate
 * consults this). Slugs mirror the enforcement path map
 * (api/src/lib/moduleRouteRegistry.ts); the global modules-table toggle still
 * applies independently (a module off either globally OR for the role = off).
 * defaultEnabled=true (opt-in enforcement: a module is on until disabled).
 */
const MODULE_DEFS: { slug: string; label: string }[] = [
  { slug: "ads", label: "Ads" },
  { slug: "advertising", label: "Advertising" },
  { slug: "affiliates", label: "Affiliates" },
  { slug: "ai", label: "AI" },
  { slug: "ats", label: "ATS" },
  { slug: "assessments", label: "Assessments" },
  { slug: "auto-apply", label: "Auto-Apply" },
  { slug: "exclusive-boards", label: "Exclusive Boards" },
  { slug: "calendar", label: "Calendar" },
  { slug: "career", label: "Career" },
  { slug: "community", label: "Community" },
  { slug: "creators", label: "Creators" },
  { slug: "feed", label: "Feed" },
  { slug: "followups", label: "Follow-ups" },
  { slug: "hubs", label: "Hubs" },
  { slug: "interview", label: "Interview" },
  { slug: "people-ops", label: "People Ops" },
  { slug: "resume-scorer", label: "Resume Scorer" },
  { slug: "resume-optimizer", label: "Resume Optimizer" },
  { slug: "video-studio", label: "Video Studio" },
  { slug: "value-proposition", label: "Value Proposition" },
];

const MODULE_REGISTRY: readonly FeatureRegistryEntry[] = MODULE_DEFS.map((m, i) => ({
  key: `module:${m.slug}`,
  kind: "module" as const,
  group: "Feature Modules",
  labelKey: `modules.${m.slug}.label`,
  label: m.label,
  defaultRoles: ALL_ROLES,
  defaultEnabled: true,
  enforce: true, // disabling blocks the module's API for the role
  order: 200 + i,
}));

/** The full static registry the server resolves over (nav + modules). The
 *  client appends tool surfaces from its catalog (see role-access-registry.ts). */
export const STATIC_REGISTRY: readonly FeatureRegistryEntry[] = [
  ...FEATURE_REGISTRY,
  ...MODULE_REGISTRY,
];

const REGISTRY_BY_KEY: ReadonlyMap<string, FeatureRegistryEntry> = new Map(
  STATIC_REGISTRY.map((e) => [e.key, e]),
);

export function getRegistryEntry(key: string): FeatureRegistryEntry | undefined {
  return REGISTRY_BY_KEY.get(key);
}

export function isKnownFeatureKey(key: string): boolean {
  return REGISTRY_BY_KEY.has(key);
}

/**
 * Optional per-role primary mobile CTA (#2048). The mobile bottom bar has only
 * ~5 slots, so a role's single most-important action (employer → Post a Job,
 * staff → Admin) is surfaced here rather than as a nav rail item. One shared
 * data map (not a per-role `switch` in the component) keeps it DRY; the
 * frontend maps `icon` to a component. Roles with no entry get no CTA slot.
 */
export interface MobileCta {
  labelKey: string;
  label: string;
  href: string;
  icon: string;
}

const POST_JOB_CTA: MobileCta = { labelKey: "labels.postJob", label: "Post Job", href: STUDIO_NEW_JOB_PATH, icon: "PlusSquare" };
const ADMIN_CTA: MobileCta = { labelKey: "labels.admin", label: "Admin", href: "/admin/dashboard", icon: "Shield" };

/** Per-role CTA map under a given persona-switch position (pure, testable).
 *  The hiring "Post Job" CTA exists only while hiring personas are enabled;
 *  otherwise recruiter / employer accounts get no CTA slot (job-seeker bar). */
export function buildMobilePrimaryCta(
  hiringEnabled: boolean,
): Partial<Record<UserRole, MobileCta>> {
  return {
    ...(hiringEnabled
      ? { [USER_ROLES.EMPLOYER]: POST_JOB_CTA, [USER_ROLES.RECRUITER]: POST_JOB_CTA }
      : {}),
    [USER_ROLES.ADMIN]: ADMIN_CTA,
    [USER_ROLES.SUPER_ADMIN]: ADMIN_CTA,
  };
}

export const MOBILE_PRIMARY_CTA: Partial<Record<UserRole, MobileCta>> =
  buildMobilePrimaryCta(HIRING_PERSONAS_ENABLED);

/** Dynamic kinds whose entries are built at runtime from a frontend catalog
 *  (so they aren't in the static shared registry) but are still valid override
 *  targets. Tool surfaces are derived from the tools catalog client-side. */
const DYNAMIC_KEY_PREFIXES = ["tool:"];

/** May an override be stored against this key? True for static registry keys
 *  and for well-formed dynamic keys (e.g. `tool:<id>`). Guards the admin POST
 *  so typos are rejected but client-built tool keys are accepted. */
export function isAssignableFeatureKey(key: string): boolean {
  if (isKnownFeatureKey(key)) return true;
  return DYNAMIC_KEY_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length);
}

/** Minimal gating shape a frontend catalog supplies to register its surfaces. */
export interface ToolGatingInput {
  id: string;
  title: string;
}

/**
 * Build `tool:` registry entries from a catalog. Tool visibility is an
 * OVERRIDE-ONLY hard gate layered on top of the existing audience-chip browse
 * filter, so the default is ALL_ROLES (no role hidden unless a SuperAdmin
 * explicitly hides it) — zero regression, while finally letting
 * creator/affiliate/employee menus be trimmed. enforce=false (cosmetic; tools
 * are client-gated). Built client-side because the catalog lives in the
 * frontend.
 */
export function buildToolRegistryEntries(
  tools: readonly ToolGatingInput[],
  startOrder = 100,
): FeatureRegistryEntry[] {
  return tools.map((t, i) => ({
    key: `tool:${t.id}`,
    kind: "tool",
    group: "AI Tools",
    labelKey: `tools.card.${t.id}.title`,
    label: t.title,
    defaultRoles: ALL_ROLES,
    defaultEnabled: true,
    enforce: false,
    order: startOrder + i,
  }));
}

/** Does this role see the surface by default (before any DB override)? */
export function defaultVisibleForRole(
  entry: FeatureRegistryEntry,
  role: string,
): boolean {
  return (entry.defaultRoles as readonly string[]).includes(role);
}
