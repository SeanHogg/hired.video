import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
  createRolePermissions,
  normalizeRole,
  getRoleDisplayLabel,
} from "@/lib/role-utils";

/**
 * Enhanced permissions hook using centralized role utilities
 * Provides consistent role checking and permissions across the application
 */
export function usePermissions() {
  const { user } = useAuth();

  // Create permissions instance with memoization for performance
  const permissions = useMemo(() => {
    return createRolePermissions(user?.role);
  }, [user?.role]);

  // Normalized role value
  const normalizedRole = useMemo(() => {
    return normalizeRole(user?.role);
  }, [user?.role]);

  // Role display label
  const roleDisplayLabel = useMemo(() => {
    return getRoleDisplayLabel(user?.role);
  }, [user?.role]);

  return {
    // Raw role data
    userRole: normalizedRole,
    roleDisplayLabel,

    // Role type checks
    isAdmin: permissions.isAdmin,
    isEmployer: permissions.isEmployer,
    isRecruiter: permissions.isRecruiter,
    isJobSeeker: permissions.isJobSeeker,

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
