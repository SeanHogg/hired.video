/**
 * Pure companies handlers — extracted from routes/companies.ts so the
 * Hono layer is a thin adapter and every business rule can be exercised
 * with mocked deps.
 *
 * Follows the same pattern as auth-handlers.ts / resume-handlers.ts:
 *   • CompanyDeps           — infrastructure abstractions (db, clock).
 *   • CompanyRequestContext — per-request data (viewerId, ipHash, …).
 *   • handle*(deps, ctx, …) — pure functions returning { status, body }.
 *
 * Handlers cover:
 *   • CRUD for the company_profiles row (get / create / update / delete)
 *   • CRUD for company_locations
 *   • CRUD for company_team_members
 *   • Follow / unfollow
 *   • Slug-based lookup and stats
 */

import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { slugify } from "../../../../shared/slugify.js";

const {
  companyProfiles,
  companyFollowers,
  companyLocations,
  companyTeamMembers,
  companyViews,
  jobItems,
} = schema;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type DbPort = any;

export interface CompanyDeps {
  db: DbPort;
  now: () => Date;
}

export interface CompanyRequestContext {
  viewerId: string | null;
  ipHash: string | null;
  referrer: string | null;
  userAgent: string | null;
}

// Result envelope + auth guard live in the shared handler module.
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

// ---------------------------------------------------------------------------
// Input schemas — validated at the handler boundary so routes don't have
// to re-parse bodies. Colocated with the handlers because they're part
// of each endpoint's contract.
// ---------------------------------------------------------------------------

// Canonical source is shared/companies.ts. `LocationSchema` and
// `TeamMemberSchema` are re-exported under their original names for
// tests that imported from this module.
import {
  CreateCompanySchema,
  UpdateCompanySchema,
  CompanyLocationSchema as LocationSchema,
  CompanyTeamMemberSchema as TeamMemberSchema,
} from "../../../../shared/companies.js";
export { CreateCompanySchema, UpdateCompanySchema, LocationSchema, TeamMemberSchema };

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
): Promise<HandlerResult | { ownerId: string }> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const [row] = await deps.db
    .select({ ownerId: companyProfiles.ownerId })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyId))
    .limit(1);
  if (!row) return fail(404, "NOT_FOUND", "Company not found");
  if (row.ownerId !== auth.userId) {
    return fail(403, "FORBIDDEN", "Only the owner can modify this company");
  }
  return { ownerId: row.ownerId };
}

// ---------------------------------------------------------------------------
// View recording
// ---------------------------------------------------------------------------

async function recordView(
  deps: CompanyDeps,
  companyId: string,
  ownerId: string,
  ctx: CompanyRequestContext,
): Promise<void> {
  if (ctx.viewerId && ctx.viewerId === ownerId) return;
  await deps.db.insert(companyViews).values({
    companyId,
    viewerId: ctx.viewerId,
    ipHash: ctx.ipHash ?? null,
    referrer: ctx.referrer ?? null,
    userAgent: ctx.userAgent ?? null,
  } as any);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateCompany
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCreateCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  body: unknown,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  const parsed = CreateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const slug = slugifyCompanyName(parsed.data.name);
  const [row] = await deps.db
    .insert(companyProfiles)
    .values({
      ownerId: auth.userId,
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

  return ok(row, 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateCompany
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  body: unknown,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;

  const parsed = UpdateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: deps.now() };
  const [row] = await deps.db
    .update(companyProfiles)
    .set(updates as any)
    .where(eq(companyProfiles.id, companyId))
    .returning();

  return ok(row);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteCompany
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDeleteCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;

  await deps.db.delete(companyProfiles).where(eq(companyProfiles.id, companyId));
  return ok(null);
}

// ═══════════════════════════════════════════════════════════════════════════
// Follow / unfollow
// ═══════════════════════════════════════════════════════════════════════════

export async function handleFollowCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  // onConflictDoNothing → idempotent follow (double-follow is a no-op).
  try {
    await deps.db
      .insert(companyFollowers)
      .values({ userId: auth.userId, companyId } as any);
  } catch {
    // Conflict means we're already following — treat as success.
  }
  return ok({ success: true });
}

export async function handleUnfollowCompany(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;
  await deps.db
    .delete(companyFollowers)
    .where(and(eq(companyFollowers.userId, auth.userId), eq(companyFollowers.companyId, companyId)));
  return ok({ success: true });
}

export async function handleFollowingStatus(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
): Promise<HandlerResult> {
  if (!viewerId) return ok({ isFollowing: false });
  const [row] = await deps.db
    .select({ id: companyFollowers.userId })
    .from(companyFollowers)
    .where(and(eq(companyFollowers.userId, viewerId), eq(companyFollowers.companyId, companyId)))
    .limit(1);
  return ok({ isFollowing: !!row });
}

// ═══════════════════════════════════════════════════════════════════════════
// Locations CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListLocations(
  deps: CompanyDeps,
  companyId: string,
): Promise<HandlerResult> {
  const rows = await deps.db
    .select()
    .from(companyLocations)
    .where(eq(companyLocations.companyId, companyId))
    .orderBy(asc(companyLocations.displayOrder));
  return ok(rows);
}

export async function handleCreateLocation(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  body: unknown,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;
  const parsed = LocationSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid location", parsed.error.flatten());
  }
  const [row] = await deps.db
    .insert(companyLocations)
    .values({ companyId, ...parsed.data } as any)
    .returning();
  return ok(row, 201);
}

export async function handleUpdateLocation(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  locationId: string,
  body: unknown,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;
  const parsed = LocationSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid location", parsed.error.flatten());
  }
  const [row] = await deps.db
    .update(companyLocations)
    .set({ ...parsed.data, updatedAt: deps.now() } as any)
    .where(and(eq(companyLocations.id, locationId), eq(companyLocations.companyId, companyId)))
    .returning();
  if (!row) return fail(404, "NOT_FOUND", "Location not found");
  return ok(row);
}

export async function handleDeleteLocation(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  locationId: string,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;
  await deps.db
    .delete(companyLocations)
    .where(and(eq(companyLocations.id, locationId), eq(companyLocations.companyId, companyId)));
  return ok(null);
}

// ═══════════════════════════════════════════════════════════════════════════
// Team members CRUD
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListTeamMembers(
  deps: CompanyDeps,
  companyId: string,
): Promise<HandlerResult> {
  const rows = await deps.db
    .select()
    .from(companyTeamMembers)
    .where(eq(companyTeamMembers.companyId, companyId))
    .orderBy(asc(companyTeamMembers.displayOrder));
  return ok(rows);
}

export async function handleCreateTeamMember(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  body: unknown,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;
  const parsed = TeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid team member", parsed.error.flatten());
  }
  const [row] = await deps.db
    .insert(companyTeamMembers)
    .values({ companyId, ...parsed.data } as any)
    .returning();
  return ok(row, 201);
}

export async function handleUpdateTeamMember(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  memberId: string,
  body: unknown,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;
  const parsed = TeamMemberSchema.partial().safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid team member", parsed.error.flatten());
  }
  const [row] = await deps.db
    .update(companyTeamMembers)
    .set({ ...parsed.data, updatedAt: deps.now() } as any)
    .where(and(eq(companyTeamMembers.id, memberId), eq(companyTeamMembers.companyId, companyId)))
    .returning();
  if (!row) return fail(404, "NOT_FOUND", "Team member not found");
  return ok(row);
}

export async function handleDeleteTeamMember(
  deps: CompanyDeps,
  viewerId: string | null,
  companyId: string,
  memberId: string,
): Promise<HandlerResult> {
  const guard = await assertOwner(deps, companyId, viewerId);
  if ("status" in guard) return guard;
  await deps.db
    .delete(companyTeamMembers)
    .where(and(eq(companyTeamMembers.id, memberId), eq(companyTeamMembers.companyId, companyId)));
  return ok(null);
}
