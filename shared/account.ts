import { z } from "zod";
import { USER_ROLES } from "./user-roles";
import { EmailSchema, NonEmptyStringSchema } from "./validation";

// AccountUser DTO (shared between frontend and backend)
export const AccountUserSchema = z.object({
  id: z.string().uuid(),
  email: EmailSchema,
  name: NonEmptyStringSchema,
  role: z.nativeEnum(USER_ROLES),
  isActive: z.boolean(),
});
export type AccountUser = z.infer<typeof AccountUserSchema>;

// AccountOption DTO
export const AccountOptionSchema = z.object({
  id: z.string().uuid(),
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
});
export type InviteUserRequest = z.infer<typeof InviteUserRequestSchema>;

// InviteUserResponse DTO
export const InviteUserResponseSchema = z.object({
  success: z.boolean(),
  message: NonEmptyStringSchema,
  inviteId: z.string(),
});
export type InviteUserResponse = z.infer<typeof InviteUserResponseSchema>;

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
