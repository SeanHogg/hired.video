// Account & Organization Management Types
// Based on UserCompanyRoleAssociationEntity and related backend models

import { InviteStatus } from "../../shared/account";
import type { AccountUser, AccountOption } from "../../shared/account";

// Wire DTOs — SSoT in shared/account.ts.
export type { AccountUser, AccountOption, AcceptInvitationResponse } from "../../shared/account";

export interface UserProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
  headline?: string;
  currentRole?: string;
  currentCompany?: string;
  location?: string;
  profileStatus?: ProfileStatus;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  industry?: string;
  size?: string;
  logoUrl?: string;
  website?: string;
  location?: string;
  status?: string;
  visibility?: string;
  createdAt?: string;
  updatedAt?: string;
  userId: string;
}

// InviteStatus is the SSoT in shared/account.ts — re-exported here so
// existing UI imports (`@/types/account`) keep working without a churn.
export { InviteStatus } from "../../shared/account";

export enum hiredvideoRole {
  Admin = "admin",
  JobSeeker = "job_seeker",
  Recruiter = "recruiter",
  Employer = "employer",
}


export enum ProfileStatus {
  NoStatus = 0,
  OpenToWork = 1,
  Hiring = 2,
}

// Request/Response DTOs — SSoT in shared/account.ts so the modal, service,
// and backend agree on the single-role invite shape + the seat-confirmation
// fields (gaps #1673/#1678). Previously this declared `roles: string[]` which
// no backend accepts.
export type { InviteUserRequest, InviteUserResponse, SeatInfo } from "../../shared/account";


// SSoT lives in shared/account.ts so the backend by-token details endpoint
// builds to the exact same shape the accept page renders (gap #1673).
export type { InvitationDetailsResponse } from "../../shared/account";

// Canonical request shape lives in shared/account.ts (gap #1686) so the
// service + route + this modal can't drift. `BulkInviteUserItem` stays a
// UI-only row type for the editable grid (names are collected for display
// but the single-role invite model only sends email + role).
export type { BulkInviteRequest } from "../../shared/account";

export interface BulkInviteUserItem {
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface BulkInviteUsersResponse {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  successfulInvitations: BulkInviteResult[];
  failedInvitations: BulkInviteResult[];
  message: string;
}

export interface BulkInviteResult {
  email: string;
  success: boolean;
  message: string;
  invitationId?: string;
}

export interface UpdateUserRolesRequest {
  userId: string;
  roles: string[];
}

export interface AccountUsersResponse {
  result: AccountUser[];
  errorMessage?: string;
  errorCode?: string;
}

export interface AccountSwitchContext {
  currentAccountId?: string;
  availableAccounts: AccountOption[];
}


// UI State interfaces
export interface AccountManagementState {
  users: AccountUser[];
  loading: boolean;
  error?: string;
  selectedUser?: AccountUser;
  inviteModalOpen: boolean;
  editRolesModalOpen: boolean;
}

export interface InviteFormData {
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  message: string;
}

export interface RoleEditFormData {
  userId: string;
  roles: string[];
}

// Note: getRoleDisplayName has been moved to @/lib/role-utils.ts for centralized role management
// Import { getRoleDisplayLabel } from "@/lib/role-utils" instead

export const getInviteStatusDisplayName = (status: InviteStatus): string => {
  switch (status) {
    case InviteStatus.Invited:
      return "Invited";
    case InviteStatus.Accepted:
      return "Accepted";
    case InviteStatus.Rejected:
      return "Rejected";
    case InviteStatus.Resent:
      return "Resent";
    case InviteStatus.Expired:
      return "Expired";
    case InviteStatus.Owner:
      return "Owner";
    default:
      return "Unknown";
  }
};

export const getInviteStatusColor = (status: InviteStatus): string => {
  switch (status) {
    case InviteStatus.Invited:
      return "text-yellow-600 bg-yellow-50";
    case InviteStatus.Accepted:
      return "text-green-600 bg-green-50";
    case InviteStatus.Rejected:
      return "text-red-600 bg-red-50";
    case InviteStatus.Resent:
      return "text-blue-600 bg-blue-50";
    case InviteStatus.Expired:
      return "text-gray-600 bg-gray-50";
    case InviteStatus.Owner:
      return "text-purple-600 bg-purple-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

// SSoT lives in shared/account.ts so the backend invite handler can enforce
// the same allowed-roles list. Re-exported here so existing UI imports
// (`@/types/account`) keep working without churn.
export { getAvailableRolesForInvite } from "../../shared/account";
