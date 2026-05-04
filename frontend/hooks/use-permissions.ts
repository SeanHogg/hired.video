import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import {
  createRolePermissions,
  normalizeRole,
  getRoleDisplayLabel,
} from "@/lib/role-utils";
import { USER_ROLES } from "@shared/user-roles";

/**
 * Enhanced permissions hook using centralized role utilities.
 * Respects the active impersonation session role and persona preview mode.
 */
export function usePermissions() {
  const { user, isSuperAdmin, isImpersonating, impersonationSession } = useAuth();
  const effectiveRole = useEffectiveRole();
  const permissions = useMemo(() => createRolePermissions(effectiveRole), [effectiveRole]);
  const normalizedRole = useMemo(() => normalizeRole(effectiveRole), [effectiveRole]);
  const roleDisplayLabel = useMemo(() => getRoleDisplayLabel(effectiveRole), [effectiveRole]);

  return {
    // Raw role data
    userRole: normalizedRole,
    effectiveRole: normalizedRole,
    roleDisplayLabel,

    // Role type checks (based on effective role)
    isAdmin: permissions.isAdmin,
    isEmployer: permissions.isEmployer,
    isRecruiter: permissions.isRecruiter,
    isJobSeeker: permissions.isJobSeeker,
    isSuperAdmin: isSuperAdmin,

    // Impersonation state
    isImpersonating,
    isPersonaPreview: !isImpersonating && personaPreview !== null,

    // Permission checks
    canManageAccount: permissions.canManageAccount,
    canManageJobs: permissions.canManageJobs,
    canViewResumes: permissions.canViewResumes,
    canCreateResume: permissions.canCreateResume,
    canManageTeam: permissions.canManageTeam,
    canAccessAnalytics: permissions.canAccessAnalytics,
    canPostJobs: permissions.canPostJobs,
    canEditJobs: permissions.canEditJobs,
    canDeleteJobs: permissions.canDeleteJobs,

    // Dashboard type
    dashboardType: permissions.dashboardType,

    // Full permissions object for advanced use cases
    permissions,
  };
}
