/**
 * Company profile write use cases (create / update / delete / clone) behind
 * /api/companies. Metering + entitlement enforcement (servicesProcessor) need
 * the Hono context and stay in the route; everything else lives here.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { slugify } from "../../../../shared/slugify.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { buildApiDeps } from "../apiDeps.js";
import { LocationService } from "../location/LocationService.js";
import { logger } from "../../lib/logger.js";
import { headquartersDisplay, rowToCompanyMeta } from "./companyDto.js";
import {
  CompaniesRepository,
  type CompanyProfileInsert,
  type CompanyProfileRow,
} from "../../repositories/companiesRepository.js";
import { isCompanySlugTaken } from "../../repositories/companyDirectoryRepository.js";

type Env = Record<string, string | undefined>;
type CompanyBody = Record<string, any>;

function repo(): CompaniesRepository {
  return new CompaniesRepository(getDb());
}

// Create mirrors PUT's accepted field set so the builder can capture
// tagline / mission / values / benefits / etc. on first save — otherwise the
// user has to immediately bounce to /companies/edit/:id.
const WRITABLE_BASIC = ["description", "website", "logoUrl", "industry", "size", "foundedYear", "headquarters", "contact"] as const;
const WRITABLE_EXTENDED = ["tagline", "mission", "vision", "technologies", "perks", "culture", "values", "benefits"] as const;

function buildWritableFields(body: CompanyBody): Partial<CompanyProfileInsert> {
  const out: Partial<CompanyProfileInsert> = {};
  for (const key of WRITABLE_BASIC) if (key in body) out[key] = body[key];
  for (const key of WRITABLE_EXTENDED) if (key in body) out[key] = body[key];
  return out;
}

/** Fire-and-forget: tag a company's headquarters into `content_locations`
 *  (kind "company") so the structured geo filter on /public can match it
 *  (#1178). Resolves the display string through the same geocoder the rest
 *  of search uses; never blocks the write. */
export function tagCompanyGeo(env: Env, companyId: string, hq: CompanyProfileRow["headquarters"]): void {
  const display = headquartersDisplay(hq);
  if (!display) return;
  (async () => {
    try {
      const svc = new LocationService(buildApiDeps(env));
      const resolved = await svc.resolveFreeText(display);
      if (resolved) {
        await svc.setForEntity("company", companyId, {
          origin: {
            countryId: resolved.countryId ?? undefined,
            stateId: resolved.stateId ?? undefined,
            cityId: resolved.cityId ?? undefined,
            latitude: resolved.latitude ?? undefined,
            longitude: resolved.longitude ?? undefined,
            label: display,
          },
          serves: [],
        });
      }
    } catch (err) {
      logger.error("[company] geo tag failed", err);
    }
  })();
}

/** Insert a company owned by `ownerId`. Caller has already validated `name`
 *  and enforced the company_db_write entitlement. Returns the raw row (for
 *  metering) and the response DTO. */
export async function createCompany(ownerId: string, body: CompanyBody, env: Env) {
  // Legacy company-slug derivation (no NFKD, uncapped) — kept byte-identical.
  const slug = slugify(String(body.name), {
    fallback: "",
    maxLen: Number.POSITIVE_INFINITY,
    stripDiacritics: false,
  });
  const row = await repo().insertCompany({ ownerId, name: body.name, slug, ...buildWritableFields(body) });
  bumpSearchVersion();
  if (row?.id) tagCompanyGeo(env, row.id, row.headquarters);
  return { row, meta: rowToCompanyMeta(row) };
}

export async function updateCompany(companyId: string, body: CompanyBody, env: Env) {
  const updates: Partial<CompanyProfileInsert> = { ...buildWritableFields(body) };
  if ("name" in body) updates.name = body.name;
  const row = await repo().updateCompanyById(companyId, updates);
  bumpSearchVersion();
  if ("headquarters" in updates && row?.id) tagCompanyGeo(env, row.id, row.headquarters);
  return rowToCompanyMeta(row);
}

export async function deleteCompany(companyId: string): Promise<null> {
  await repo().deleteCompanyById(companyId);
  bumpSearchVersion();
  return null;
}

/** Load the company to clone, or throw 404. */
export async function findCompanyToClone(companyId: string): Promise<CompanyProfileRow> {
  const original = await repo().findCompanyById(companyId);
  if (!original) throw new DomainError(404, "NOT_FOUND", "Company not found");
  return original;
}

/** Duplicate `original` for `ownerId`. Name + slug get " (Copy)" /
 *  "-copy[-N]" suffixes; engagement + verification metadata reset; the clone
 *  starts inactive. Mirrors the job + resume + studio-project clone pattern. */
export async function cloneCompany(original: CompanyProfileRow, ownerId: string) {
  // Slug is uniquely constrained — derive from the cloned name, then append
  // a numeric suffix until we land on an unused slug. Caps at 50 attempts
  // to avoid a pathological loop on a degenerate name.
  const baseSlug = slugify(`${original.name}-copy`, {
    fallback: () => `company-${crypto.randomUUID().slice(0, 8)}`,
    maxLen: 50,
  });
  let candidateSlug: string | null = baseSlug;
  for (let i = 1; i <= 50; i++) {
    const test = i === 1 ? baseSlug : `${baseSlug}-${i}`;
    if (!(await isCompanySlugTaken(test))) { candidateSlug = test; break; }
    candidateSlug = null;
  }

  const {
    id: _omitId,
    createdAt: _omitCreated,
    updatedAt: _omitUpdated,
    isVerified: _omitVerified,
    featured: _omitFeatured,
    featuredUntil: _omitFeaturedUntil,
    featuredRankBoost: _omitFeaturedRank,
    reviewCount: _omitReviewCount,
    reviewAvgOverall: _omitReviewAvg,
    ...rest
  } = original;
  const clone = await repo().insertCompany({
    ...rest,
    ownerId,
    name: `${original.name} (Copy)`,
    slug: candidateSlug,
    isActive: false,
  });
  return { row: clone, meta: rowToCompanyMeta(clone) };
}
