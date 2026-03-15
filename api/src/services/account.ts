// Note: avoid depending on frontend type definitions in backend.
// These are simple stubbed types used for migration compatibility.

export type AccountUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

export type AccountOption = {
  id: string;
  name: string;
  role: string;
  logoUrl: string;
  isOwner: boolean;
  isAdmin: boolean;
};

export type AcceptInvitationResponse = {
  success: boolean;
  message: string;
  companyName: string;
  assignedRoles: string[];
  requiredRegistration: boolean;
  redirectUrl: string;
};

export type InviteUserRequest = {
  email: string;
  role: string;
};

export type InviteUserResponse = {
  success: boolean;
  message: string;
  inviteId: string;
};

// NOTE: These are stub implementations to keep the API running while the real
// domain layer is being migrated from the legacy .NET backend.

export async function listAccountUsers(): Promise<AccountUser[]> {
  // TODO: Replace with real DB query / domain service.
  return [];
}

export async function inviteAccountUser(
  request: InviteUserRequest,
): Promise<InviteUserResponse> {
  // TODO: Emit email, save invite, etc.
  return {
    success: true,
    message: "Invitation sent",
    inviteId: "stub-invite-id",
  };
}

export async function updateAccountRoles(): Promise<void> {
  // TODO: Persist role changes
}

export async function removeAccountUser(userId: string): Promise<void> {
  // TODO: Remove user from account
}

export async function getAvailableAccounts(): Promise<AccountOption[]> {
  return [
    {
      id: "default",
      name: "Default Account",
      role: "Admin",
      logoUrl: "",
      isOwner: true,
      isAdmin: true,
    },
  ];
}

export async function switchAccount(accountId: string): Promise<void> {
  // TODO: Change context for current user session
}

export async function getInvitationDetails(
  invitationId: string,
): Promise<AcceptInvitationResponse> {
  return {
    success: true,
    message: "Invitation found",
    companyName: "Example Co",
    assignedRoles: ["JobSeeker"],
    requiredRegistration: true,
    redirectUrl: "/signup",
  };
}

export async function acceptInvitation(
  invitationId: string,
): Promise<AcceptInvitationResponse> {
  return {
    success: true,
    message: "Invitation accepted",
    companyName: "Example Co",
    assignedRoles: ["JobSeeker"],
    requiredRegistration: true,
    redirectUrl: "/signup",
  };
}

export async function listPendingInvitations(): Promise<AccountUser[]> {
  return [];
}

export async function getAccountSettings(): Promise<Record<string, unknown>> {
  return {};
}

export async function updateAccountSettings(
  settings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return settings;
}

export async function getAccountAnalytics(): Promise<Record<string, unknown>> {
  return {};
}

export async function bulkInviteUsers(
  payload: unknown,
): Promise<{
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  successfulInvitations: unknown[];
  failedInvitations: unknown[];
  message: string;
}> {
  return {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    successfulInvitations: [],
    failedInvitations: [],
    message: "Not implemented",
  };
}

export async function resendInvitation(invitationId: string): Promise<void> {
  // TODO: re-send email
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  // TODO: cancel invitation
}

export async function getInvitationAnalytics(): Promise<Record<string, unknown>> {
  return {};
}

export async function deleteAccount(): Promise<void> {
  // TODO: delete account and associated data
}
