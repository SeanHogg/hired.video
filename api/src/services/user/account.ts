
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
  InviteStatus,
  InviteUserRequest,
  InviteUserResponse,
  getAvailableRolesForInvite,
} from "../../../../shared/account.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { splitName } from "./userActor.js";

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

const { users, userProfiles, accountPreferences, accountInvitations, userCompanyRoleAssociations, refreshTokens, passwordResetTokens, emailVerificationTokens, twoFactorCodes, jobItems, jobApplications, resumeInformation, studioProjects, videos } = schema;

/** Display name + email pattern stamped over the row when a user deletes
 *  their account. The email pattern preserves the unique-constraint while
 *  freeing the original address for future re-registration. Anyone who
 *  joins later with the original email gets a fresh user_id. */
function anonymizedHandles(userId: string): { name: string; email: string } {
  return {
    name: "Deleted User",
    email: `deleted-${userId}@deleted.local`,
  };
}

/** Project a `users` row into the rich AccountUser shape the Team Members
 *  table reads. The `role` column on `users` is a single value — we
 *  surface it as a one-element `rolesAssigned` array so the UI's role-chip
 *  loop has something to render, and keep the raw `role` field for any
 *  callers that still want it. */
function normalizeUser(
  row: typeof users.$inferSelect,
  ctx: { currentUserId: string; currentUserRole: string },
): AccountUser {
  const { firstName, lastName } = splitName(row.name);
  const fullName = (row.name ?? "").trim();
  const roleLower = (row.role ?? "").toLowerCase();
  const viewerIsAdmin = ctx.currentUserRole?.toLowerCase() === "admin";
  // The "owner" of the account in this single-tenant model is whoever is
  // admin / super-admin. Everyone else who has signed in counts as
  // Accepted; deactivated users (`isActive=false`) surface as Rejected so
  // they're visually distinct without inventing a new status.
  const isOwner = row.isSuperAdmin === true || roleLower === "admin";
  const inviteStatus = !row.isActive
    ? InviteStatus.Rejected
    : isOwner
      ? InviteStatus.Owner
      : InviteStatus.Accepted;

  return {
    id: row.id,
    userId: row.id,
    email: row.email,
    firstName,
    lastName,
    fullName: fullName || row.email,
    inviteStatus,
    inviteStatusStartDateTime: row.createdAt
      ? new Date(row.createdAt as any).toISOString()
      : undefined,
    rolesAssigned: row.role ? [row.role] : [],
    role: row.role as any,
    isOwner,
    // Self-row + the account's lone owner can never be deleted from the UI;
    // every other row gets the action menu so an admin can deactivate.
    canDelete: viewerIsAdmin && !isOwner && row.id !== ctx.currentUserId,
    canEditRoles: viewerIsAdmin && !isOwner && row.id !== ctx.currentUserId,
    isActive: row.isActive,
  };
}

/** Project a pending `account_invitations` row into the same shape, so
 *  invited-but-not-accepted addresses show up alongside active users in
 *  one table (matches the "Pending Invites" counter at the top of the
 *  panel). `cancelled` invites land as Rejected; everything still
 *  marked `pending` past 14 days is treated as Expired so the UI badges
 *  it amber rather than green. */
function normalizeInvitation(
  row: typeof accountInvitations.$inferSelect,
  ctx: { currentUserRole: string },
): AccountUser {
  const viewerIsAdmin = ctx.currentUserRole?.toLowerCase() === "admin";
  const inviteStatus = (() => {
    if (row.status === "cancelled") return InviteStatus.Rejected;
    if (row.status === "accepted") return InviteStatus.Accepted;
    const ageMs = row.createdAt
      ? Date.now() - new Date(row.createdAt as any).getTime()
      : 0;
    const expired = ageMs > 14 * 24 * 60 * 60 * 1000;
    return expired ? InviteStatus.Expired : InviteStatus.Invited;
  })();
  return {
    id: row.id,
    userId: "",
    email: row.email,
    firstName: "",
    lastName: "",
    fullName: row.email,
    inviteStatus,
    inviteStatusStartDateTime: row.createdAt
      ? new Date(row.createdAt as any).toISOString()
      : undefined,
    rolesAssigned: row.role ? [row.role] : [],
    role: row.role as any,
    isOwner: false,
    canDelete: viewerIsAdmin,
    canEditRoles: false,
    isActive: false,
  };
}

export async function listAccountUsers(currentUserId: string, currentUserRole: string,
  deps?: Partial<AccountDeps>): Promise<AccountUser[]> {
  const d = resolveDeps(deps); const db = d.db;
  const ctx = { currentUserId, currentUserRole };
  // Admins see all users + every still-open invitation; non-admins see
  // only their own row so they can confirm their join state in Team
  // Members without exposing the rest of the org.
  if (currentUserRole?.toLowerCase() === "admin") {
    const [userRows, inviteRows] = await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)),
      db
        .select()
        .from(accountInvitations)
        .where(
          or(
            eq(accountInvitations.status, "pending"),
            eq(accountInvitations.status, "cancelled"),
          ),
        )
        .orderBy(desc(accountInvitations.createdAt)),
    ]);
    // De-dupe: if an invitation email already has a user row, the user
    // row is authoritative — drop the invitation copy.
    const userEmails = new Set(userRows.map((u) => u.email.toLowerCase()));
    return [
      ...userRows.map((r) => normalizeUser(r, ctx)),
      ...inviteRows
        .filter((i) => !userEmails.has(i.email.toLowerCase()))
        .map((r) => normalizeInvitation(r, ctx)),
    ];
  }
  const [row] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  return row ? [normalizeUser(row, ctx)] : [];
}

/**
 * Look up the inviter's role from the DB and confirm `requestedRole` is one
 * they're allowed to assign. Throws ForbiddenError (403) when the inviter
 * is unknown OR the role isn't in the allowed list. NEVER fail-open.
 *
 * Pulled out so `inviteAccountUser` and the hoisted `bulkInviteUsers` path
 * can share the exact same authority check.
 */
async function assertCanAssignRole(
  db: ReturnType<typeof getDb>,
  invitedByUserId: string,
  requestedRole: string,
): Promise<void> {
  const [inviter] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, invitedByUserId))
    .limit(1);
  if (!inviter?.role) {
    throw new ForbiddenError("Inviter role could not be resolved");
  }
  const allowed = getAvailableRolesForInvite(inviter.role);
  if (!allowed.includes(String(requestedRole).toLowerCase())) {
    throw new ForbiddenError("You are not allowed to assign this role");
  }
}

export async function inviteAccountUser(request: InviteUserRequest, invitedByUserId: string,
  deps?: Partial<AccountDeps>): Promise<InviteUserResponse> {
  const d = resolveDeps(deps); const db = d.db;
  // Server-side authority check: the frontend dropdown is the UX guard,
  // this is the security guard against hand-crafted POSTs that send a
  // role the inviter has no business assigning (eg recruiter → employer).
  await assertCanAssignRole(db, invitedByUserId, String(request.role));
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const [row] = await db
    .insert(accountInvitations)
    .values({
      email: request.email,
      role: request.role as string,
      token,
      invitedBy: invitedByUserId,
      status: "pending",
      companyId: request.companyId ?? null,
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
  let acceptedUserId: string;
  if (existing) {
    await db.update(users).set({ role: invite.role as any, isActive: true } as any).where(eq(users.id, existing.id));
    acceptedUserId = existing.id;
  } else {
    const passwordHash = ""; // no password set; user should reset
    const now = new Date();
    // Seed `name` with the email local-part so the row renders as
    // something meaningful in Team Members until the invitee updates
    // their profile. `users.name` is NOT NULL — saving `""` here used
    // to surface every accepted invitee as "Unknown User" forever.
    const placeholderName =
      invite.email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || invite.email;
    const [created] = await db.insert(users).values({
      email: invite.email,
      name: placeholderName,
      passwordHash,
      role: invite.role as any,
      isActive: true,
      emailVerified: false,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    } as any).returning({ id: users.id });
    acceptedUserId = created!.id;
  }

  // Workforce / company-bound invites: bind the accepted user to the
  // inviting employer's workspace via userCompanyRoleAssociations. The
  // existing-row branch (re-invite, role swap) upgrades the role rather
  // than stacking a duplicate. Legacy invites without a companyId stay
  // as plain top-level role assignments.
  if (invite.companyId) {
    const [existingAssoc] = await db.select().from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.userId, acceptedUserId),
        eq(userCompanyRoleAssociations.companyId, invite.companyId),
      ))
      .limit(1);
    if (existingAssoc) {
      await db.update(userCompanyRoleAssociations)
        .set({ role: invite.role as string, isActive: true, updatedAt: new Date() } as any)
        .where(eq(userCompanyRoleAssociations.id, existingAssoc.id));
    } else {
      await db.insert(userCompanyRoleAssociations).values({
        userId: acceptedUserId,
        companyId: invite.companyId,
        role: invite.role as string,
        isActive: true,
      } as any);
    }
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

  return invites.map((row) => normalizeInvitation(row, { currentUserRole: "admin" }));
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

export async function bulkInviteUsers(userId: string, payload: unknown,
  deps?: Partial<AccountDeps>): Promise<BulkInviteResponse> {
  const d = resolveDeps(deps); const db = d.db;
  const data = payload as { emails?: string[]; role?: string };
  const emails = Array.isArray(data.emails) ? data.emails : [];
  const role = data.role ?? USER_ROLES.JOB_SEEKER;
  // Authority check once per bulk call rather than once per email — same
  // ForbiddenError surface as the single-invite path, just avoids N round-trips.
  await assertCanAssignRole(db, userId, String(role));
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
      await inviteAccountUser({ email, role: role as any }, userId, deps);
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

  // Delete = anonymize + make private. We do NOT hard-delete the row:
  // historical activity (applications, transactions, audit trails) needs
  // a stable user_id even after the human has left, but everything
  // personally identifying about that human is scrubbed.
  //
  //   - `users` row: name → "Deleted User", email → unique anonymized
  //     value (preserves the unique constraint AND frees the original
  //     email for re-registration), password hash randomised so the row
  //     can never be authenticated as.
  //   - `user_profiles` row: every PII column (headline / phone /
  //     address / linkedIn / etc.) NULLed; structured home location
  //     cleared so personalised feeds stop targeting; profileVisibility
  //     forced to 'private' so the public profile page no longer
  //     surfaces. The row itself stays because foreign keys + JSON
  //     blobs reference it.
  //   - `videos`: privacyStatus → 'private' across every owned video so
  //     the public channel / homepage feeds stop including them.
  //
  // Hard-delete remains available as a manual operation handled by the
  // DPO in response to a verified data-subject request (gap #1168). The
  // `deletedAt` column is set here as an audit timestamp — NOT as a
  // sweep trigger; no scheduled job purges these rows.
  const now = new Date();
  const handles = anonymizedHandles(userId);
  await db
    .update(users)
    .set({
      name: handles.name,
      email: handles.email,
      isActive: false,
      emailVerified: false,
      passwordHash: Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("") as any,
      deletedAt: now,
      updatedAt: now,
    } as any)
    .where(eq(users.id, userId));

  // Anonymize the profile row. ON DELETE CASCADE means this row goes
  // away if the users row is ever hard-deleted by the DPO — but as
  // long as the row exists, none of its PII columns leak.
  await db
    .update(userProfiles)
    .set({
      headline: null,
      summary: null,
      location: null,
      website: null,
      phone: null,
      linkedIn: null,
      github: null,
      twitter: null,
      currentRole: null,
      currentCompany: null,
      avatarUrl: null,
      billingFullName: null,
      billingCompany: null,
      billingLine1: null,
      billingLine2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      billingPhone: null,
      homeCountryId: null,
      homeStateId: null,
      homeCityId: null,
      homePostalCode: null,
      homeLatitude: null,
      homeLongitude: null,
      homeRadiusKm: null,
      profileVisibility: "private",
      openToWork: false,
      providesServices: false,
      updatedAt: now,
    } as any)
    .where(eq(userProfiles.userId, userId));

  // Flip every owned video to private so the public channel + homepage
  // feeds stop surfacing them. Company-owned videos (companyId set) are
  // not touched — those belong to the company, not the leaving user.
  await db
    .update(videos)
    .set({ privacyStatus: "private", updatedAt: now } as any)
    .where(and(eq(videos.userId, userId), sql`${videos.companyId} IS NULL`));

  await db.update(refreshTokens).set({ revoked: true } as any).where(eq(refreshTokens.userId, userId));
  await db.update(passwordResetTokens).set({ used: true } as any).where(eq(passwordResetTokens.userId, userId));
  await db.update(emailVerificationTokens).set({ used: true } as any).where(eq(emailVerificationTokens.userId, userId));
  await db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.userId, userId));

  return result;
}
