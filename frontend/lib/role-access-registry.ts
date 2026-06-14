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
  buildToolRegistryEntries,
  type FeatureRegistryEntry,
} from "@shared/feature-registry";
import { TOOLS_CATALOG } from "@/data/tools-catalog";

let cached: FeatureRegistryEntry[] | null = null;

/** Combined registry (static nav+modules + catalog tools). Memoised — the
 *  catalog is module-constant, so this is built once per session. */
export function getClientFeatureRegistry(): FeatureRegistryEntry[] {
  if (!cached) {
    cached = [
      ...STATIC_REGISTRY,
      ...buildToolRegistryEntries(
        TOOLS_CATALOG.map((t) => ({ id: t.id, title: t.title })),
      ),
    ];
  }
  return cached;
}
