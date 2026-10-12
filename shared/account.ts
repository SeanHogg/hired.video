import { z } from "zod";
import { USER_ROLES } from "./user-roles.js";
import { EmailSchema, NonEmptyStringSchema, UuidLikeSchema } from "./validation.js";

// SSoT for invite lifecycle. Numeric values are wire-stable — the frontend
// table renders against them directly (badge label / colour / icon lookup).
// Re-exported from `frontend/types/account.ts` so UI code keeps its current
// import path.
export enum InviteStatus {
  Invited = 0,
  Accepted = 1,
  Rejected = 2,
  Resent = 3,
  Expired = 4,
  Owner = 5,
}

// AccountUser DTO — single shape returned by both real user rows and
// pending-invitation rows on `/api/account/users`. The Team Members table
// reads firstName/lastName/inviteStatus/joined-date/rolesAssigned directly,
// so the backend has to project the user record into this richer surface
// (otherwise everything falls through to "Unknown User / Unknown / Pending").
export const AccountUserSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: EmailSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  avatarUrl: z.string().optional(),
  inviteStatus: z.nativeEnum(InviteStatus),
  inviteStatusStartDateTime: z.string().optional(),
  rolesAssigned: z.array(z.string()),
  role: z.nativeEnum(USER_ROLES).optional(),
  isOwner: z.boolean(),
  canDelete: z.boolean(),
  canEditRoles: z.boolean(),
  isActive: z.boolean(),
});
export type AccountUser = z.infer<typeof AccountUserSchema>;

// AccountOption DTO
export const AccountOptionSchema = z.object({
  id: UuidLikeSchema,
  name: NonEmptyStringSchema,
  role: z.nativeEnum(USER_ROLES),
  logoUrl: z.string().url().optional(),
  isOwner: z.boolean(),
  isAdmin: z.boolean(),
});
export type AccountOption = z.infer<typeof AccountOptionSchema>;

// InviteUserRequest DTO
export const InviteUserRequestSchema = z.object({
  email: EmailSchema,
  role: z.nativeEnum(USER_ROLES),
  // Workforce invites (role=employee) carry the inviting employer's
  // companyId so accept-invitation creates a userCompanyRoleAssociations
  // row scoping the new member to that workspace. Optional for the legacy
  // top-level role invites (recruiter / employer) that don't bind to a
  // specific company.
  companyId: UuidLikeSchema.optional(),
  // Owner's explicit yes to paying for an extra seat when the employee invite
  // would push the workspace past its authorized seat limit (gap #1678). The
  // first request omits this; if the server responds requiresSeatConfirmation,
  // the UI re-sends with confirmPaidSeat:true.
  confirmPaidSeat: z.boolean().optional(),
});
export type InviteUserRequest = z.infer<typeof InviteUserRequestSchema>;

// Seat soft-cap info surfaced when an employee invite needs owner confirmation.
export const SeatInfoSchema = z.object({
  committedSeats: z.number().int(),
  seatLimit: z.number().int(),
  pricePerSeatCents: z.number().int(),
});
export type SeatInfo = z.infer<typeof SeatInfoSchema>;

// InviteUserResponse DTO
export const InviteUserResponseSchema = z.object({
  success: z.boolean(),
  message: NonEmptyStringSchema,
  inviteId: z.string(),
  // Set when the invite was NOT sent because it would add a paid seat beyond
  // the authorized limit. The UI shows a confirm dialog using seatInfo, then
  // re-sends with confirmPaidSeat:true (gap #1678).
  requiresSeatConfirmation: z.boolean().optional(),
  seatInfo: SeatInfoSchema.optional(),
});
export type InviteUserResponse = z.infer<typeof InviteUserResponseSchema>;

// InvitationDetailsResponse DTO — the rich shape the public accept page
// (`AcceptInvitation.tsx`) renders. Resolved server-side from the secret
// invite token: knowing the 192-bit token is the bearer credential for
// viewing these details (gap #1673/#1674).
export const InvitationDetailsResponseSchema = z.object({
  invitationId: z.string(),
  companyName: z.string(),
  companyDescription: z.string().optional(),
  companyLogoUrl: z.string().optional(),
  inviterName: z.string(),
  invitedEmail: EmailSchema,
  rolesToAssign: z.array(z.string()),
  invitedAt: z.string(),
  userExists: z.boolean(),
  personalMessage: z.string().optional(),
});
export type InvitationDetailsResponse = z.infer<typeof InvitationDetailsResponseSchema>;

// AcceptInvitationRequest DTO — accept is keyed by the secret token (NOT the
// enumerable invitation id) and requires an authenticated, email-matched
// caller (gap #1674).
export const AcceptInvitationRequestSchema = z.object({
  token: NonEmptyStringSchema,
});
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

// AcceptInvitationResponse DTO
export const AcceptInvitationResponseSchema = z.object({
  success: z.boolean(),
  message: NonEmptyStringSchema,
  companyName: NonEmptyStringSchema,
  assignedRoles: z.array(z.nativeEnum(USER_ROLES)),
  requiredRegistration: z.boolean(),
  redirectUrl: z.string(),
});
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;

// Account settings/analytics DTOs
export const AccountSettingsSchema = z.object({
  locale: z.string().optional(),
  timezone: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  theme: z.enum(["light", "dark"]).optional(),
});
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;

export const AccountAnalyticsSchema = z.object({
  totalUsers: z.number().optional(),
  activeUsers: z.number().optional(),
  totalJobs: z.number().optional(),
  totalResumes: z.number().optional(),
  totalApplications: z.number().optional(),
  userGrowth: z.number().optional(),
  jobGrowth: z.number().optional(),
  applicationGrowth: z.number().optional(),
  invitesSent: z.number().optional(),
  invitesAccepted: z.number().optional(),
  lastActiveAt: z.string().nullable().optional(),
});
export type AccountAnalytics = z.infer<typeof AccountAnalyticsSchema>;

/**
 * Single source of truth for "which roles is this inviter allowed to assign".
 * Used by both the frontend dropdown (to hide unavailable options) and the
 * backend invite handler (to reject hand-crafted POSTs that try to escalate).
 *
 * Accepts the raw role string(s) from the inviter — pass either a single
 * role or the legacy multi-role array. Returns an empty list when the
 * inviter has no recognized authority to invite, which the caller must
 * treat as "deny" (NOT fail-open).
 */
export function getAvailableRolesForInvite(userRoles: string | string[]): string[] {
  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  const lower = roles.map((r) => (r ?? "").toLowerCase());
  if (lower.includes("admin") || lower.includes("super_admin")) {
    return ["recruiter", "employer", "employee"];
  }
  if (lower.includes("employer")) {
    // Employers can invite recruiters + co-employers (existing) AND
    // workforce members (employees) for timesheet / placement tracking.
    // The accept-invitation handler binds employee invites to the
    // inviter's company via userCompanyRoleAssociations.
    return ["recruiter", "employer", "employee"];
  }
  if (lower.includes("recruiter")) {
    return ["recruiter"];
  }
  return [];
}

// Bulk invite request DTO — single canonical shape across service + route +
// frontend (gap #1686). One role per invitee, matching the single-role invite
// model; optional companyId binds employee invites to a workspace.
export const BulkInviteRequestSchema = z.object({
  invites: z.array(z.object({
    email: EmailSchema,
    role: z.nativeEnum(USER_ROLES),
  })).min(1),
  companyId: UuidLikeSchema.optional(),
  // Owner's up-front yes to paying for the paid employee seats this batch adds
  // (gap #1678). When false/omitted, employee rows past the authorized seat
  // limit fail with a seat-confirmation reason rather than charging silently.
  confirmPaidSeat: z.boolean().optional(),
});
export type BulkInviteRequest = z.infer<typeof BulkInviteRequestSchema>;

// Bulk invite response DTO
export const BulkInviteResponseSchema = z.object({
  totalProcessed: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  successfulInvitations: z.array(z.object({ email: EmailSchema })),
  failedInvitations: z.array(z.object({ email: EmailSchema, reason: z.string() })),
  message: z.string(),
});
export type BulkInviteResponse = z.infer<typeof BulkInviteResponseSchema>;
