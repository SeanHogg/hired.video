/**
 * Admin CRUD Permission System
 *
 * Defines which roles can Create, Read, Update, Delete each admin resource.
 * Used to gate the Admin Panel sidebar link, individual tab visibility,
 * and action buttons within each admin page.
 */

import { useAuth } from "@/lib/auth";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { USER_ROLES } from "@shared/user-roles";
import { normalizeRole } from "@/lib/role-utils";

export type CrudAction = "create" | "read" | "update" | "delete";

export type AdminResource =
  | "dashboard"
  | "feed"
  | "users"
  | "roles"
  | "jobs"
  | "studio"
  | "billing"
  | "modules"
  | "audit"
  | "toolUsage"
  | "settings";

/** CRUD grants per role per admin resource */
const ADMIN_CRUD: Record<string, Partial<Record<AdminResource, CrudAction[]>>> = {
  [USER_ROLES.SUPER_ADMIN]: {
    dashboard: ["read"],
    feed:      ["create", "read", "update", "delete"],
    users:     ["create", "read", "update", "delete"],
    roles:     ["create", "read", "update", "delete"],
    jobs:      ["create", "read", "update", "delete"],
    studio:    ["create", "read", "update", "delete"],
    billing:   ["create", "read", "update", "delete"],
    modules:   ["create", "read", "update", "delete"],
    audit:     ["read"],
    toolUsage: ["read"],
    settings:  ["read", "update"],
  },
  [USER_ROLES.ADMIN]: {
    dashboard: ["read"],
    feed:      ["create", "read", "update", "delete"],
    users:     ["read"],
    roles:     ["read"],
    jobs:      ["read", "update"],
    studio:    ["read"],
    audit:     ["read"],
    toolUsage: ["read"],
  },
};

export interface AdminPermissions {
  /** True if the user has at least one admin resource with read access */
  hasAnyAccess: boolean;
  /** True if the user can read a specific resource (i.e. tab is visible) */
  canAccess: (resource: AdminResource) => boolean;
  /** True if the user has the specified CRUD action on a resource */
  can: (resource: AdminResource, action: CrudAction) => boolean;
  /** All granted actions for a resource */
  actions: (resource: AdminResource) => CrudAction[];
}

function resolvePermissions(role: string | null | undefined): AdminPermissions {
  // Normalize to canonical snake_case — tolerates legacy PascalCase role
  // values that may still be lingering in DB rows seeded before the
  // snake_case migration (e.g. the seanhogg SA seed in 0001).
  const canonical = role ? normalizeRole(role) : "";
  const grants = ADMIN_CRUD[canonical] ?? {};

  const actions = (resource: AdminResource): CrudAction[] =>
    grants[resource] ?? [];

  const can = (resource: AdminResource, action: CrudAction): boolean =>
    actions(resource).includes(action);

  const canAccess = (resource: AdminResource): boolean =>
    can(resource, "read");

  const hasAnyAccess = Object.keys(grants).some((r) =>
    (grants[r as AdminResource]?.length ?? 0) > 0,
  );

  return { hasAnyAccess, canAccess, can, actions };
}

/** Hook — returns CRUD admin permissions for the currently effective role */
export function useAdminPermissions(): AdminPermissions {
  const { user, impersonationSession } = useAuth();
  const { personaPreview } = usePersonaPreview();

  const effectiveRole =
    impersonationSession?.role ?? personaPreview ?? user?.role ?? null;

  return resolvePermissions(effectiveRole);
}

/** All admin resources in display order */
export const ADMIN_RESOURCES: AdminResource[] = [
  "dashboard",
  "feed",
  "users",
  "roles",
  "jobs",
  "studio",
  "billing",
  "modules",
  "audit",
  "toolUsage",
  "settings",
];

export const CRUD_LABELS: Record<CrudAction, string> = {
  create: "Create",
  read:   "Read",
  update: "Update",
  delete: "Delete",
};

export const RESOURCE_LABELS: Record<AdminResource, string> = {
  dashboard: "Overview",
  feed:      "Feed",
  users:     "Users",
  roles:     "Roles",
  jobs:      "Jobs",
  studio:    "Studio",
  billing:   "Billing",
  modules:   "Modules",
  audit:     "Audit Log",
  toolUsage: "Tool Usage",
  settings:  "Settings",
};
