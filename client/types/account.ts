// Account & Organization Management Types
// Based on UserCompanyRoleAssociationEntity and related backend models

export interface AccountUser {
  id: string;
  userId: string;
  userProfile: UserProfile;
  companyProfile: CompanyProfile;
  inviteStatus: InviteStatus;
  inviteStatusStartDateTime?: string;
  inviteStatusEndDateTime?: string;
  rolesAssigned: MyVideoResumeRole[];
  termsOfUseAgreementAcceptedDateTime?: string;
  termsOfUserAgreementVersion?: string;
  isPaidAccount: boolean;
  isPaidAccountDateTime?: string;
  paidPurchasePrice?: number;
  paidPurchaseDateTime?: string;
  accountUsageType?: AccountUsageType;
  creationDateTime?: string;
  updateDateTime?: string;
  deletedDateTime?: string;
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

export enum MyVideoResumeRole {
  Admin = 0,
  AccountOwner = 10,
  AccountAdmin = 11,
  Employer = 20,
  EmployerManager = 21,
  EmployerEmployee = 22,
  EmployerExecutive = 23,
  JobSeeker = 30,
  Recruiter = 40,
}

export enum AccountUsageType {
  Individual = 0,
  Business = 1,
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
  roles: MyVideoResumeRole[];
  message?: string;
}

export interface InviteUserResponse {
  success: boolean;
  message: string;
  inviteId?: string;
}

export interface UpdateUserRolesRequest {
  userId: string;
  roles: MyVideoResumeRole[];
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
  role: MyVideoResumeRole;
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
  roles: MyVideoResumeRole[];
  message: string;
}

export interface RoleEditFormData {
  userId: string;
  roles: MyVideoResumeRole[];
}

// Utility functions for role management
export const getRoleDisplayName = (role: MyVideoResumeRole): string => {
  switch (role) {
    case MyVideoResumeRole.Admin:
      return "Admin";
    case MyVideoResumeRole.AccountOwner:
      return "Account Owner";
    case MyVideoResumeRole.AccountAdmin:
      return "Account Admin";
    case MyVideoResumeRole.Employer:
      return "Employer";
    case MyVideoResumeRole.EmployerManager:
      return "Employer Manager";
    case MyVideoResumeRole.EmployerEmployee:
      return "Employer Employee";
    case MyVideoResumeRole.EmployerExecutive:
      return "Employer Executive";
    case MyVideoResumeRole.JobSeeker:
      return "Job Seeker";
    case MyVideoResumeRole.Recruiter:
      return "Recruiter";
    default:
      return "Unknown";
  }
};

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

export const canManageUsers = (userRoles: MyVideoResumeRole[]): boolean => {
  return userRoles.some(
    (role) =>
      role === MyVideoResumeRole.AccountOwner ||
      role === MyVideoResumeRole.AccountAdmin ||
      role === MyVideoResumeRole.Admin,
  );
};

export const canInviteUsers = (userRoles: MyVideoResumeRole[]): boolean => {
  return canManageUsers(userRoles);
};

export const canEditRoles = (
  userRoles: MyVideoResumeRole[],
  targetUserRoles: MyVideoResumeRole[],
): boolean => {
  // Account owners can edit anyone except other owners
  if (userRoles.includes(MyVideoResumeRole.AccountOwner)) {
    return !targetUserRoles.includes(MyVideoResumeRole.AccountOwner);
  }

  // Account admins can edit non-admin roles
  if (userRoles.includes(MyVideoResumeRole.AccountAdmin)) {
    return !targetUserRoles.some(
      (role) =>
        role === MyVideoResumeRole.AccountOwner ||
        role === MyVideoResumeRole.AccountAdmin ||
        role === MyVideoResumeRole.Admin,
    );
  }

  return false;
};

export const getAvailableRolesForInvite = (
  userRoles: MyVideoResumeRole[],
): MyVideoResumeRole[] => {
  if (userRoles.includes(MyVideoResumeRole.AccountOwner)) {
    return [
      MyVideoResumeRole.AccountAdmin,
      MyVideoResumeRole.Recruiter,
      MyVideoResumeRole.Employer,
      MyVideoResumeRole.EmployerManager,
      MyVideoResumeRole.EmployerEmployee,
    ];
  }

  if (userRoles.includes(MyVideoResumeRole.AccountAdmin)) {
    return [
      MyVideoResumeRole.Recruiter,
      MyVideoResumeRole.Employer,
      MyVideoResumeRole.EmployerEmployee,
    ];
  }

  return [];
};
