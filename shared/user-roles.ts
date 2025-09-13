/**
 * Shared user role constants and types for both client and server
 */

export const USER_ROLES = {
  JOB_SEEKER: "JobSeeker",
  RECRUITER: "Recruiter",
  EMPLOYER: "Employer",
  AFFILIATE: "Affiliate",
  ADMIN: "Admin",
  SUPER_ADMIN: "SuperAdmin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
