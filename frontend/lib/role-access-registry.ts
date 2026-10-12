/**
 * Client feature registry — the shared static registry (nav / modules) plus
 * the `tool:` surfaces derived at runtime from the frontend tools catalog
 * (which can't live in shared/, since it carries React icon components).
 *
 * This is what `useRoleAccess` and the `/admin/role-access` page resolve
 * against, via the SAME shared `resolveRoleAccess` the server uses — so tools
 * and nav are gated by one mechanism with no drift.
 */
import {
  STATIC_REGISTRY,
  ALL_ROLES,
  buildToolRegistryEntries,
  type FeatureRegistryEntry,
} from "@shared/feature-registry";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { ADMIN_RESOURCES, RESOURCE_LABELS } from "@/lib/admin-permissions";

/** `admin_tab:` surfaces, one per admin resource. Override-only hard gate
 *  layered on top of the admin CRUD matrix (admin-permissions.ts) — defaults
 *  ALL_ROLES so nothing changes until a SuperAdmin hides a tab for a role
 *  (#2040). Built client-side because the resource list + labels live here. */
function buildAdminTabEntries(): FeatureRegistryEntry[] {
  return ADMIN_RESOURCES.map((r, i) => ({
    key: `admin_tab:${r}`,
    kind: "admin_tab" as const,
    group: "Admin",
    labelKey: `admin.tab.${r}`,
    label: RESOURCE_LABELS[r],
    defaultRoles: ALL_ROLES,
    defaultEnabled: true,
    enforce: false,
    order: 300 + i,
  }));
}

let cached: FeatureRegistryEntry[] | null = null;

/** Combined registry (static nav+modules + catalog tools + admin tabs).
 *  Memoised — all inputs are module-constant, so this is built once per
 *  session. */
export function getClientFeatureRegistry(): FeatureRegistryEntry[] {
  if (!cached) {
    cached = [
      ...STATIC_REGISTRY,
      ...buildToolRegistryEntries(
        TOOLS_CATALOG.map((t) => ({ id: t.id, title: t.title })),
      ),
      ...buildAdminTabEntries(),
    ];
  }
  return cached;
}
