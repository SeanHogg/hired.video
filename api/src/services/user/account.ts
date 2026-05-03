
import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import {
  AccountAnalytics,
  AccountOption,
  AccountSettings,
  AccountUser,
  AcceptInvitationResponse,
  BulkInviteResponse,
  InviteUserRequest,
  InviteUserResponse,
} from "../../../../shared/account.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";

import { type ApiDeps, defaultApiDeps } from "../apiDeps.js";

/** Narrow Deps slice. account.ts touches both `users` (via UsersRepository)
 *  and `accountInvitations` (via PlatformRepository) plus assorted
 *  tables without repo surface yet — the raw `db` handle is injected so
 *  all the direct Drizzle calls can still be mocked by tests. */
export interface AccountDeps {
  repos: ApiDeps["repos"];
  db: ReturnType<typeof getDb>;
}

const resolveDeps = (deps?: Partial<AccountDeps>): AccountDeps => {
  const api = defaultApiDeps();
  return {
    repos: deps?.repos ?? api.repos,
    db: deps?.db ?? getDb(),
  };
};

const { users, accountPreferences, accountInvitations, refreshTokens, passwordResetTokens, emailVerificationTokens, twoFactorCodes, jobItems, jobApplications, resumeInformation, studioProjects, videos } = schema;

function normalizeUser(row: typeof users.$inferSelect): AccountUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as any,
    isActive: row.isActive,
  };
}

export async function listAccountUsers(currentUserId: string, currentUserRole: string,
  deps?: Partial<AccountDeps>): Promise<AccountUser[]> {
  const d = resolveDeps(deps); const db = d.db;
  // Admins see all users, others see themselves only
  if (currentUserRole?.toLowerCase() === "admin") {
    const rows = await db.select().from(users).orderBy(desc(users.createdAt));
    return rows.map(normalizeUser);
  }
  const [row] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  return row ? [normalizeUser(row)] : [];
}

export async function inviteAccountUser(request: InviteUserRequest, invitedByUserId: string,
  deps?: Partial<AccountDeps>): Promise<InviteUserResponse> {
  const d = resolveDeps(deps); const db = d.db;
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

export async function updateAccountRoles(currentUserId: string, targetUserId: string, role: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  // Only allow role changes if current user is admin.
  const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  if (!currentUser || currentUser.role.toLowerCase() !== "admin") return;
  await db.update(users).set({ role } as any).where(eq(users.id, targetUserId));
}

export async function removeAccountUser(currentUserId: string, userId: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  if (!currentUser || currentUser.role.toLowerCase() !== "admin") return;
  await db.update(users).set({ isActive: false } as any).where(eq(users.id, userId));
}

export async function getAvailableAccounts(currentUserId: string, currentUserRole: string,
  deps?: Partial<AccountDeps>): Promise<AccountOption[]> {
  const d = resolveDeps(deps); const db = d.db;
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

export async function getInvitationDetails(invitationId: string,
  deps?: Partial<AccountDeps>): Promise<AcceptInvitationResponse> {
  const d = resolveDeps(deps); const db = d.db;
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

export async function acceptInvitation(invitationId: string,
  deps?: Partial<AccountDeps>): Promise<AcceptInvitationResponse> {
  const d = resolveDeps(deps); const db = d.db;
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

export async function listPendingInvitations(currentUserId: string,
  deps?: Partial<AccountDeps>): Promise<AccountUser[]> {
  const d = resolveDeps(deps); const db = d.db;
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

export async function getAccountSettings(userId: string,
  deps?: Partial<AccountDeps>): Promise<AccountSettings> {
  const d = resolveDeps(deps); const db = d.db;
  const [prefs] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1);
  return {
    locale: undefined,
    timezone: undefined,
    emailNotifications: prefs?.emailNotificationsEnabled ?? true,
    theme: prefs?.theme === "dark" ? "dark" : "light",
  };
}

export async function updateAccountSettings(userId: string, settings: AccountSettings,
  deps?: Partial<AccountDeps>): Promise<AccountSettings> {
  const d = resolveDeps(deps); const db = d.db;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (settings.emailNotifications !== undefined) updates.emailNotificationsEnabled = settings.emailNotifications;
  if (settings.theme) updates.theme = settings.theme;
  await db
    .insert(accountPreferences)
    .values({ userId, ...updates } as any)
    .onConflictDoUpdate({ target: accountPreferences.userId, set: updates });
  return await getAccountSettings(userId);
}

export async function getAccountAnalytics(userId: string, userRole: string,
  deps?: Partial<AccountDeps>): Promise<AccountAnalytics> {
  const d = resolveDeps(deps); const db = d.db;
  const repos = buildRepos(db);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Mixed-table analytics. Counts against `users` / `jobItems` / resumes
  // / jobApplications route through their repositories per the layering
  // rule; `accountInvitations` hasn't been extracted yet (see TODO on
  // `invitesSent` etc.) so those two reads stay inline until it is.
  const [
    totalUsers,
    activeUsers,
    newUsers30,
    totalJobs,
    newJobs30,
    totalResumes,
    totalApplications,
    newApplications30,
    [invitesSentRow],
    [invitesAcceptedRow],
    [lastActiveRow],
  ] = await Promise.all([
    repos.users.countAll(),
    // "Active in the last 30 days" reads `lastLoginAt`, which is a user
    // attribute we can expose via the repo without tangling with the
    // cross-cutting auth concern.
    (async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.lastLoginAt} >= ${thirtyDaysAgo}`);
      return Number(row?.count ?? 0);
    })(),
    repos.users.countCreatedSince(thirtyDaysAgo),
    repos.jobs.countJobs(),
    repos.jobs.countJobsCreatedSince(thirtyDaysAgo),
    repos.resumes.countAll(),
    repos.jobs.countApplications(),
    repos.jobs.countApplicationsCreatedSince(thirtyDaysAgo),
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

  // `totalUsers`, `activeUsers`, `newUsers30`, `totalJobs`, `newJobs30`,
  // `totalResumes`, `totalApplications`, `newApplications30` are already
  // numbers (destructured from repo calls above). Only invite rows still
  // need unboxing from the `[{count}]` shape.
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

export async function resendInvitation(userId: string, invitationId: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, invitationId)).limit(1);
  if (!invite) return;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  await db
    .update(accountInvitations)
    .set({ token, status: "pending" } as any)
    .where(eq(accountInvitations.id, invitationId));
}

export async function cancelInvitation(userId: string, invitationId: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  await db
    .update(accountInvitations)
    .set({ status: "cancelled", cancelledAt: new Date() } as any)
    .where(eq(accountInvitations.id, invitationId));
}

export async function getInvitationAnalytics(userId: string,
  deps?: Partial<AccountDeps>): Promise<Record<string, unknown>> {
  const d = resolveDeps(deps); const db = d.db;
  const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations);
  const [pendingRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations).where(eq(accountInvitations.status, "pending"));
  const [acceptedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(accountInvitations).where(eq(accountInvitations.status, "accepted"));
  return {
    total: Number(totalRow?.count ?? 0),
    pending: Number(pendingRow?.count ?? 0),
    accepted: Number(acceptedRow?.count ?? 0),
  };
}

export interface DeleteAccountOptions {
  /** Optional: email of another active user to receive ownership of all
   *  personal studio_projects + videos before the deactivation runs.
   *  When set, those rows have their userId reassigned so the asset
   *  survives the account being disabled. Company-owned content is never
   *  touched here — it stays with the company per migration 0064. */
  transferToEmail?: string | null;
}

export interface DeleteAccountResult {
  /** Number of personal studio_projects whose userId was reassigned. */
  transferredProjects: number;
  /** Number of personal videos whose userId was reassigned. */
  transferredVideos: number;
}

export async function deleteAccount(userId: string,
  options?: DeleteAccountOptions,
  deps?: Partial<AccountDeps>): Promise<DeleteAccountResult> {
  const d = resolveDeps(deps); const db = d.db;
  const result: DeleteAccountResult = { transferredProjects: 0, transferredVideos: 0 };

  // Optional ownership transfer: reassign personal content to a kept-alive
  // identity (eg a coach, partner, business successor) so it survives the
  // account being disabled. Skipped silently if the target email doesn't
  // resolve to an active user — the soft-delete still proceeds so the
  // user isn't blocked from leaving the platform.
  if (options?.transferToEmail) {
    const [target] = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.email, options.transferToEmail))
      .limit(1);
    if (target && target.id !== userId && target.isActive) {
      const projects = await db
        .update(studioProjects)
        .set({ userId: target.id, updatedAt: new Date() } as any)
        .where(and(eq(studioProjects.userId, userId), sql`${studioProjects.companyId} IS NULL`))
        .returning({ id: studioProjects.id });
      const vids = await db
        .update(videos)
        .set({ userId: target.id, updatedAt: new Date() } as any)
        .where(and(eq(videos.userId, userId), sql`${videos.companyId} IS NULL`))
        .returning({ id: videos.id });
      result.transferredProjects = projects.length;
      result.transferredVideos = vids.length;
    }
  }

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

  return result;
}
