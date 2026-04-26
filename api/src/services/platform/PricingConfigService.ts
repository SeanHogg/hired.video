/**
 * PricingConfigService — single source of truth for the runtime-editable
 * platform prices. Reads from `platform_pricing` (single-row config) with a
 * 60-second in-process cache. Writes invalidate the cache.
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
import {
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
} from "../../../../shared/pricing.js";

export interface PricingConfig {
  proMonthlyCents: number;
  proYearlyCents: number;
  seatPriceCents: number;
  updatedAt: string | null;
}

const SINGLETON_ID = "singleton";
const CACHE_TTL_MS = 60_000;

let cached: { value: PricingConfig; expiresAt: number } | null = null;

function defaults(): PricingConfig {
  return {
    proMonthlyCents: Math.round(PRO_MONTHLY_PRICE * 100),
    proYearlyCents: Math.round(PRO_YEARLY_PRICE * 100),
    seatPriceCents: Math.round(PRO_MONTHLY_PRICE * 100),
    updatedAt: null,
  };
}

export async function getPricingConfig(): Promise<PricingConfig> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

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

  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
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
  cached = null;
}
