/**
 * Self-service profile use cases — `GET /api/users/me` and `PUT /api/users/me`.
 *
 * SECURITY (both guards are load-bearing — do not relax):
 *   1. Roles: a profile update may only assign a role in
 *      PROFILE_ASSIGNABLE_ROLES. ADMIN / SUPER_ADMIN / EMPLOYEE are never
 *      self-assignable (admin is granted only via the SuperAdmin user
 *      console, employee only by invite). An unassignable role is silently
 *      ignored, exactly like before.
 *   2. Email: the profile update NEVER writes `users.email`. Changes go
 *      through the two-inbox verified flow (POST /api/auth/email-change/
 *      request); a body carrying a different address is rejected 409 so a
 *      stolen session can't silently re-home the account.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import { USER_ROLES, parseRoleAlias, type UserRole } from "../../../../shared/user-roles.js";
import { sanitizeProfileSectionsInput } from "../../../../shared/profile-sections.js";
import { getSubscription } from "../billing/BillingService.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { replaceOnboardingTasks } from "../../lib/onboarding.js";
import { invalidatePublicReferences } from "../profile/public-references-cache.js";
import { invalidatePublicVideoFeed } from "../studio/public-video-feed.js";
import { guardProfileWallText } from "../moderation/explicit/textGates.js";
import { invalidatePartnerProfilesForUser } from "../partner/connections.js";
import { onUserRoleChanged } from "./roleChangeEffects.js";
import { logger } from "../../lib/logger.js";
import {
  findIdentity,
  findProfileCols,
  updateIdentity,
  upsertProfileFields,
} from "../../repositories/usersProfileRepository.js";
import { toUserProfileDto } from "./userDtos.js";

/** Roles a profile update may assign (creator + affiliate are first-class
 *  since 2026-06-13). employee (invite-only) and super_admin are never
 *  assignable here. */
export const PROFILE_ASSIGNABLE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.CREATOR,
  USER_ROLES.AFFILIATE,
  // ADMIN / SUPER_ADMIN / EMPLOYEE are never self-assignable: admin is granted
  // only through the SuperAdmin user console, employee only by invite.
]);

/** Inbound role spelling → canonical DB role, or null when not assignable. */
export function normalizeRole(role: string): UserRole | null {
  const parsed = parseRoleAlias(role);
  return parsed && PROFILE_ASSIGNABLE_ROLES.has(parsed) ? parsed : null;
}

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  linkedIn: z.string().optional(),
  gitHub: z.string().optional(),  // frontend sends camelCase gitHub
  github: z.string().optional(),
  twitter: z.string().optional(),
  currentRole: z.string().optional(),
  currentCompany: z.string().optional(),
  avatar: z.string().optional(),
  avatarUrl: z.string().optional(),
  openToWork: z.boolean().optional(),
  openToRemote: z.boolean().optional(),
  salaryCurrency: z.string().optional(),
  salaryExpectation: z.number().int().optional(),
  yearsOfExperience: z.number().int().optional(),
  skills: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  preferredRoles: z.array(z.string()).optional(),
  role: z.string().optional(),
  profileVisibility: z.enum(["public", "private", "connections"]).optional(),
  // Confidential search mode (#1627) — opt out of the public people
  // directory while staying able to apply.
  confidentialMode: z.boolean().optional(),
  // Confidential employer blocklist (#1679) — company names hidden from
  // in recruiter search.
  confidentialBlocklist: z.array(z.string().max(200)).max(50).optional(),
  // Partial of `ProfileSections` (shared/profile-sections.ts). Each key
  // is optional and merged over current storage via upsert. Unknown keys
  // are dropped by `sanitizeProfileSectionsInput` server-side.
  profileSections: z.record(z.string(), z.boolean()).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** Build a partial profile updates object from only the fields that were provided */
function buildProfileUpdates(d: UpdateProfileInput): Record<string, unknown> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (d.headline !== undefined) updates.headline = d.headline;
  if (d.summary !== undefined) updates.summary = d.summary;
  if (d.location !== undefined) updates.location = d.location;
  if (d.website !== undefined) updates.website = d.website;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.linkedIn !== undefined) updates.linkedIn = d.linkedIn;
  if (d.github !== undefined || d.gitHub !== undefined) updates.github = d.github ?? d.gitHub;
  if (d.twitter !== undefined) updates.twitter = d.twitter;
  if (d.currentRole !== undefined) updates.currentRole = d.currentRole;
  if (d.currentCompany !== undefined) updates.currentCompany = d.currentCompany;
  if (d.avatar !== undefined || d.avatarUrl !== undefined) updates.avatarUrl = d.avatar ?? d.avatarUrl;
  if (d.openToWork !== undefined) updates.openToWork = d.openToWork;
  if (d.openToRemote !== undefined) updates.openToRemote = d.openToRemote;
  if (d.salaryCurrency !== undefined) updates.salaryCurrency = d.salaryCurrency;
  if (d.salaryExpectation !== undefined) updates.salaryExpectation = d.salaryExpectation;
  if (d.yearsOfExperience !== undefined) updates.yearsOfExperience = d.yearsOfExperience;
  if (d.skills !== undefined) updates.skills = d.skills;
  if (d.industries !== undefined) updates.industries = d.industries;
  if (d.preferredRoles !== undefined) updates.preferredRoles = d.preferredRoles;
  if (d.profileVisibility !== undefined) updates.profileVisibility = d.profileVisibility;
  if (d.confidentialMode !== undefined) updates.confidentialMode = d.confidentialMode;
  if (d.confidentialBlocklist !== undefined) updates.confidentialBlocklist = d.confidentialBlocklist;
  if (d.profileSections !== undefined) {
    updates.profileSections = sanitizeProfileSectionsInput(d.profileSections);
  }
  return updates;
}

async function upsertProfile(userId: string, profileUpdates: Record<string, unknown>) {
  const profile = await upsertProfileFields(userId, profileUpdates);
  // Name/headline/skills + profileVisibility all funnel through here and
  // feed the public `people` search bucket — invalidate the search index.
  bumpSearchVersion();
  // Section visibility gates the public references summary and the partner
  // payload's pitch ("videoResume", #2391).
  if (profileUpdates.profileSections !== undefined) {
    invalidatePublicReferences(userId);
    await invalidatePartnerProfilesForUser(userId).catch((err) =>
      logger.warn("[users] partner profile invalidation failed", { error: err instanceof Error ? err.message : err }),
    );
  }
  return profile;
}

/** GET /me — the caller's own profile (owner view) with the live Pro flag. */
export async function getMyProfile(userId: string) {
  const me = await findIdentity(userId);
  if (!me) throw new DomainError(404, "NOT_FOUND", "User not found");
  const profile = await findProfileCols(userId);
  const meDto = toUserProfileDto(me, profile ?? null);
  const meSub = await getSubscription(userId);
  meDto.isPro = meSub.isPro;
  return meDto;
}

export interface UpdateMyProfileArgs {
  userId: string;
  /** The address the session already has (JWT `email`). */
  sessionEmail: string | null | undefined;
  input: UpdateProfileInput;
  /** Worker env for the explicit-text scan. */
  env: Parameters<typeof guardProfileWallText>[1];
  /** Schedules post-response work (executionCtx.waitUntil). */
  waitUntil: (p: Promise<unknown>) => void;
}

/** PUT /me — update the caller's identity + profile. */
export async function updateMyProfile({ userId, sessionEmail, input: d, env, waitUntil }: UpdateMyProfileArgs) {
  const firstName = d.firstName ?? "";
  const lastName = d.lastName ?? "";
  const fullName = d.name ?? (firstName || lastName ? `${firstName} ${lastName}`.trim() : undefined);

  // NOTE: `email` is deliberately absent — see SECURITY (2) in the header.
  const userUpdates: Partial<{ name: string; role: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (fullName) userUpdates.name = fullName;
  // SECURITY (2): email changes go through the two-inbox verified flow
  // (POST /api/auth/email-change/request); this route only accepts the
  // address the session already has, so a stolen session can't silently
  // re-home the account.
  if (d.email && d.email.trim().toLowerCase() !== String(sessionEmail ?? "").trim().toLowerCase()) {
    throw new DomainError(
      409,
      "EMAIL_CHANGE_REQUIRES_VERIFICATION",
      "Change your email from Settings › Security; both inboxes must confirm.",
    );
  }

  // SECURITY (1): only PROFILE_ASSIGNABLE_ROLES pass normalizeRole — admin /
  // super_admin / employee are never self-assignable.
  const newRole = d.role ? normalizeRole(d.role) : null;
  if (newRole) userUpdates.role = newRole;

  // The home wall's cards show the name + headline: explicit text is
  // rejected before anything is saved (throws 422 EXPLICIT_CONTENT).
  await guardProfileWallText({ userId, name: fullName, headline: d.headline }, env);

  const updated = await updateIdentity(userId, userUpdates);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "User not found");

  const profile = await upsertProfile(userId, buildProfileUpdates(d));
  // The home page's video wall names the person and shows their headline.
  if (fullName || d.headline !== undefined) invalidatePublicVideoFeed();

  // Plan, public references and pitch caches are role-keyed.
  if (newRole) await onUserRoleChanged(userId);

  // When the role changes, replace onboarding tasks for the new role (fire-and-forget)
  if (newRole) {
    waitUntil(
      (async () => {
        try {
          await replaceOnboardingTasks(userId, newRole);
        } catch (err) {
          logger.error("[users/me] Failed to re-seed onboarding tasks", err);
        }
      })(),
    );
  }

  return toUserProfileDto(updated, profile ?? null);
}
