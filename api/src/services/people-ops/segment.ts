/**
 * resolveSegment — the single entry point that maps a caller to a
 * (tenantId, segmentId) scope before any People-Ops data is touched. This
 * is the no-bleed chokepoint from specs/hired-video/01-domain-model.md §3:
 * every repository takes (tenantId, segmentId) and adds it to every WHERE.
 *
 * Phase 1 supports the NATIVE path only: a logged-in hired.video user
 * resolves to the `self` tenant + one segment per company. The embedded
 * path (verified SSO JWT carrying tenant+account+company claims for an
 * external IdP like BurnRateOS) plugs in here later without changing any
 * downstream code — it just produces a different (tenantId, segmentId).
 *
 * Segments are lazy-created on first sight (provisionedAt = now), exactly
 * like the spec's handshake.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { resolveCompanyScope, userCanAccessCompany } from "../company/scope.js";

const NATIVE_TENANT_SLUG = "hired-video";

export interface PeopleSegmentScope {
  tenantId: string;
  segmentId: string;
  /** The hired.video company this segment isolates (native path). */
  companyId: string;
  /** Mirrors the host plan; drives the paid entitlement gate. */
  plan: string;
  displayName: string;
}

export class SegmentResolutionError extends Error {
  constructor(
    public readonly code: "NO_COMPANY" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

export interface ResolveSegmentDeps {
  db: ReturnType<typeof getDb>;
  /** Companies the user may act on (owner-first). */
  getCompanyIdsForUser: (userId: string, explicit?: string | null) => Promise<{
    companyIds: string[];
    primaryCompanyId: string | null;
  }>;
  canAccessCompany: (userId: string, companyId: string) => Promise<boolean>;
  now: () => Date;
}

export function defaultResolveSegmentDeps(): ResolveSegmentDeps {
  const db = getDb();
  return {
    db,
    getCompanyIdsForUser: (userId, explicit) => resolveCompanyScope(userId, explicit),
    canAccessCompany: userCanAccessCompany,
    now: () => new Date(),
  };
}

/** Ensure the native `self` tenant row exists and return its id. The seed
 *  migration creates it; this is a defensive lazy-create for fresh / test
 *  databases. */
async function ensureNativeTenant(db: ReturnType<typeof getDb>): Promise<string> {
  const [existing] = await db
    .select({ id: schema.peopleTenants.id })
    .from(schema.peopleTenants)
    .where(eq(schema.peopleTenants.slug, NATIVE_TENANT_SLUG))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.peopleTenants)
    .values({ slug: NATIVE_TENANT_SLUG, name: "hired.video", kind: "self", status: "active" })
    .onConflictDoNothing({ target: schema.peopleTenants.slug })
    .returning({ id: schema.peopleTenants.id });
  if (created) return created.id;

  // Lost the race — re-read.
  const [row] = await db
    .select({ id: schema.peopleTenants.id })
    .from(schema.peopleTenants)
    .where(eq(schema.peopleTenants.slug, NATIVE_TENANT_SLUG))
    .limit(1);
  return row!.id;
}

/**
 * Resolve (tenantId, segmentId) for a native host user. Lazily provisions
 * the segment for the user's company on first sight.
 *
 * @param userId   the authenticated host user
 * @param explicitCompanyId optional — when the user belongs to >1 company
 *                 and the request names one. Must be in the user's scope.
 */
export async function resolveSegment(
  userId: string,
  explicitCompanyId?: string | null,
  deps: ResolveSegmentDeps = defaultResolveSegmentDeps(),
): Promise<PeopleSegmentScope> {
  const { db, now } = deps;

  // 1. Which company is this request scoped to?
  let companyId: string | null;
  if (explicitCompanyId) {
    const ok = await deps.canAccessCompany(userId, explicitCompanyId);
    if (!ok) {
      throw new SegmentResolutionError(
        "FORBIDDEN",
        "You do not have access to that company.",
      );
    }
    companyId = explicitCompanyId;
  } else {
    const scope = await deps.getCompanyIdsForUser(userId);
    companyId = scope.primaryCompanyId;
  }
  if (!companyId) {
    throw new SegmentResolutionError(
      "NO_COMPANY",
      "People Operations requires an employer company. Create a company profile first.",
    );
  }

  // 2 + 3. Self tenant + find/create the segment for (tenant, company).
  return resolveSegmentForCompany(companyId, deps);
}

/**
 * Resolve (tenantId, segmentId) for a company directly — no user. This is the
 * path used by the EMBED runtime, where a validated embed key (not a user
 * session) is the authorization. Ensures the native tenant + lazy-creates the
 * segment, identical to the user path.
 */
export async function resolveSegmentForCompany(
  companyId: string,
  deps: ResolveSegmentDeps = defaultResolveSegmentDeps(),
): Promise<PeopleSegmentScope> {
  const { db, now } = deps;
  const tenantId = await ensureNativeTenant(db);

  const [existing] = await db
    .select()
    .from(schema.peopleSegments)
    .where(
      and(
        eq(schema.peopleSegments.tenantId, tenantId),
        eq(schema.peopleSegments.companyId, companyId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      tenantId,
      segmentId: existing.id,
      companyId,
      plan: existing.plan,
      displayName: existing.displayName,
    };
  }

  // Pull the company for identity + display name.
  const [company] = await db
    .select({
      id: schema.companyProfiles.id,
      name: schema.companyProfiles.name,
      ownerId: schema.companyProfiles.ownerId,
    })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);
  if (!company) {
    throw new SegmentResolutionError("NO_COMPANY", "Company not found.");
  }

  const [created] = await db
    .insert(schema.peopleSegments)
    .values({
      tenantId,
      companyId: company.id,
      externalAccountId: company.ownerId,
      externalCompanyId: company.id,
      displayName: company.name,
      plan: "free",
      status: "active",
      provisionedAt: now(),
    })
    .onConflictDoNothing({
      target: [
        schema.peopleSegments.tenantId,
        schema.peopleSegments.externalAccountId,
        schema.peopleSegments.externalCompanyId,
      ],
    })
    .returning();

  if (created) {
    return {
      tenantId,
      segmentId: created.id,
      companyId,
      plan: created.plan,
      displayName: created.displayName,
    };
  }

  // Lost the race — re-read.
  const [row] = await db
    .select()
    .from(schema.peopleSegments)
    .where(
      and(
        eq(schema.peopleSegments.tenantId, tenantId),
        eq(schema.peopleSegments.companyId, companyId),
      ),
    )
    .limit(1);
  return {
    tenantId,
    segmentId: row!.id,
    companyId,
    plan: row!.plan,
    displayName: row!.displayName,
  };
}
