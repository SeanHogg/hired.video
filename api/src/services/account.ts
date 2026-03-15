
import {
  AccountAnalytics,
  AccountOption,
  AccountSettings,
  AccountUser,
  AcceptInvitationResponse,
  BulkInviteResponse,
  InviteUserRequest,
  InviteUserResponse,
} from "../../../shared/account.js";
// NOTE: These are stub implementations to keep the API running while the real
// domain layer is being migrated from the legacy .NET backend.

export async function listAccountUsers(): Promise<AccountUser[]> {
  // TODO: Replace with real DB query / domain service.
  // Example: Fetch from DB, map to AccountUser[]
  // return await db.accountUsers.findMany();
  return [
    {
      id: "00000000-0000-0000-0000-000000000001",
      email: "alice@example.com",
      name: "Alice Example",
      role: "Admin",
      isActive: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      email: "bob@example.com",
      name: "Bob Example",
      role: "JobSeeker",
      isActive: true,
    },
  ];
}

export async function inviteAccountUser(
  request: InviteUserRequest,
): Promise<InviteUserResponse> {
  // Validate input using shared schema
  // InviteUserRequestSchema.parse(request); // Uncomment for runtime validation
  // TODO: Emit email, save invite, etc.
  return {
    success: true,
    message: `Invitation sent to ${request.email}`,
    inviteId: "inv-" + Math.random().toString(36).slice(2, 10),
  };
}

export async function updateAccountRoles(): Promise<void> {
  // TODO: Persist role changes
}

export async function removeAccountUser(userId: string): Promise<void> {
  // TODO: Remove user from account
}

export async function getAvailableAccounts(): Promise<AccountOption[]> {
  // TODO: Replace with real DB query
  return [
    {
      id: "00000000-0000-0000-0000-000000000010",
      name: "Default Account",
      role: "Admin",
      logoUrl: "https://example.com/logo.png",
      isOwner: true,
      isAdmin: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000011",
      name: "Secondary Account",
      role: "JobSeeker",
      logoUrl: "https://example.com/logo2.png",
      isOwner: false,
      isAdmin: false,
    },
  ];
}

export async function switchAccount(accountId: string): Promise<void> {
  // TODO: Change context for current user session
}


export async function getInvitationDetails(
  invitationId: string,
): Promise<AcceptInvitationResponse> {
  // TODO: Fetch invitation from DB
  return {
    success: true,
    message: "Invitation found",
    companyName: "Acme Corp",
    assignedRoles: ["JobSeeker"],
    requiredRegistration: true,
    redirectUrl: `/signup?invite=${invitationId}`,
  };
}


export async function acceptInvitation(
  invitationId: string,
): Promise<AcceptInvitationResponse> {
  // TODO: Mark invitation as accepted in DB
  return {
    success: true,
    message: "Invitation accepted",
    companyName: "Acme Corp",
    assignedRoles: ["JobSeeker"],
    requiredRegistration: false,
    redirectUrl: `/dashboard`,
  };
}

export async function listPendingInvitations(): Promise<AccountUser[]> {
  // TODO: Fetch pending invitations from DB
  return [
    {
      id: "00000000-0000-0000-0000-000000000100",
      email: "pending1@example.com",
      name: "Pending User 1",
      role: "JobSeeker",
      isActive: false,
    },
    {
      id: "00000000-0000-0000-0000-000000000101",
      email: "pending2@example.com",
      name: "Pending User 2",
      role: "Recruiter",
      isActive: false,
    },
  ];
}

export async function getAccountSettings(): Promise<AccountSettings> {
  // TODO: Load settings from DB or user profile
  return {
    locale: "en-US",
    timezone: "America/Los_Angeles",
    emailNotifications: true,
    theme: "light",
  };
}

export async function updateAccountSettings(
  settings: AccountSettings,
): Promise<AccountSettings> {
  // TODO: Persist settings to DB
  return settings;
}

export async function getAccountAnalytics(): Promise<AccountAnalytics> {
  // TODO: Calculate analytics from activity data
  return {
    activeUsers: 12,
    invitesSent: 3,
    invitesAccepted: 2,
    lastActiveAt: new Date().toISOString(),
  };
}

export async function bulkInviteUsers(
  payload: unknown,
): Promise<BulkInviteResponse> {
  // TODO: Parse payload and issue invitations
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
