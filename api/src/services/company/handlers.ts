/**
 * Pure companies handlers — extracted from routes/companies.ts so the
 * Hono layer is a thin adapter and every business rule can be exercised
 * with mocked deps.
 *
 * Follows the same pattern as auth-handlers.ts / resume-handlers.ts:
 *   • CompanyDeps           — infrastructure abstractions (db, clock).
 *   • handle*(deps, …)      — use cases returning plain data and throwing
 *     DomainError (domains/errors.ts) on a rule violation. The route maps
 *     them onto the HTTP envelope with `toHandlerResult` (handlers/shared.ts);
 *     the create use cases (company, location, team member) answer 201.
 *
 * Handlers cover:
 *   • Create / update / delete for the company_profiles row
 *   • CRUD for company_locations (wired into routes/companies.ts)
 *   • CRUD for company_team_members (wired into routes/companies.ts)
 *   • Follow / unfollow
 */

import { and, asc, eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { slugify } from "../../../../shared/slugify.js";

const {
  companyProfiles,
  companyFollowers,
  companyLocations,
  companyTeamMembers,
} = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;

export interface CompanyDeps {
  db: DbPort;
  now: () => Date;
}

// Typed failure + auth guard; the HTTP envelope is the route's concern.
import { DomainError, requireUserId } from "../../domains/errors.js";

// ---------------------------------------------------------------------------
// Input schemas — validated at the handler boundary so routes don't have
// to re-parse bodies. Colocated with the handlers because they're part
// of each endpoint's contract.
// ---------------------------------------------------------------------------

// Canonical source is shared/companies.ts.
import {
  CreateCompanySchema,
  UpdateCompanySchema,
  CompanyLocationSchema as LocationSchema,
  CompanyTeamMemberSchema as TeamMemberSchema,
} from "../../../../shared/companies.js";

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

/** Thin wrapper around the shared `slugify` with company-specific
 *  defaults (100-char ceiling — wider than the default 80 because legal
 *  entity names get long — and "company" fallback). Kept as a named
 *  export so call sites read intent rather than scattering literals. */
export function slugifyCompanyName(name: string): string {
  return slugify(name, { fallback: "company", maxLen: 100 });
}

// ---------------------------------------------------------------------------
// Ownership guard — reused by every write endpoint
// ---------------------------------------------------------------------------

async function assertOwner(
  deps: CompanyDeps,
  companyId: string,
  viewerId: string | null,
): Promise<{ ownerId: string }> {
  const userId = requireUserId(viewerId);
  const [row] = await deps.db
    .select({ ownerId: companyProfiles.ownerId })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyId))
    .limit(1);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Company not found");
  if (row.ownerId !== userId) {
    throw new DomainError(403, "FORBIDDEN", "Only the owner can modify this company");
  }
  return { ownerId: row.ownerId };
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateCompany
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCreateCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);
  const parsed = CreateCompanySchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const slug = slugifyCompanyName(parsed.data.name);
  const [row] = await deps.db
    .insert(companyProfiles)
    .values({
      ownerId: userId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      website: parsed.data.website ?? null,
      logoUrl: parsed.data.logoUrl ?? null,
      industry: parsed.data.industry ?? null,
      size: parsed.data.size ?? null,
      foundedYear: parsed.data.foundedYear ?? null,
      headquarters: parsed.data.headquarters ?? null,
    } as any)
    .returning();

  return row;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateCompany
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  body: unknown,
) {
  await assertOwner(deps, companyId, viewerId);

  const parsed = UpdateCompanySchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: deps.now() };
  const [row] = await deps.db
    .update(companyProfiles)
    .set(updates as any)
    .where(eq(companyProfiles.id, companyId))
    .returning();

  return row;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteCompany
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDeleteCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<null> {
  await assertOwner(deps, companyId, viewerId);

  await deps.db.delete(companyProfiles).where(eq(companyProfiles.id, companyId));
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Follow / unfollow
// ═══════════════════════════════════════════════════════════════════════════

export async function handleFollowCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<{ success: true }> {
  const userId = requireUserId(viewerId);
  // onConflictDoNothing → idempotent follow (double-follow is a no-op).
  await deps.db
    .insert(companyFollowers)
    .values({ userId, companyId })
    .onConflictDoNothing();
  return { success: true };
}

export async function handleUnfollowCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<{ success: true }> {
  const userId = requireUserId(viewerId);
  await deps.db
    .delete(companyFollowers)
    .where(and(eq(companyFollowers.userId, userId), eq(companyFollowers.companyId, companyId)));
  return { success: true };
}

export async function handleFollowingStatus(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<{ isFollowing: boolean }> {
  if (!viewerId) return { isFollowing: false };
  const [row] = await deps.db
    .select({ id: companyFollowers.userId })
    .from(companyFollowers)
    .where(and(eq(companyFollowers.userId, viewerId), eq(companyFollowers.companyId, companyId)))
    .limit(1);
  return { isFollowing: !!row };
}

// ═══════════════════════════════════════════════════════════════════════════
// Locations CRUD
//
// Location + team-member writes take an ALREADY-AUTHORIZED company id: the
// route resolves `:id` (uuid or slug) and gates the caller with
// `requireCompanyOwner` (services/company/companyOwnership.ts — owner OR an
// active team member), the one company-access rule shared with branding.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListLocations(
  deps: CompanyDeps,
  companyId: string,
) {
  const rows = await deps.db
    .select()
    .from(companyLocations)
    .where(eq(companyLocations.companyId, companyId))
    .orderBy(asc(companyLocations.displayOrder));
  return rows;
}

export async function handleCreateLocation(
  deps: CompanyDeps,
  companyId: string,
  body: unknown,
) {
  const parsed = LocationSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid location", parsed.error.flatten());
  }
  const [row] = await deps.db
    .insert(companyLocations)
    .values({ companyId, ...parsed.data } as any)
    .returning();
  return row;
}

export async function handleUpdateLocation(
  deps: CompanyDeps,
  companyId: string,
  locationId: string,
  body: unknown,
) {
  const parsed = LocationSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid location", parsed.error.flatten());
  }
  const [row] = await deps.db
    .update(companyLocations)
    .set({ ...parsed.data, updatedAt: deps.now() } as any)
    .where(and(eq(companyLocations.id, locationId), eq(companyLocations.companyId, companyId)))
    .returning();
  if (!row) throw new DomainError(404, "NOT_FOUND", "Location not found");
  return row;
}

export async function handleDeleteLocation(
  deps: CompanyDeps,
  companyId: string,
  locationId: string,
): Promise<null> {
  await deps.db
    .delete(companyLocations)
    .where(and(eq(companyLocations.id, locationId), eq(companyLocations.companyId, companyId)));
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Team members CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListTeamMembers(
  deps: CompanyDeps,
  companyId: string,
) {
  const rows = await deps.db
    .select()
    .from(companyTeamMembers)
    .where(eq(companyTeamMembers.companyId, companyId))
    .orderBy(asc(companyTeamMembers.displayOrder));
  return rows;
}

export async function handleCreateTeamMember(
  deps: CompanyDeps,
  companyId: string,
  body: unknown,
) {
  const parsed = TeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid team member", parsed.error.flatten());
  }
  const [row] = await deps.db
    .insert(companyTeamMembers)
    .values({ companyId, ...parsed.data } as any)
    .returning();
  return row;
}

export async function handleUpdateTeamMember(
  deps: CompanyDeps,
  companyId: string,
  memberId: string,
  body: unknown,
) {
  const parsed = TeamMemberSchema.partial().safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid team member", parsed.error.flatten());
  }
  const [row] = await deps.db
    .update(companyTeamMembers)
    .set({ ...parsed.data, updatedAt: deps.now() } as any)
    .where(and(eq(companyTeamMembers.id, memberId), eq(companyTeamMembers.companyId, companyId)))
    .returning();
  if (!row) throw new DomainError(404, "NOT_FOUND", "Team member not found");
  return row;
}

export async function handleDeleteTeamMember(
  deps: CompanyDeps,
  companyId: string,
  memberId: string,
): Promise<null> {
  await deps.db
    .delete(companyTeamMembers)
    .where(and(eq(companyTeamMembers.id, memberId), eq(companyTeamMembers.companyId, companyId)));
  return null;
}
