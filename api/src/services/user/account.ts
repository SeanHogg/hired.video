
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import {
  AccountAnalytics,
  AccountOption,
  AccountSettings,
  AccountUser,
  AcceptInvitationResponse,
  BulkInviteRequest,
  BulkInviteResponse,
  InvitationDetailsResponse,
  InviteStatus,
  InviteUserRequest,
  InviteUserResponse,
  getAvailableRolesForInvite,
} from "../../../../shared/account.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../middleware/errorHandler.js";
import { splitName } from "./userActor.js";
import { sendInvitationEmail } from "../adapters/email.js";
import { revokeAllSessionsForUser } from "../auth/sessions.js";
import { defaultRoleChangeCacheBusters, onUserRoleChanged } from "./roleChangeEffects.js";
import { UsageService } from "../usage/UsageService.js";
import { invalidatePublicVideoFeed } from "../studio/public-video-feed.js";
import { eraseVideoPersonalization } from "../video-personalization/videoPersonalization.js";

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

const { users, userProfiles, accountPreferences, accountInvitations, userCompanyRoleAssociations, companyProfiles, refreshTokens, passwordResetTokens, emailVerificationTokens, twoFactorCodes, jobItems, jobApplications, resumeInformation, studioProjects, videos, socialConnections, youtubeAccounts } = schema;

/** Days a seat invitation stays valid before accept rejects it (gap #1680). */
const INVITE_TTL_DAYS = 14;

/** Title-case a USER_ROLES value for human-facing copy (email + UI). */
function roleLabel(role: string): string {
  return String(role)
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Resolve the inviter's display name + team name for the invite email. */
async function resolveInviteContext(
  db: ReturnType<typeof getDb>,
  invite: { invitedBy: string | null; companyId: string | null; role: string },
): Promise<{ inviterName: string; teamName: string }> {
  let inviterName = "A teammate";
  if (invite.invitedBy) {
    const [inviter] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, invite.invitedBy))
      .limit(1);
    if (inviter) inviterName = (inviter.name ?? "").trim() || inviter.email;
  }
  let teamName = "hired.video";
  if (invite.companyId) {
    const [company] = await db
      .select({ name: companyProfiles.name })
      .from(companyProfiles)
      .where(eq(companyProfiles.id, invite.companyId))
      .limit(1);
    if (company?.name) teamName = company.name;
  }
  return { inviterName, teamName };
}

/**
 * Authority gate for managing an existing invitation (cancel / resend).
 * Allowed when the caller is a platform admin, the original inviter, or an
 * active employer in the invite's bound company. Throws ForbiddenError
 * otherwise — NEVER fail-open (gap #1675).
 */
async function assertCanManageInvitation(
  db: ReturnType<typeof getDb>,
  userId: string,
  invite: { invitedBy: string | null; companyId: string | null },
): Promise<void> {
  const [caller] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = (caller?.role ?? "").toLowerCase();
  if (role === "admin" || role === "super_admin") return;
  if (invite.invitedBy && invite.invitedBy === userId) return;
  if (invite.companyId) {
    const [assoc] = await db
      .select({ id: userCompanyRoleAssociations.id })
      .from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.userId, userId),
        eq(userCompanyRoleAssociations.companyId, invite.companyId),
        eq(userCompanyRoleAssociations.role, "employer"),
        eq(userCompanyRoleAssociations.isActive, true),
      ))
      .limit(1);
    if (assoc) return;
  }
  throw new ForbiddenError("You are not allowed to manage this invitation");
}

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

  // Seat soft-cap (gap #1678): inviting a workforce employee consumes a paid
  // $9.95/mo seat. If the company is already at its authorized seat limit and
  // the owner hasn't confirmed the extra cost, return a confirmation prompt
  // instead of sending the invite. Confirming raises the authorized limit.
  // Only `employee` (the workforce-billable role) is gated; recruiter/employer
  // invites aren't seat-billed.
  if (String(request.role).toLowerCase() === "employee" && request.companyId) {
    const { getSeatCommitment, authorizeSeats } = await import("../workforce/index.js");
    const commitment = await getSeatCommitment(request.companyId, db);
    if (commitment.committedSeats + 1 > commitment.seatLimit) {
      if (!request.confirmPaidSeat) {
        return {
          success: false,
          requiresSeatConfirmation: true,
          message: `Adding this member adds a paid seat at $${(commitment.pricePerSeatCents / 100).toFixed(2)}/mo.`,
          inviteId: "",
          seatInfo: {
            committedSeats: commitment.committedSeats,
            seatLimit: commitment.seatLimit,
            pricePerSeatCents: commitment.pricePerSeatCents,
          },
        };
      }
      await authorizeSeats(request.companyId, commitment.committedSeats + 1, db);
    }
  }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(accountInvitations)
    .values({
      email: request.email,
      role: request.role as string,
      token,
      invitedBy: invitedByUserId,
      status: "pending",
      companyId: request.companyId ?? null,
      expiresAt,
    } as any)
    .returning();

  // Actually deliver the invite. Best-effort: a mailer outage must not roll
  // back the invitation row (the inviter can resend), so failures are logged
  // not thrown (gap #1673).
  try {
    const { inviterName, teamName } = await resolveInviteContext(db, {
      invitedBy: invitedByUserId,
      companyId: request.companyId ?? null,
      role: String(request.role),
    });
    await sendInvitationEmail({
      to: request.email,
      inviterName,
      teamName,
      roleLabel: roleLabel(String(request.role)),
      token,
      expiryDays: INVITE_TTL_DAYS,
    });
  } catch (err) {
    console.error("[invite] Failed to send invitation email:", err);
  }

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
  // Plan, public references and pitch caches are all role-keyed.
  await onUserRoleChanged(targetUserId, defaultRoleChangeCacheBusters(db));
}

export async function removeAccountUser(currentUserId: string, userId: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
  if (!currentUser) return;
  const role = currentUser.role.toLowerCase();
  if (role === "admin" || role === "super_admin") {
    // Platform admins can deactivate anyone, full stop.
    await db.update(users).set({ isActive: false } as any).where(eq(users.id, userId));
    // Kill live access immediately — deactivating users.isActive only blocks
    // the NEXT login; existing JWTs validate against their session row, so we
    // revoke every session + refresh token to invalidate tokens already in
    // the wild (gap #1676).
    await revokeUserAccess(db, userId);
    // Deactivate every active employee membership + reconcile each company's
    // seat billing — a deactivated user must stop counting as a billed seat,
    // and recalculateWorkforceSeats counts active UCRAs (not users.isActive),
    // so leaving the UCRA active would keep charging for a vacated seat
    // (gap #1677).
    await deactivateEmployeeSeats(db, userId);
    return;
  }
  if (role === "employer") {
    // Employers can deactivate employees of THEIR company only. The check
    // is workspace-scoped: confirm there's an active UCRA row binding both
    // the current user (as employer) and the target user (as employee) to
    // the same company. Without that match the call is a no-op (#1406).
    const sharedWorkspaces = await db
      .select({ companyId: userCompanyRoleAssociations.companyId })
      .from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.userId, currentUserId),
        eq(userCompanyRoleAssociations.role, "employer"),
        eq(userCompanyRoleAssociations.isActive, true),
      ));
    if (sharedWorkspaces.length === 0) return;
    const employerCompanyIds = sharedWorkspaces.map((r) => r.companyId);
    const [targetEmployment] = await db
      .select({ id: userCompanyRoleAssociations.id, companyId: userCompanyRoleAssociations.companyId })
      .from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.userId, userId),
        eq(userCompanyRoleAssociations.role, "employee"),
        eq(userCompanyRoleAssociations.isActive, true),
      ))
      .limit(1);
    if (!targetEmployment || !employerCompanyIds.includes(targetEmployment.companyId)) return;
    // Deactivate the workspace membership; leave users.isActive alone since
    // the employee can still be a job_seeker / employee elsewhere.
    await db.update(userCompanyRoleAssociations)
      .set({ isActive: false, updatedAt: new Date() } as any)
      .where(eq(userCompanyRoleAssociations.id, targetEmployment.id));
    // Revoke the removed member's sessions + refresh tokens so a live JWT
    // can't keep hitting company-scoped endpoints after they've been pulled
    // from the workspace. On their next login they re-auth fresh and the
    // now-inactive UCRA gates them out of the workspace (gap #1676).
    await revokeUserAccess(db, userId);
    // Reconcile seat billing — fewer active employees, fewer seats charged.
    // Imported dynamically to avoid a service-layer cycle (workforce → account
    // is the natural direction; the reverse import would be).
    const { recalculateWorkforceSeats } = await import("../workforce/index.js");
    await recalculateWorkforceSeats(targetEmployment.companyId, db);
    return;
  }
}

/** Invalidate every live credential for a user: revoke all session rows
 *  (kills JWTs whose `sid` validates against them) + revoke refresh tokens.
 *  Shared by both removal paths so neither can drift (gap #1676). */
async function revokeUserAccess(db: ReturnType<typeof getDb>, userId: string): Promise<void> {
  await revokeAllSessionsForUser(db, userId, "removed_from_account");
  await db.update(refreshTokens).set({ revoked: true } as any).where(eq(refreshTokens.userId, userId));
}

/** Deactivate every active `employee` membership for a user and reconcile
 *  each affected company's seat billing. recalculateWorkforceSeats counts
 *  ACTIVE employee UCRAs (not users.isActive), so a deactivated user keeps
 *  billing a seat until their UCRA is flipped (gap #1677). */
async function deactivateEmployeeSeats(db: ReturnType<typeof getDb>, userId: string): Promise<void> {
  const memberships = await db
    .select({ id: userCompanyRoleAssociations.id, companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  if (memberships.length === 0) return;
  await db.update(userCompanyRoleAssociations)
    .set({ isActive: false, updatedAt: new Date() } as any)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  const { recalculateWorkforceSeats } = await import("../workforce/index.js");
  const companyIds = [...new Set(memberships.map((m) => m.companyId))];
  for (const companyId of companyIds) {
    await recalculateWorkforceSeats(companyId, db);
  }
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

/** True when a pending invite is past its deadline. Legacy rows missing
 *  expiresAt fall back to createdAt + INVITE_TTL_DAYS. */
function inviteIsExpired(invite: { expiresAt: Date | null; createdAt: Date }): boolean {
  const deadline = invite.expiresAt
    ? new Date(invite.expiresAt as any).getTime()
    : new Date(invite.createdAt as any).getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() > deadline;
}

/**
 * Public details for the accept page, resolved from the SECRET token (not
 * the enumerable invitation id — gap #1674). Knowing the 192-bit token is
 * the bearer credential. Throws NotFoundError for an unknown token and
 * ConflictError when the invite is no longer acceptable (cancelled /
 * accepted / expired) so the page renders the "invalid invitation" state.
 */
export async function getInvitationDetailsByToken(token: string,
  deps?: Partial<AccountDeps>): Promise<InvitationDetailsResponse> {
  const d = resolveDeps(deps); const db = d.db;
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.token, token)).limit(1);
  if (!invite) throw new NotFoundError("Invitation not found");
  if (invite.status !== "pending") throw new ConflictError("This invitation is no longer active");
  if (inviteIsExpired(invite)) throw new ConflictError("This invitation has expired");

  const { inviterName, teamName } = await resolveInviteContext(db, invite);
  let companyDescription: string | undefined;
  let companyLogoUrl: string | undefined;
  if (invite.companyId) {
    const [company] = await db
      .select({ description: companyProfiles.description, logoUrl: companyProfiles.logoUrl })
      .from(companyProfiles)
      .where(eq(companyProfiles.id, invite.companyId))
      .limit(1);
    companyDescription = company?.description ?? undefined;
    companyLogoUrl = company?.logoUrl ?? undefined;
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1);

  return {
    invitationId: invite.id,
    companyName: teamName,
    companyDescription,
    companyLogoUrl,
    inviterName,
    invitedEmail: invite.email,
    rolesToAssign: [invite.role],
    invitedAt: new Date(invite.createdAt as any).toISOString(),
    userExists: !!existing,
  };
}

/**
 * Accept a seat invitation. Keyed by the secret token and requires an
 * AUTHENTICATED caller whose email matches the invite (gap #1674). Validates
 * status + expiry, binds the membership, marks the invite accepted. Does NOT
 * create users — a brand-new invitee registers through the normal signup flow
 * first (which sets a real password + sends verification), then accepts.
 */
export async function acceptInvitation(token: string, currentUserId: string,
  deps?: Partial<AccountDeps>): Promise<AcceptInvitationResponse> {
  const d = resolveDeps(deps); const db = d.db;
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.token, token)).limit(1);
  if (!invite) throw new NotFoundError("Invitation not found");
  if (invite.status !== "pending") throw new ConflictError("This invitation is no longer active");
  if (inviteIsExpired(invite)) throw new ConflictError("This invitation has expired");

  const [current] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);
  if (!current) throw new NotFoundError("User not found");
  if (current.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new ForbiddenError(`This invitation was sent to ${invite.email}. Sign in with that email to accept it.`);
  }

  await db
    .update(accountInvitations)
    .set({ status: "accepted", acceptedAt: new Date() } as any)
    .where(eq(accountInvitations.id, invite.id));

  await db.update(users).set({ role: invite.role as any, isActive: true } as any).where(eq(users.id, current.id));
  // Role flip: plan, public references and pitch caches are role-keyed.
  await onUserRoleChanged(current.id, defaultRoleChangeCacheBusters(db));

  // Workforce / company-bound invites: bind the accepted user to the
  // inviting employer's workspace via userCompanyRoleAssociations. The
  // existing-row branch (re-invite, role swap) upgrades the role rather
  // than stacking a duplicate. Legacy invites without a companyId stay
  // as plain top-level role assignments.
  if (invite.companyId) {
    const [existingAssoc] = await db.select().from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.userId, current.id),
        eq(userCompanyRoleAssociations.companyId, invite.companyId),
      ))
      .limit(1);
    if (existingAssoc) {
      await db.update(userCompanyRoleAssociations)
        .set({ role: invite.role as string, isActive: true, updatedAt: new Date() } as any)
        .where(eq(userCompanyRoleAssociations.id, existingAssoc.id));
    } else {
      await db.insert(userCompanyRoleAssociations).values({
        userId: current.id,
        companyId: invite.companyId,
        role: invite.role as string,
        isActive: true,
      } as any);
    }
    // Reconcile workforce seat billing whenever the accepted role is an
    // employee — that's the workforce-billable role per #1349 + #1409.
    // Dynamic import to keep the service-layer dependency graph acyclic.
    if (String(invite.role).toLowerCase() === "employee") {
      const { recalculateWorkforceSeats } = await import("../workforce/index.js");
      await recalculateWorkforceSeats(invite.companyId, db);
    }
  }

  const { teamName } = await resolveInviteContext(db, invite);
  return {
    success: true,
    message: "Invitation accepted",
    companyName: teamName,
    assignedRoles: [invite.role as any],
    requiredRegistration: false,
    redirectUrl: `/dashboard`,
  };
}

export async function listPendingInvitations(currentUserId: string,
  deps?: Partial<AccountDeps>): Promise<AccountUser[]> {
  const d = resolveDeps(deps); const db = d.db;

  // Scope (gap #1682): platform admins see every pending invite; everyone
  // else sees only invitations they personally sent OR invitations bound to
  // a company they're an active employer in. NEVER return the whole table to
  // a non-admin caller — that leaked other workspaces' invites.
  const [caller] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);
  const callerRole = (caller?.role ?? "").toLowerCase();
  const isPlatformAdmin = callerRole === "admin" || callerRole === "super_admin";

  let scope;
  if (isPlatformAdmin) {
    scope = eq(accountInvitations.status, "pending");
  } else {
    const employerCompanies = await db
      .select({ companyId: userCompanyRoleAssociations.companyId })
      .from(userCompanyRoleAssociations)
      .where(and(
        eq(userCompanyRoleAssociations.userId, currentUserId),
        eq(userCompanyRoleAssociations.role, "employer"),
        eq(userCompanyRoleAssociations.isActive, true),
      ));
    const companyIds = employerCompanies.map((r) => r.companyId);
    const ownership = companyIds.length > 0
      ? or(eq(accountInvitations.invitedBy, currentUserId), inArray(accountInvitations.companyId, companyIds))
      : eq(accountInvitations.invitedBy, currentUserId);
    scope = and(eq(accountInvitations.status, "pending"), ownership);
  }

  const invites = await db
    .select()
    .from(accountInvitations)
    .where(scope)
    .orderBy(desc(accountInvitations.createdAt))
    .limit(100);

  return invites.map((row) => normalizeInvitation(row, { currentUserRole: isPlatformAdmin ? "admin" : callerRole }));
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

export async function bulkInviteUsers(userId: string, payload: BulkInviteRequest,
  deps?: Partial<AccountDeps>): Promise<BulkInviteResponse> {
  // One canonical request shape now (gap #1686): `{ invites: [{email, role}], companyId? }`.
  // The route validates with BulkInviteRequestSchema before we get here.
  const invites = payload.invites;
  const results: BulkInviteResponse = {
    totalProcessed: invites.length,
    successCount: 0,
    failureCount: 0,
    successfulInvitations: [],
    failedInvitations: [],
    message: "",
  };
  for (const invite of invites) {
    try {
      // inviteAccountUser runs the per-role authority check (assertCanAssignRole)
      // + sends the email, so a single bad role fails just that row rather than
      // the whole batch.
      const res = await inviteAccountUser(
        { email: invite.email, role: invite.role as any, companyId: payload.companyId, confirmPaidSeat: payload.confirmPaidSeat },
        userId,
        deps,
      );
      // An unconfirmed paid-seat invite comes back success:false rather than
      // throwing — surface it as a failed row with a clear reason (gap #1678).
      if (res.requiresSeatConfirmation) {
        results.failureCount += 1;
        results.failedInvitations.push({ email: invite.email, reason: res.message });
        continue;
      }
      results.successCount += 1;
      results.successfulInvitations.push({ email: invite.email });
    } catch (e) {
      results.failureCount += 1;
      results.failedInvitations.push({ email: invite.email, reason: String(e) });
    }
  }
  results.message = `Processed ${results.totalProcessed} invitations.`;
  return results;
}

export async function resendInvitation(userId: string, invitationId: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, invitationId)).limit(1);
  if (!invite) throw new NotFoundError("Invitation not found");
  // Only the inviter / company employer / platform admin may resend (gap #1675).
  await assertCanManageInvitation(db, userId, invite);
  // Resend is for live invites only. A cancelled or accepted invite must NOT
  // be silently resurrected — to re-invite, send a fresh invitation.
  if (invite.status !== "pending") {
    throw new ConflictError("Only pending invitations can be resent");
  }
  // Rotate the token + extend the deadline so the resent link is fresh.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(accountInvitations)
    .set({ token, status: "pending", expiresAt } as any)
    .where(eq(accountInvitations.id, invitationId));

  try {
    const { inviterName, teamName } = await resolveInviteContext(db, invite);
    await sendInvitationEmail({
      to: invite.email,
      inviterName,
      teamName,
      roleLabel: roleLabel(String(invite.role)),
      token,
      expiryDays: INVITE_TTL_DAYS,
    });
  } catch (err) {
    console.error("[invite] Failed to resend invitation email:", err);
  }
}

export async function cancelInvitation(userId: string, invitationId: string,
  deps?: Partial<AccountDeps>): Promise<void> {
  const d = resolveDeps(deps); const db = d.db;
  const [invite] = await db.select().from(accountInvitations).where(eq(accountInvitations.id, invitationId)).limit(1);
  if (!invite) throw new NotFoundError("Invitation not found");
  // Only the inviter / company employer / platform admin may cancel (gap #1675).
  await assertCanManageInvitation(db, userId, invite);
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
      invalidatePublicVideoFeed();
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
  invalidatePublicVideoFeed();

  await db.update(refreshTokens).set({ revoked: true } as any).where(eq(refreshTokens.userId, userId));
  await db.update(passwordResetTokens).set({ used: true } as any).where(eq(passwordResetTokens.userId, userId));
  await db.update(emailVerificationTokens).set({ used: true } as any).where(eq(emailVerificationTokens.userId, userId));
  await db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.userId, userId));

  // Connected publishing accounts: hard-DELETE the stored OAuth tokens for
  // every network the user linked (TikTok / Instagram / X / Facebook via
  // social_connections, plus LinkedIn and YouTube). Platform terms (Meta's
  // data-deletion requirement) bar keeping a departed user's access to their
  // accounts, and the rows carry no audit value. Company-scoped connections
  // the user created are left to the company.
  await db
    .delete(socialConnections)
    .where(and(eq(socialConnections.userId, userId), isNull(socialConnections.companyId)));
  await db.delete(youtubeAccounts).where(eq(youtubeAccounts.userId, userId));

  // GDPR erasure of usage history (gap #2067). The `usage_sessions.user_id` FK
  // is ON DELETE SET NULL and this path soft-deletes (anonymizes) rather than
  // hard-deleting the users row, so the cascade never fires — without an
  // explicit erase, a leaving user's tracked sessions/events (cascade) would
  // persist forever bound to their original id. Hard-DELETE here (not anonymize)
  // because usage rows carry no standalone audit value once the human is gone.
  await new UsageService(d.repos.usageTracking).eraseForUser(userId);
  // Personal moments (birthday, a date kept in memory…) — gap #2350.
  await eraseVideoPersonalization(userId, db);

  return result;
}
