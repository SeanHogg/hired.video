/**
 * RecruitBrandingRepository — the read projections the agency recruiting
 * surface (/api/recruit, gap #99) needs from `company_profiles` and
 * `whitelabel_tenants` (brand kits): the caller's company picker, their
 * own brand kits, and the public brand overlay on shared résumés / decks.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { companyProfiles, whitelabelTenants } = schema;

export interface RecruitCompanySummary {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface BrandKitSummary {
  id: string;
  ownerId: string;
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
}

/** The public brand overlay rendered on a shared résumé / pitch deck. */
export interface PublicBrand {
  name: string;
  subdomain: string;
  primaryColor: string | null;
  logoUrl: string | null;
  heroHeadline: string | null;
  website: string | null;
  contactEmail: string | null;
}

export async function findCompanySummariesByIds(ids: string[]): Promise<RecruitCompanySummary[]> {
  return getDb()
    .select({ id: companyProfiles.id, name: companyProfiles.name, logoUrl: companyProfiles.logoUrl })
    .from(companyProfiles)
    .where(inArray(companyProfiles.id, ids));
}

export async function findBrandKitsForOwner(ownerId: string): Promise<BrandKitSummary[]> {
  return getDb()
    .select({
      id: whitelabelTenants.id,
      ownerId: whitelabelTenants.ownerId,
      name: whitelabelTenants.name,
      subdomain: whitelabelTenants.subdomain,
      primaryColor: whitelabelTenants.primaryColor,
      logoUrl: whitelabelTenants.logoUrl,
    })
    .from(whitelabelTenants)
    .where(eq(whitelabelTenants.ownerId, ownerId));
}

/** Brand overlay for a share (null when the tenant id is unset or gone). */
export async function findPublicBrand(tenantId: string | null): Promise<PublicBrand | null> {
  if (!tenantId) return null;
  const [row] = await getDb()
    .select({
      name: whitelabelTenants.name,
      subdomain: whitelabelTenants.subdomain,
      primaryColor: whitelabelTenants.primaryColor,
      logoUrl: whitelabelTenants.logoUrl,
      heroHeadline: whitelabelTenants.heroHeadline,
      website: whitelabelTenants.website,
      contactEmail: whitelabelTenants.contactEmail,
    })
    .from(whitelabelTenants)
    .where(eq(whitelabelTenants.id, tenantId))
    .limit(1);
  return row ?? null;
}
