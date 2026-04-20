
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
import { USER_ROLES } from "../../../shared/user-roles.js";

const { users, accountPreferences, accountInvitations, refreshTokens, passwordResetTokens, emailVerificationTokens, twoFactorCodes, jobItems, jobApplications, resumeInformation } = schema;

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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    [totalUsersRow],
    [activeUsersRow],
    [newUsers30Row],
    [totalJobsRow],
    [newJobs30Row],
    [totalResumesRow],
    [totalApplicationsRow],
    [newApplications30Row],
    [invitesSentRow],
    [invitesAcceptedRow],
    [lastActiveRow],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.lastLoginAt} >= ${thirtyDaysAgo}`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${thirtyDaysAgo}`),
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobItems)
      .where(sql`${jobItems.createdAt} >= ${thirtyDaysAgo}`),
    db.select({ count: sql<number>`count(*)::int` }).from(resumeInformation),
    db.select({ count: sql<number>`count(*)::int` }).from(jobApplications),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobApplications)
      .where(sql`${jobApplications.createdAt} >= ${thirtyDaysAgo}`),
    db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accountInvitations)
      .where(eq(accountInvitations.status, "accepted")),
    db
      .select({ lastActiveAt: sql<string>`max(${users.lastLoginAt})` })
      .from(users),
  ]);

  const growthRate = (current: number, newInPeriod: number) => {
    const prior = current - newInPeriod;
    if (prior <= 0) return newInPeriod > 0 ? 100 : 0;
    return Math.round((newInPeriod / prior) * 1000) / 10;
  };

  const totalUsers = Number(totalUsersRow?.count ?? 0);
  const activeUsers = Number(activeUsersRow?.count ?? 0);
  const newUsers30 = Number(newUsers30Row?.count ?? 0);
  const totalJobs = Number(totalJobsRow?.count ?? 0);
  const newJobs30 = Number(newJobs30Row?.count ?? 0);
  const totalResumes = Number(totalResumesRow?.count ?? 0);
  const totalApplications = Number(totalApplicationsRow?.count ?? 0);
  const newApplications30 = Number(newApplications30Row?.count ?? 0);

  return {
    totalUsers,
    activeUsers,
    totalJobs,
    totalResumes,
    totalApplications,
    userGrowth: growthRate(totalUsers, newUsers30),
    jobGrowth: growthRate(totalJobs, newJobs30),
    applicationGrowth: growthRate(totalApplications, newApplications30),
    invitesSent: Number(invitesSentRow?.count ?? 0),
    invitesAccepted: Number(invitesAcceptedRow?.count ?? 0),
    lastActiveAt: lastActiveRow?.lastActiveAt ?? null,
  };
}

export async function bulkInviteUsers(userId: string, payload: unknown): Promise<BulkInviteResponse> {
  const data = payload as { emails?: string[]; role?: string };
  const emails = Array.isArray(data.emails) ? data.emails : [];
  const role = data.role ?? USER_ROLES.JOB_SEEKER;
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

  // Soft delete: disable the account and revoke existing authentication artifacts.
  // This matches legacy behavior where the account is no longer usable but records remain.
  await db
    .update(users)
    .set({
      isActive: false,
      emailVerified: false,
      passwordHash: Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("") as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(users.id, userId));

  await db.update(refreshTokens).set({ revoked: true } as any).where(eq(refreshTokens.userId, userId));
  await db.update(passwordResetTokens).set({ used: true } as any).where(eq(passwordResetTokens.userId, userId));
  await db.update(emailVerificationTokens).set({ used: true } as any).where(eq(emailVerificationTokens.userId, userId));
  await db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.userId, userId));
}
