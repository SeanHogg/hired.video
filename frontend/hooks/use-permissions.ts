import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
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
  const { personaPreview } = usePersonaPreview();

  // Effective role: impersonation session > persona preview > actual user role
  const effectiveRole = useMemo(() => {
    if (isImpersonating && impersonationSession) return impersonationSession.role;
    if (personaPreview) return personaPreview;
    return user?.role;
  }, [isImpersonating, impersonationSession, personaPreview, user?.role]);

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
    isAffiliate: permissions.isAffiliate,
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
