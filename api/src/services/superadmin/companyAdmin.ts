/**
 * SuperAdmin company administration — list ALL companies (not owner-scoped),
 * create + manage them, flip visibility (spam/suspend via is_active), and
 * "walk the tree" of per-company features (subscription, token pool, seats,
 * CHRO segment, integrations, embedding) plus drill into the company's
 * employees / resumes / jobs.
 *
 * Reuses the existing per-company foundations (company_subscriptions,
 * company_token_balance, user_company_role_associations, people_segments,
 * people_employees, company_integrations, company_embed_keys, job_items,
 * candidate_resumes) — no new storage. SA auth is enforced upstream by
 * superAdminMiddleware on the route.
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const {
  companyProfiles,
  users,
  userCompanyRoleAssociations,
  companySubscriptions,
  companyTokenBalance,
  companyIntegrations,
  companyEmbedKeys,
  peopleSegments,
  peopleEmployees,
  jobItems,
  candidateResumes,
} = schema;

export type CompanyStatus = "all" | "active" | "suspended" | "verified" | "unverified";

export interface ListCompaniesParams {
  search?: string;
  status?: CompanyStatus;
  page?: number;
  limit?: number;
}

export interface CompanyListRow {
  id: string;
  name: string;
  slug: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  isActive: boolean;
  isVerified: boolean;
  embedEnabled: boolean;
  createdAt: Date;
}

export async function listCompanies(
  params: ListCompaniesParams,
  db = getDb(),
): Promise<{ companies: CompanyListRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const conds = [];
  if (params.search) {
    const like = `%${params.search}%`;
    conds.push(or(ilike(companyProfiles.name, like), ilike(companyProfiles.slug, like)));
  }
  switch (params.status) {
    case "active":
      conds.push(eq(companyProfiles.isActive, true));
      break;
    case "suspended":
      conds.push(eq(companyProfiles.isActive, false));
      break;
    case "verified":
      conds.push(eq(companyProfiles.isVerified, true));
      break;
    case "unverified":
      conds.push(eq(companyProfiles.isVerified, false));
      break;
    default:
      break;
  }
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: companyProfiles.id,
      name: companyProfiles.name,
      slug: companyProfiles.slug,
      ownerId: companyProfiles.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
      isActive: companyProfiles.isActive,
      isVerified: companyProfiles.isVerified,
      embedEnabled: companyProfiles.embedEnabled,
      createdAt: companyProfiles.createdAt,
    })
    .from(companyProfiles)
    .leftJoin(users, eq(users.id, companyProfiles.ownerId))
    .where(where)
    .orderBy(desc(companyProfiles.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyProfiles)
    .where(where);

  return { companies: rows as CompanyListRow[], total: Number(count), page, limit };
}

/** The per-company feature tree — every entitlement/feature surface we've
 *  added, in one structured payload. */
export interface CompanyFeatureTree {
  company: {
    id: string;
    name: string;
    slug: string | null;
    isActive: boolean;
    isVerified: boolean;
    embedEnabled: boolean;
    featured: boolean;
  };
  subscription: { planTier: string; status: string; seatCount: number; seatLimit: number; pricePerSeatCents: number } | null;
  tokenPool: { balance: number; lifetimeGranted: number; lifetimeConsumed: number } | null;
  seats: { activeMembers: number; employees: number };
  peopleOps: { segmentId: string; plan: string; status: string; employees: number } | null;
  integrations: { provider: string; status: string; lastSyncAt: Date | null }[];
  embedding: { enabled: boolean; activeKeys: number };
  counts: { jobs: number; resumes: number };
}

async function count(db: ReturnType<typeof getDb>, table: any, where: any): Promise<number> {
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(table).where(where);
  return Number(c);
}

export async function getCompanyFeatureTree(
  companyId: string,
  db = getDb(),
): Promise<CompanyFeatureTree | null> {
  const [company] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyId))
    .limit(1);
  if (!company) return null;

  const [sub] = await db
    .select()
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .limit(1);

  const [pool] = await db
    .select()
    .from(companyTokenBalance)
    .where(eq(companyTokenBalance.companyId, companyId))
    .limit(1);

  const activeMembers = await count(
    db,
    userCompanyRoleAssociations,
    and(eq(userCompanyRoleAssociations.companyId, companyId), eq(userCompanyRoleAssociations.isActive, true)),
  );
  const employeeMembers = await count(
    db,
    userCompanyRoleAssociations,
    and(
      eq(userCompanyRoleAssociations.companyId, companyId),
      eq(userCompanyRoleAssociations.isActive, true),
      eq(userCompanyRoleAssociations.role, "employee"),
    ),
  );

  const [segment] = await db
    .select()
    .from(peopleSegments)
    .where(eq(peopleSegments.companyId, companyId))
    .limit(1);
  const segmentEmployees = segment
    ? await count(db, peopleEmployees, eq(peopleEmployees.segmentId, segment.id))
    : 0;

  const integrations = await db
    .select({ provider: companyIntegrations.provider, status: companyIntegrations.status, lastSyncAt: companyIntegrations.lastSyncAt })
    .from(companyIntegrations)
    .where(eq(companyIntegrations.companyId, companyId));

  const activeEmbedKeys = await count(
    db,
    companyEmbedKeys,
    and(eq(companyEmbedKeys.companyId, companyId), eq(companyEmbedKeys.isActive, true)),
  );

  const jobs = await count(db, jobItems, eq(jobItems.companyId, companyId));
  const resumes = await count(db, candidateResumes, eq(candidateResumes.companyId, companyId));

  return {
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      isActive: company.isActive,
      isVerified: company.isVerified,
      embedEnabled: company.embedEnabled,
      featured: company.featured,
    },
    subscription: sub
      ? {
          planTier: sub.planTier,
          status: sub.status,
          seatCount: sub.seatCount,
          seatLimit: sub.seatLimit,
          pricePerSeatCents: sub.pricePerSeatCents,
        }
      : null,
    tokenPool: pool
      ? { balance: pool.balance, lifetimeGranted: pool.lifetimeGranted, lifetimeConsumed: pool.lifetimeConsumed }
      : null,
    seats: { activeMembers, employees: employeeMembers },
    peopleOps: segment
      ? { segmentId: segment.id, plan: segment.plan, status: segment.status, employees: segmentEmployees }
      : null,
    integrations,
    embedding: { enabled: company.embedEnabled, activeKeys: activeEmbedKeys },
    counts: { jobs, resumes },
  };
}

// ── Drill-down lists ─────────────────────────────────────────────────────────
export async function getCompanyEmployees(companyId: string, db = getDb()) {
  const [segment] = await db
    .select({ id: peopleSegments.id })
    .from(peopleSegments)
    .where(eq(peopleSegments.companyId, companyId))
    .limit(1);
  // Always include the association-backed members; include the CHRO roster
  // rows when a People-Ops segment exists.
  const members = await db
    .select({
      userId: userCompanyRoleAssociations.userId,
      role: userCompanyRoleAssociations.role,
      isActive: userCompanyRoleAssociations.isActive,
      name: users.name,
      email: users.email,
    })
    .from(userCompanyRoleAssociations)
    .leftJoin(users, eq(users.id, userCompanyRoleAssociations.userId))
    .where(eq(userCompanyRoleAssociations.companyId, companyId));
  const roster = segment
    ? await db.select().from(peopleEmployees).where(eq(peopleEmployees.segmentId, segment.id))
    : [];
  return { members, roster };
}

export async function getCompanyJobs(companyId: string, db = getDb()) {
  return db
    .select({
      id: jobItems.id,
      title: jobItems.title,
      isActive: jobItems.isActive,
      createdAt: jobItems.createdAt,
    })
    .from(jobItems)
    .where(eq(jobItems.companyId, companyId))
    .orderBy(desc(jobItems.createdAt))
    .limit(200);
}

export async function getCompanyResumes(companyId: string, db = getDb()) {
  return db
    .select()
    .from(candidateResumes)
    .where(eq(candidateResumes.companyId, companyId))
    .orderBy(desc(candidateResumes.createdAt))
    .limit(200);
}

// ── Mutations ────────────────────────────────────────────────────────────────
export interface CreateCompanyInput {
  name: string;
  ownerId: string;
  slug?: string;
  description?: string;
  isVerified?: boolean;
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90);
}

export async function adminCreateCompany(input: CreateCompanyInput, db = getDb()) {
  const slug = input.slug?.trim() || toSlug(input.name);
  const [row] = await db
    .insert(companyProfiles)
    .values({
      name: input.name,
      ownerId: input.ownerId,
      slug,
      description: input.description ?? null,
      isVerified: input.isVerified ?? false,
      isActive: true,
    })
    .returning();
  // Owner membership row (mirrors seed/ensureCompanyMembership).
  await db
    .insert(userCompanyRoleAssociations)
    .values({ userId: input.ownerId, companyId: row.id, role: "owner", isActive: true })
    .onConflictDoNothing();
  return row;
}

export interface UpdateCompanyStatusInput {
  isActive?: boolean;
  isVerified?: boolean;
  embedEnabled?: boolean;
  featured?: boolean;
}

export async function adminUpdateCompanyStatus(
  companyId: string,
  patch: UpdateCompanyStatusInput,
  db = getDb(),
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.isVerified !== undefined) set.isVerified = patch.isVerified;
  if (patch.embedEnabled !== undefined) set.embedEnabled = patch.embedEnabled;
  if (patch.featured !== undefined) set.featured = patch.featured;
  const [row] = await db
    .update(companyProfiles)
    .set(set)
    .where(eq(companyProfiles.id, companyId))
    .returning();
  return row ?? null;
}

export { inArray };
