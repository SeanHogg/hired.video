import type { useUserTimezone } from "@/hooks/use-user-timezone";

export interface PlanOverrideInfo {
  active: boolean;
  planSlug: string | null;
  monthlyTokenLimit: number | null;
  expiresAt: string | null;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  originalPlanSlug: string;
  originalPlanName: string;
}

export interface ReferralInfo {
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  referralCode: string;
  referredAt: string;
  converted: boolean;
  convertedAt: string | null;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  isSuperAdmin: boolean;
  isSystem: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  planId: string;
  planName: string;
  isPaid: boolean;
  isUnlimited: boolean;
  monthlyLimit: number | null;
  monthlyUsed: number;
  packBalance: number;
  tokensAvailable: number | null;
  toolRunCount: number;
  toolTokensUsed: number;
  resumeCount: number;
  planOverride: PlanOverrideInfo | null;
  referral: ReferralInfo | null;
}

/** Global counts from /api/admin/sa/users/stats (whole DB, not the visible page). */
export interface UserStats {
  total: number;
  active: number;
  suspended: number;
  inactive: number;
  banned: number;
  admins: number;
  referred: number;
}

export type BulkAction = "ban" | "suspend" | "delete";
export type BulkConfirmAction = "ban" | "delete";
export type UserViewMode = "list" | "grouped";
export type OverrideTokenMode = "default" | "custom" | "unlimited";

/** Per-row handlers the row actions menu fires. */
export interface UserRowHandlers {
  onViewProfile: (user: ApiUser) => void;
  onViewHistory: (user: ApiUser) => void;
  onViewToolHistory: (user: ApiUser) => void;
  onChangeRole: (user: ApiUser, role: string) => void;
  onImpersonate: (user: ApiUser) => void;
  onSendPasswordReset: (user: ApiUser) => void;
  onToggleSystem: (user: ApiUser) => void;
  onHealResumes: (user: ApiUser) => void;
  onGrantTokens: (user: ApiUser) => void;
  onResetTokens: (user: ApiUser) => void;
  onOpenOverride: (user: ApiUser) => void;
  onClearOverride: (user: ApiUser) => void;
  onToggleStatus: (user: ApiUser) => void;
}

/** Permission flags resolved once by the container. */
export interface UserManagementPermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canImpersonate: boolean;
  canManageTokens: boolean;
  isSuperAdmin: boolean;
}

/** Timezone-aware date formatter from useUserTimezone(). */
export type FormatDate = ReturnType<typeof useUserTimezone>["format"];
