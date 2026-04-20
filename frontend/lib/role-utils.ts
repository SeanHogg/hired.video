/**
 * Centralized Role Utilities
 *
 * This module provides a single source of truth for all role-related functionality
 * across the frontend application. It handles conversion between backend enum values
 * and frontend string representations, provides consistent role display labels,
 * and centralizes role-based permission logic.
 */

import { USER_ROLES, type UserRole } from "@shared/user-roles";

// Backend enum values from hiredvideoRoles
export const BACKEND_ROLE_VALUES = {
  JOB_SEEKER: 30,
  RECRUITER: 40,
  EMPLOYER: 20,
  ADMIN: 0,
  SUPER_ADMIN: -1,
} as const;

// Role display labels - single source of truth
export const ROLE_DISPLAY_LABELS = {
  [USER_ROLES.JOB_SEEKER]: "Job Seeker",
  [USER_ROLES.RECRUITER]: "recruiter",
  [USER_ROLES.EMPLOYER]: "employer",
  [USER_ROLES.ADMIN]: "Administrator",
  [USER_ROLES.SUPER_ADMIN]: "Super Administrator",
  "Unassigned": "Unassigned", // Users without a role or profile
} as const;

// Role descriptions for dropdowns and forms
export const ROLE_DESCRIPTIONS = {
  [USER_ROLES.JOB_SEEKER]: "Looking for job opportunities",
  [USER_ROLES.RECRUITER]: "Recruiting talent for companies",
  [USER_ROLES.EMPLOYER]: "Managing company and hiring",
  [USER_ROLES.ADMIN]: "System administration",
  [USER_ROLES.SUPER_ADMIN]: "Full system control and product management",
  "Unassigned": "Users without a role or profile assigned",
} as const;

// Dashboard type constants - single source of truth
export const DASHBOARD_TYPES = {
  JOB_SEEKER: "jobseeker",
  RECRUITER: "recruiter",
  EMPLOYER: "employer",
  ADMIN: "admin",
  SUPER_ADMIN: "admin", // SuperAdmin uses admin dashboard
  DEFAULT: "default",
} as const;

export type DashboardType =
  (typeof DASHBOARD_TYPES)[keyof typeof DASHBOARD_TYPES];

/**
 * Converts any role value (numeric, string, or mixed) to the standard UserRole format
 * Handles backend enum integers, various string formats, and edge cases
 */
export function normalizeRole(
  role: string | number | undefined | null,
): UserRole {
  if (!role && role !== 0) return USER_ROLES.JOB_SEEKER;

  // Handle numeric role values from hiredvideoRoles enum
  if (typeof role === "number" || !isNaN(Number(role))) {
    const numericRole = Number(role);
    switch (numericRole) {
      case BACKEND_ROLE_VALUES.JOB_SEEKER: // 30
        return USER_ROLES.JOB_SEEKER;
      case BACKEND_ROLE_VALUES.RECRUITER: // 40
        return USER_ROLES.RECRUITER;
      case BACKEND_ROLE_VALUES.EMPLOYER: // 20
        return USER_ROLES.EMPLOYER;
      case 50: // Legacy affiliate enum value — affiliate is now a service, not a role
        return USER_ROLES.EMPLOYER;
      case BACKEND_ROLE_VALUES.ADMIN: // 0
        return USER_ROLES.ADMIN;
      case BACKEND_ROLE_VALUES.SUPER_ADMIN: // -1
        return USER_ROLES.SUPER_ADMIN;
      default:
        return USER_ROLES.JOB_SEEKER;
    }
  }

  // Handle string role values (case-insensitive)
  const roleStr = String(role).toLowerCase().trim();
  switch (roleStr) {
    case "jobseeker":
    case "job_seeker":
    case "job seeker":
      return USER_ROLES.JOB_SEEKER;
    case "recruiter":
      return USER_ROLES.RECRUITER;
    case "employer":
    case "business": // Legacy role, maps to Employer
      return USER_ROLES.EMPLOYER;
    case "affiliate": // Legacy — affiliate is now a service, not a role
      return USER_ROLES.EMPLOYER;
    case "admin":
    case "administrator":
      return USER_ROLES.ADMIN;
    case "superadmin":
    case "super_admin":
    case "super admin":
      return USER_ROLES.SUPER_ADMIN;
    default:
      // Try exact match with USER_ROLES values
      const upperRole = roleStr.toUpperCase();
      if (Object.values(USER_ROLES).includes(roleStr as UserRole)) {
        return roleStr as UserRole;
      }
      if (Object.values(USER_ROLES).includes(upperRole as UserRole)) {
        return upperRole as UserRole;
      }
      return USER_ROLES.JOB_SEEKER;
  }
}

/**
 * Gets the display label for a role
 * Handles any role format and returns consistent display text
 */
export function getRoleDisplayLabel(
  role: string | number | undefined | null,
): string {
  // Handle special case for "Unassigned" string from backend
  if (role === "Unassigned") {
    return ROLE_DISPLAY_LABELS["Unassigned"];
  }

  const normalizedRole = normalizeRole(role);
  return (
    ROLE_DISPLAY_LABELS[normalizedRole] ||
    ROLE_DISPLAY_LABELS[USER_ROLES.JOB_SEEKER]
  );
}

/**
 * Gets the description for a role
 */
export function getRoleDescription(
  role: string | number | undefined | null,
): string {
  const normalizedRole = normalizeRole(role);
  return (
    ROLE_DESCRIPTIONS[normalizedRole] ||
    ROLE_DESCRIPTIONS[USER_ROLES.JOB_SEEKER]
  );
}

/**
 * Converts a role to the format expected by form selects
 * Always returns a valid USER_ROLES constant
 */
export function roleToSelectValue(
  role: string | number | undefined | null,
): UserRole {
  return normalizeRole(role);
}

/**
 * Formats role for display in UI components (badges, labels, etc.)
 * Handles underscores and capitalization
 */
export function formatRoleForDisplay(
  role: string | number | undefined | null,
): string {
  const label = getRoleDisplayLabel(role);
  return label;
}

/**
 * Role-based permission checks
 */
export class RolePermissions {
  private role: UserRole;

  constructor(role: string | number | undefined | null) {
    this.role = normalizeRole(role);
  }

  // Basic role checks
  get isJobSeeker(): boolean {
    return this.role === USER_ROLES.JOB_SEEKER;
  }

  get isRecruiter(): boolean {
    return this.role === USER_ROLES.RECRUITER;
  }

  get isEmployer(): boolean {
    return this.role === USER_ROLES.EMPLOYER;
  }

  get isAdmin(): boolean {
    return this.role === USER_ROLES.ADMIN;
  }

  get isSuperAdmin(): boolean {
    return this.role === USER_ROLES.SUPER_ADMIN;
  }

  // Permission checks
  get canManageJobs(): boolean {
    return this.isRecruiter || this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canViewResumes(): boolean {
    return this.isRecruiter || this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canCreateResume(): boolean {
    return true;
  }

  get canManageAccount(): boolean {
    return this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canManageTeam(): boolean {
    return this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canAccessAnalytics(): boolean {
    return this.isRecruiter || this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canPostJobs(): boolean {
    return this.isRecruiter || this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canEditJobs(): boolean {
    return this.isRecruiter || this.isEmployer || this.isAdmin || this.isSuperAdmin;
  }

  get canDeleteJobs(): boolean {
    return this.isEmployer || this.isAdmin || this.isSuperAdmin; // More restrictive
  }

  // Dashboard access
  get dashboardType(): DashboardType {
    if (this.isSuperAdmin || this.isAdmin) return DASHBOARD_TYPES.ADMIN;
    if (this.isEmployer) return DASHBOARD_TYPES.EMPLOYER;
    if (this.isRecruiter) return DASHBOARD_TYPES.RECRUITER;
    if (this.isJobSeeker) return DASHBOARD_TYPES.JOB_SEEKER;
    return DASHBOARD_TYPES.DEFAULT;
  }
}

/**
 * Convenience function to create RolePermissions instance
 */
export function createRolePermissions(
  role: string | number | undefined | null,
): RolePermissions {
  return new RolePermissions(role);
}

/**
 * Quick permission checks without creating class instance
 */
export const roleUtils = {
  isJobSeeker: (role: string | number | undefined | null): boolean =>
    normalizeRole(role) === USER_ROLES.JOB_SEEKER,

  isRecruiter: (role: string | number | undefined | null): boolean =>
    normalizeRole(role) === USER_ROLES.RECRUITER,

  isEmployer: (role: string | number | undefined | null): boolean => {
    const normalized = normalizeRole(role);
    return normalized === USER_ROLES.EMPLOYER;
  },

  isAdmin: (role: string | number | undefined | null): boolean =>
    normalizeRole(role) === USER_ROLES.ADMIN,

  isSuperAdmin: (role: string | number | undefined | null): boolean =>
    normalizeRole(role) === USER_ROLES.SUPER_ADMIN,

  canManageJobs: (role: string | number | undefined | null): boolean => {
    const permissions = new RolePermissions(role);
    return permissions.canManageJobs;
  },

  canViewResumes: (role: string | number | undefined | null): boolean => {
    const permissions = new RolePermissions(role);
    return permissions.canViewResumes;
  },

  getDashboardType: (
    role: string | number | undefined | null,
  ): DashboardType => {
    const permissions = new RolePermissions(role);
    return permissions.dashboardType;
  },
};

/**
 * Role validation
 */
export function isValidRole(role: string | number | undefined | null): boolean {
  if (!role && role !== 0) return false;

  try {
    const normalized = normalizeRole(role);
    return Object.values(USER_ROLES).includes(normalized);
  } catch {
    return false;
  }
}

/**
 * Get all available roles for dropdowns/selects
 */
export function getAvailableRoles(): Array<{
  value: UserRole;
  label: string;
  description: string;
}> {
  return [
    {
      value: USER_ROLES.JOB_SEEKER,
      label: ROLE_DISPLAY_LABELS[USER_ROLES.JOB_SEEKER],
      description: ROLE_DESCRIPTIONS[USER_ROLES.JOB_SEEKER],
    },
    {
      value: USER_ROLES.RECRUITER,
      label: ROLE_DISPLAY_LABELS[USER_ROLES.RECRUITER],
      description: ROLE_DESCRIPTIONS[USER_ROLES.RECRUITER],
    },
    {
      value: USER_ROLES.EMPLOYER,
      label: ROLE_DISPLAY_LABELS[USER_ROLES.EMPLOYER],
      description: ROLE_DESCRIPTIONS[USER_ROLES.EMPLOYER],
    },
  ];
}
