/**
 * Shared user role constants and types to avoid circular deps
 */

export const USER_ROLES = {
  JOB_SEEKER: "JobSeeker",
  RECRUITER: "Recruiter",
  EMPLOYER: "Employer",
  BUSINESS: "Business",
  ADMIN: "Admin",
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

