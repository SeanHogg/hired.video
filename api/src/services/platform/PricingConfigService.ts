/**
 * PricingConfigService — single source of truth for the runtime-editable
 * platform prices. Reads from `platform_pricing` (single-row config) through
 * the canonical edge cache (`getOrSetCached`, key `pricing-config:v1`, 3600s).
 * Writes invalidate the cache.
 *
 * Used by:
 *   - api/src/routes/billing.ts company-seat updates (replaces SEAT_PRICES)
 *   - api/src/routes/admin/pricing-config.ts public read endpoint
 *   - api/src/routes/admin/pricing-config.ts SuperAdmin patch endpoint
 *
 * The hardcoded fallback mirrors `shared/pricing.ts` so the system keeps
 * working before the singleton row is seeded.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import {
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
  SEAT_PRICE_CENTS,
} from "../../../../shared/pricing.js";

export interface PricingConfig {
  proMonthlyCents: number;
  proYearlyCents: number;
  seatPriceCents: number;
  updatedAt: string | null;
}

const SINGLETON_ID = "singleton";
const PRICING_CACHE_KEY = "pricing-config:v1";
// 3600s: the SA pricing write invalidates — every write path invalidates explicitly; long TTL = few KV refills.
const PRICING_CACHE_TTL_SECONDS = 3600;

function defaults(): PricingConfig {
  return {
    proMonthlyCents: Math.round(PRO_MONTHLY_PRICE * 100),
    proYearlyCents: Math.round(PRO_YEARLY_PRICE * 100),
    // Seats are priced independently of Pro (SEAT_PRICE_CENTS).
    seatPriceCents: SEAT_PRICE_CENTS,
    updatedAt: null,
  };
}

export function getPricingConfig(): Promise<PricingConfig> {
  // PricingConfig is JSON-safe (updatedAt already an ISO string) — no revive.
  return getOrSetCached({
    key: PRICING_CACHE_KEY,
    ttlSeconds: PRICING_CACHE_TTL_SECONDS,
    loader: loadPricingConfig,
  });
}

async function loadPricingConfig(): Promise<PricingConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.platformPricing)
    .where(eq(schema.platformPricing.id, SINGLETON_ID))
    .limit(1);

  const value: PricingConfig = row
    ? {
        proMonthlyCents: row.proMonthlyCents,
        proYearlyCents: row.proYearlyCents,
        seatPriceCents: row.seatPriceCents,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ""),
      }
    : defaults();

  return value;
}

export interface UpdatePricingInput {
  proMonthlyCents: number;
  proYearlyCents: number;
  seatPriceCents: number;
  updatedByUserId: string | null;
}

export async function updatePricingConfig(input: UpdatePricingInput): Promise<PricingConfig> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(schema.platformPricing)
    .values({
      id: SINGLETON_ID,
      proMonthlyCents: input.proMonthlyCents,
      proYearlyCents: input.proYearlyCents,
      seatPriceCents: input.seatPriceCents,
      updatedAt: now,
      updatedByUserId: input.updatedByUserId,
    } as typeof schema.platformPricing.$inferInsert)
    .onConflictDoUpdate({
      target: schema.platformPricing.id,
      set: {
        proMonthlyCents: input.proMonthlyCents,
        proYearlyCents: input.proYearlyCents,
        seatPriceCents: input.seatPriceCents,
        updatedAt: now,
        updatedByUserId: input.updatedByUserId,
      } as Partial<typeof schema.platformPricing.$inferInsert>,
    })
    .returning();

  invalidatePricingConfigCache();
  return {
    proMonthlyCents: row.proMonthlyCents,
    proYearlyCents: row.proYearlyCents,
    seatPriceCents: row.seatPriceCents,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ""),
  };
}

export function invalidatePricingConfigCache(): void {
  invalidateCachedKey(PRICING_CACHE_KEY);
}
