// Account & Organization Management Types
// Based on UserCompanyRoleAssociationEntity and related backend models

export interface AccountUser {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string;
  headline?: string;
  currentRole?: string;
  currentCompany?: string;
  location?: string;
  inviteStatus: InviteStatus;
  inviteStatusStartDateTime?: string;
  inviteStatusEndDateTime?: string;
  rolesAssigned: string[];
  isPaidAccount: boolean;
  isPaidAccountDateTime?: string;
  accountUsageType?: AccountUsageType;
  creationDateTime?: string;
  updateDateTime?: string;
  lastLoginAt?: string;
  isOwner: boolean;
  canDelete: boolean;
  canEditRoles: boolean;
  isActive: boolean;
}

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

// Enums matching backend
export enum InviteStatus {
  Invited = 0,
  Accepted = 1,
  Rejected = 2,
  Resent = 3,
  Expired = 4,
  Owner = 5,
}

export enum hiredvideoRole {
  Admin = "Admin",
  JobSeeker = "JobSeeker",
  Recruiter = "Recruiter",
  Employer = "Employer",
}

export enum AccountUsageType {
  Individual = 0,
  Employer = 1,
  Employee = 2,
}

export enum ProfileStatus {
  NoStatus = 0,
  OpenToWork = 1,
  Hiring = 2,
}

// Request/Response DTOs
export interface InviteUserRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  message?: string;
}

export interface InviteUserResponse {
  success: boolean;
  message: string;
  inviteId?: string;
}

export interface AcceptInvitationResponse {
  success: boolean;
  message: string;
  companyName: string;
  assignedRoles: string[];
  requiredRegistration: boolean;
  redirectUrl?: string;
}

export interface InvitationDetailsResponse {
  invitationId: string;
  companyName: string;
  companyDescription?: string;
  companyLogoUrl?: string;
  inviterName: string;
  invitedEmail: string;
  rolesToAssign: string[];
  invitedAt: string;
  userExists: boolean;
  personalMessage?: string;
}

export interface BulkInviteUsersRequest {
  users: BulkInviteUserItem[];
  defaultRoles: string[];
  defaultMessage?: string;
}

export interface BulkInviteUserItem {
  email: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  message?: string;
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

export interface AccountOption {
  id: string;
  name: string;
  role: string;
  logoUrl?: string;
  isOwner: boolean;
  isAdmin: boolean;
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

export const canManageUsers = (userRoles: string[]): boolean => {
  return userRoles.some((role) => role === "Admin" || role === "Employer");
};

export const canInviteUsers = (userRoles: string[]): boolean => {
  return canManageUsers(userRoles);
};

export const canEditRoles = (
  userRoles: string[],
  targetUserRoles: string[],
): boolean => {
  // Admins can edit anyone except other admins
  if (userRoles.includes("Admin")) {
    return !targetUserRoles.includes("Admin");
  }

  // Employer users can edit non-admin roles
  if (userRoles.includes("Employer")) {
    return !targetUserRoles.some((role) => role === "Admin");
  }

  return false;
};

export const getAvailableRolesForInvite = (userRoles: string[]): string[] => {
  if (userRoles.includes("Admin")) {
    return ["Recruiter", "Employer", "JobSeeker"];
  }

  if (userRoles.includes("Employer")) {
    return ["Recruiter", "JobSeeker"];
  }

  return [];
};
