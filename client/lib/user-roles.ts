/**
 * Shared user role constants and types to avoid circular deps
 * These must match the backend UserRole enum exactly:
 * - JobSeeker (0)
 * - Recruiter (1)
 * - Employer (2)
 */

export const USER_ROLES = {
  JOB_SEEKER: "JobSeeker",
  RECRUITER: "Recruiter",
  EMPLOYER: "Employer",
  // Note: ADMIN is not part of the backend UserRole enum but may be used for frontend-only features
  ADMIN: "Admin",
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

