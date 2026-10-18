/**
 * White-label tenants (#75), university partner analytics (#79) and the B2B
 * demo-request lead capture (#80). Route: routes/whitelabel.ts.
 *
 * Tenants live in `whitelabel_tenants` (PlatformRepository); demo requests
 * are `marketing_leads` rows (MarketingRepository).
 */
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import {
  PlatformRepository,
  type WhitelabelPortalBranding,
  type WhitelabelTenantInsert,
  type WhitelabelTenantRow,
  type WhitelabelTenantSummary,
} from "../../repositories/platformRepository.js";
import { MarketingRepository } from "../../repositories/marketingRepository.js";
import { JobsRepository } from "../../repositories/jobsRepository.js";
import { aggregateAllPlacements } from "../../repositories/placementsRepository.js";

export const TenantSchema = z.object({
  name: z.string().min(1).max(255),
  subdomain: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/),
  tenantType: z.enum(["agency", "university", "staffing_firm", "bootcamp"]).default("agency"),
  // Branding
  primaryColor: z.string().max(20).optional(),
  logoUrl: z.string().url().optional().nullable(),
  heroHeadline: z.string().max(200).optional().nullable(),
  // Billing
  planTier: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  monthlyFeeUsd: z.number().min(0).optional(),
  // Contact
  contactEmail: z.string().email().optional(),
  website: z.string().url().optional().nullable(),
});
export type TenantInput = z.infer<typeof TenantSchema>;
export type TenantPatch = Partial<TenantInput>;

const TENANT_LIST_LIMIT = 100;

const tenantNotFound = () => new DomainError(404, "NOT_FOUND", "Tenant not found");

const platform = () => new PlatformRepository(getDb());

/** `monthly_fee_usd` is numeric in Postgres; the body carries a number. */
function toColumns<T extends TenantPatch>(input: T): Omit<T, "monthlyFeeUsd"> & { monthlyFeeUsd?: string } {
  const { monthlyFeeUsd, ...rest } = input;
  return { ...rest, ...(monthlyFeeUsd !== undefined ? { monthlyFeeUsd: String(monthlyFeeUsd) } : {}) };
}

export function listTenants(): Promise<WhitelabelTenantSummary[]> {
  return platform().listTenantSummaries(TENANT_LIST_LIMIT);
}

export async function createTenant(ownerId: string, input: TenantInput): Promise<WhitelabelTenantRow> {
  const repo = platform();
  if (await repo.isSubdomainTaken(input.subdomain)) {
    throw new DomainError(409, "CONFLICT", `Subdomain '${input.subdomain}' is already taken`);
  }
  return repo.insertTenant({ ownerId, ...toColumns(input), isActive: true } as WhitelabelTenantInsert);
}

export async function getOwnedTenant(id: string, ownerId: string): Promise<WhitelabelTenantRow> {
  const tenant = await platform().findOwnedTenant(id, ownerId);
  if (!tenant) throw tenantNotFound();
  return tenant;
}

export async function updateOwnedTenant(id: string, ownerId: string, patch: TenantPatch): Promise<WhitelabelTenantRow> {
  const repo = platform();
  const existing = await repo.findOwnedTenant(id, ownerId);
  if (!existing) throw tenantNotFound();
  return repo.updateTenant(existing.id, toColumns(patch) as Partial<WhitelabelTenantInsert>);
}

export async function getPortalBranding(subdomain: string): Promise<WhitelabelPortalBranding> {
  const portal = await platform().findActivePortalBySubdomain(subdomain);
  if (!portal) throw new DomainError(404, "NOT_FOUND", "Portal not found");
  return portal;
}

/**
 * Placement analytics for a university/bootcamp partner portal. Figures are
 * platform-wide until candidates carry a tenant attribution.
 */
export async function getTenantAnalytics(id: string, ownerId: string) {
  const db = getDb();
  const tenant = await new PlatformRepository(db).findTenantById(id);
  if (!tenant || tenant.ownerId !== ownerId) throw new DomainError(403, "FORBIDDEN", "Access denied");

  const [placementAgg, activeJobs] = await Promise.all([
    aggregateAllPlacements().catch(() => ({ total: 0, avgSalary: null })),
    new JobsRepository(db).countActiveJobs().catch(() => 0),
  ]);

  return {
    tenantId: tenant.id,
    placements: placementAgg.total,
    avgPlacementSalary: placementAgg.avgSalary ? Number(placementAgg.avgSalary).toFixed(0) : null,
    activeJobListings: activeJobs,
    // In production: filter by tenantId on job/user join table
    generatedAt: new Date().toISOString(),
  };
}

export interface DemoRequestInput {
  email: string;
  company: string;
  name: unknown;
  useCase: unknown;
  teamSize: unknown;
  phone: unknown;
}

/** Capture a "Request a demo" prospect as a marketing lead (best effort). */
export async function recordDemoRequest(input: DemoRequestInput): Promise<void> {
  await new MarketingRepository(getDb())
    .insertMarketingLead({
      email: input.email,
      company: input.company || null,
      source: "demo_request",
      metadata: {
        company: input.company,
        name: input.name ?? null,
        useCase: input.useCase ?? null,
        teamSize: input.teamSize ?? null,
        phone: input.phone ?? null,
      },
    })
    .catch((err: unknown) => logger.warn("[whitelabel/demo-request] lead insert failed", err));
}
