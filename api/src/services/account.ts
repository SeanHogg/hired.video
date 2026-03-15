
import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
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

const { users, accountPreferences, accountInvitations } = schema;

function normalizeUser(row: typeof users.$inferSelect): AccountUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as any,
    isActive: row.isActive,
  };
}

export async function listAccountUsers(currentUserId: string, currentUserRole: string): Promise<AccountUser[]> {
  const db = getDb();
  // Admins see all users, others see themselves only
  if (currentUserRole?.toLowerCase() === "admin") {
    const rows = await db.select().from(users).orderBy(desc(users.createdAt));
    return rows.map(normalizeUser);
  }
  const [row] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  return row ? [normalizeUser(row)] : [];
}

export async function inviteAccountUser(request: InviteUserRequest, invitedByUserId: string): Promise<InviteUserResponse> {
  const db = getDb();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const [row] = await db
    .insert(accountInvitations)
    .values({
      email: request.email,
      role: request.role as string,
      token,
      invitedBy: invitedByUserId,
      status: "pending",
    } as any)
    .returning();
  return {
    success: true,
    message: `Invitation sent to ${request.email}`,
    inviteId: row?.id ?? token,
  };
}

export async function updateAccountRoles(currentUserId: string, targetUserId: string, role: string): Promise<void> {
  const db = getDb();
  // Only allow role changes if current user is admin.
  const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  if (!currentUser || currentUser.role.toLowerCase() !== "admin") return;
  await db.update(users).set({ role } as any).where(eq(users.id, targetUserId));
}

export async function removeAccountUser(currentUserId: string, userId: string): Promise<void> {
  const db = getDb();
  const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  if (!currentUser || currentUser.role.toLowerCase() !== "admin") return;
  await db.update(users).set({ isActive: false } as any).where(eq(users.id, userId));
}

export async function getAvailableAccounts(currentUserId: string, currentUserRole: string): Promise<AccountOption[]> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  if (!user) return [];
  return [
    {
      id: user.id,
      name: user.name,
      role: user.role as any,
      logoUrl: undefined,
      isOwner: currentUserRole.toLowerCase() === "admin",
      isAdmin: currentUserRole.toLowerCase() === "admin",
    },
  ];
}

export async function switchAccount(currentUserId: string, accountId: string): Promise<void> {
  // For now, this is a no-op since we don’t have an account model.
  // In future, this could set a session value or cookie to switch context.
}

export async function getInvitationDetails(invitationId: string): Promise<AcceptInvitationResponse> {
  const db = getDb();
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, invitationId)).limit(1);
  if (!invite) {
    return {
      success: false,
      message: "Invitation not found",
      companyName: "",
      assignedRoles: [],
      requiredRegistration: false,
      redirectUrl: "",
    };
  }
  return {
    success: true,
    message: "Invitation found",
    companyName: "Your Organization",
    assignedRoles: [invite.role as any],
    requiredRegistration: true,
    redirectUrl: `/signup?invite=${invite.id}`,
  };
}

export async function acceptInvitation(invitationId: string): Promise<AcceptInvitationResponse> {
  const db = getDb();
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, invitationId)).limit(1);
  if (!invite) {
    return {
      success: false,
      message: "Invitation not found",
      companyName: "",
      assignedRoles: [],
      requiredRegistration: false,
      redirectUrl: "",
    };
  }

  await db
    .update(accountInvitations)
    .set({ status: "accepted", acceptedAt: new Date() } as any)
    .where(eq(accountInvitations.id, invitationId));

  const [existing] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
  if (existing) {
    await db.update(users).set({ role: invite.role as any, isActive: true } as any).where(eq(users.id, existing.id));
  } else {
    const passwordHash = ""; // no password set; user should reset
    const now = new Date();
    await db.insert(users).values({
      email: invite.email,
      name: "",
      passwordHash,
      role: invite.role as any,
      isActive: true,
      emailVerified: false,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    } as any);
  }

  return {
    success: true,
    message: "Invitation accepted",
    companyName: "Your Organization",
    assignedRoles: [invite.role as any],
    requiredRegistration: false,
    redirectUrl: `/dashboard`,
  };
}

export async function listPendingInvitations(currentUserId: string): Promise<AccountUser[]> {
  const db = getDb();
  const invites = await db
    .select()
    .from(accountInvitations)
    .where(eq(accountInvitations.status, "pending"))
    .orderBy(desc(accountInvitations.createdAt))
    .limit(100);

  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    name: "",
    role: invite.role as any,
    isActive: false,
  }));
}

export async function getAccountSettings(userId: string): Promise<AccountSettings> {
  const db = getDb();
  const [prefs] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1);
  return {
    locale: undefined,
    timezone: undefined,
    emailNotifications: prefs?.emailNotificationsEnabled ?? true,
    theme: prefs?.theme === "dark" ? "dark" : "light",
  };
}

export async function updateAccountSettings(userId: string, settings: AccountSettings): Promise<AccountSettings> {
  const db = getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (settings.emailNotifications !== undefined) updates.emailNotificationsEnabled = settings.emailNotifications;
  if (settings.theme) updates.theme = settings.theme;
  await db
    .insert(accountPreferences)
    .values({ userId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates });
  return await getAccountSettings(userId);
}

export async function getAccountAnalytics(userId: string, userRole: string): Promise<AccountAnalytics> {
  const db = getDb();
  const [activeUsersRow] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.isActive, true));
  const [invitesSentRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations);
  const [invitesAcceptedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations).where(eq(accountInvitations.status, "accepted"));
  const [lastActiveRow] = await db
    .select({ lastActiveAt: sql<string>`max(${users.lastLoginAt})` })
    .from(users);
  return {
    activeUsers: Number(activeUsersRow?.count ?? 0),
    invitesSent: Number(invitesSentRow?.count ?? 0),
    invitesAccepted: Number(invitesAcceptedRow?.count ?? 0),
    lastActiveAt: lastActiveRow?.lastActiveAt ?? new Date().toISOString(),
  };
}

export async function bulkInviteUsers(userId: string, payload: unknown): Promise<BulkInviteResponse> {
  const data = payload as { emails?: string[]; role?: string };
  const emails = Array.isArray(data.emails) ? data.emails : [];
  const role = data.role ?? "JobSeeker";
  const results: BulkInviteResponse = {
    totalProcessed: emails.length,
    successCount: 0,
    failureCount: 0,
    successfulInvitations: [],
    failedInvitations: [],
    message: "",
  };
  for (const email of emails) {
    try {
      await inviteAccountUser({ email, role: role as any }, userId);
      results.successCount += 1;
      results.successfulInvitations.push({ email });
    } catch (e) {
      results.failureCount += 1;
      results.failedInvitations.push({ email, reason: String(e) });
    }
  }
  results.message = `Processed ${results.totalProcessed} invitations.`;
  return results;
}

export async function resendInvitation(userId: string, invitationId: string): Promise<void> {
  const db = getDb();
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, invitationId)).limit(1);
  if (!invite) return;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  await db
    .update(accountInvitations)
    .set({ token, status: "pending" } as any)
    .where(eq(accountInvitations.id, invitationId));
}

export async function cancelInvitation(userId: string, invitationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(accountInvitations)
    .set({ status: "cancelled", cancelledAt: new Date() } as any)
    .where(eq(accountInvitations.id, invitationId));
}

export async function getInvitationAnalytics(userId: string): Promise<Record<string, unknown>> {
  const db = getDb();
  const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations);
  const [pendingRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations).where(eq(accountInvitations.status, "pending"));
  const [acceptedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations).where(eq(accountInvitations.status, "accepted"));
  return {
    total: Number(totalRow?.count ?? 0),
    pending: Number(pendingRow?.count ?? 0),
    accepted: Number(acceptedRow?.count ?? 0),
  };
}

export async function deleteAccount(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(users).where(eq(users.id, userId));
}
