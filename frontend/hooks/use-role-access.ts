/**
 * useRoleAccess — the single seam every menu / feature gate self-consumes to
 * decide what the current (or SuperAdmin-previewed) role sees. Replaces the
 * hardcoded Sidebar `hideForRoles` deny-list (#1995/#2037).
 *
 * Keyed on useEffectiveRole, so it respects SuperAdmin impersonation AND the
 * persona-preview "Preview as role" lever automatically — flipping the preview
 * re-resolves the whole app's menu/features for that role.
 *
 * Fail-open: while loading, or if the manifest endpoint is unreachable, it
 * falls back to the registry defaults for the role (resolveRoleAccess(role, []))
 * so a backend hiccup can never empty the navigation.
 *
 * Permission-debugger integration: when the debugger overlay is on
 * (Ctrl+Shift+P), every surface is registered as a granted/denied check with
 * its source (role default vs override) — so a SuperAdmin can validate exactly
 * what each role can see, live, by previewing the role and reading the panel.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiReady, useAuth } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { usePermissionDebugger } from "@/providers/PermissionDebuggerProvider";
import { roleAccessService } from "@/lib/services/role-access-service";
import { getClientFeatureRegistry } from "@/lib/role-access-registry";
import {
  resolveRoleAccess,
  navSurfaces,
  findSurface,
  isManageableRole,
  toolFeatureKey,
  type RoleAccessManifest,
  type ResolvedSurface,
} from "@shared/role-access";
import { USER_ROLES, type UserRole } from "@shared/user-roles";

export interface UseRoleAccess {
  /** The role the manifest was resolved for (effective role, or job_seeker). */
  role: UserRole;
  loading: boolean;
  manifest: RoleAccessManifest;
  /** Is a surface visible for this role? Fail-open (unknown key → true). */
  canSee: (key: string) => boolean;
  /** Is a surface enabled (enforced features)? Fail-open (unknown key → true). */
  isEnabled: (key: string) => boolean;
  /** Visible nav surfaces, sorted by per-role rank. */
  navItems: () => ResolvedSurface[];
  /** Is a catalog tool visible for this role? Convenience over canSee. */
  canSeeTool: (toolId: string) => boolean;
}

export function useRoleAccess(): UseRoleAccess {
  const { user } = useAuth();
  const apiReady = useApiReady();
  const effectiveRole = useEffectiveRole();
  const role: UserRole = isManageableRole(effectiveRole)
    ? effectiveRole
    : USER_ROLES.JOB_SEEKER;

  const { data, isLoading } = useQuery({
    // Viewer-scoped (impersonation-safe) + role-scoped (Preview-as-role).
    // /api/bootstrap seeds the viewer's own role entry.
    queryKey: queryKeys.roleAccess.byRole(user?.id, role),
    queryFn: () => roleAccessService.getMine(role),
    staleTime: 5 * 60 * 1000,
    enabled: apiReady,
  });

  // Resolve the role's overrides against the combined client registry (shared
  // nav surfaces + tool surfaces from the catalog) with the shared resolver.
  // Fail-open: no data (loading / endpoint down) → empty overrides → registry
  // defaults, so the menu never empties.
  const manifest = useMemo<RoleAccessManifest>(
    () => resolveRoleAccess(role, data?.overrides ?? [], getClientFeatureRegistry()),
    [data, role],
  );

  // Feed the permission debugger so a SuperAdmin can validate each role's
  // surface visibility live (pair with Preview-as-role).
  const { debugMode, registerCheck } = usePermissionDebugger();
  useEffect(() => {
    if (!debugMode) return;
    for (const s of manifest.surfaces) {
      registerCheck(s.key, s.visible ? "granted" : "denied", {
        source: s.overridden ? "override" : "role",
        currentRole: role,
        elementLabel: s.label,
      });
    }
  }, [debugMode, manifest, role, registerCheck]);

  return useMemo(
    () => ({
      role,
      loading: isLoading,
      manifest,
      canSee: (key: string) => findSurface(manifest, key)?.visible ?? true,
      isEnabled: (key: string) => findSurface(manifest, key)?.enabled ?? true,
      navItems: () => navSurfaces(manifest),
      canSeeTool: (toolId: string) => findSurface(manifest, toolFeatureKey(toolId))?.visible ?? true,
    }),
    [role, isLoading, manifest],
  );
}
