// pricing-config-service — fetches the runtime-editable platform pricing
// config that an admin sets via /admin/pricing. Used by Pricing.tsx and
// any caller that needs the live Pro / per-seat prices instead of the
// shared/pricing.ts compile-time defaults.

import { apiClient } from "@/lib/api-client";

export interface PricingConfig {
  proMonthlyCents: number;
  proYearlyCents: number;
  seatPriceCents: number;
  updatedAt: string | null;
}

export const pricingConfigService = {
  /** Public read — works for unauthenticated callers. */
  async get(): Promise<PricingConfig> {
    const response = await apiClient.get<PricingConfig>("/api/billing/pricing-config");
    return response.data;
  },

  /** SuperAdmin write — used by /admin/pricing. */
  async update(input: {
    proMonthlyCents: number;
    proYearlyCents: number;
    seatPriceCents: number;
  }): Promise<PricingConfig> {
    const response = await apiClient.patch<PricingConfig>("/api/admin/pricing", input);
    return response.data;
  },
};
