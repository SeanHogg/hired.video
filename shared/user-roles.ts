/**
 * Shared user role constants and types for both client and server.
 *
 * Values are lower_snake — the canonical form stored in
 * `users.role` and expected by the JWT `roles` claim. Historical
 * PascalCase values ("JobSeeker", "Recruiter", …) have been retired;
 * the register endpoint no longer normalises them, so both sides of
 * the wire agree on one form.
 *
 * Note: affiliate is NOT in this enum. Affiliate status is a service
 * a user opts into via `enableAffiliate: true` at signup or via the
 * affiliate-program page later. An affiliate's underlying role can be
 * any of the four values below.
 */

export const USER_ROLES = {
  JOB_SEEKER: "job_seeker",
  RECRUITER: "recruiter",
  EMPLOYER: "employer",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
