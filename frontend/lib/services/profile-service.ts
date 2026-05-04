/**
 * Profile service — frontend wrapper for /api/profile.
 *
 * Single source of truth for the user's billing/contact address. Read by
 * Checkout and Settings → Billing; written by both. Validated against
 * `BillingAddressSchema` before display so a corrupted server payload
 * surfaces as an error rather than silently rendering empty fields.
 */

import { apiClient } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@shared/api";
import {
  BillingAddressSchema,
  type BillingAddress,
} from "@shared/billing-address";

export type { BillingAddress };

export const profileService = {
  /** Returns the saved address, or null when the user has not set one yet. */
  async getBillingAddress(): Promise<BillingAddress | null> {
    const res: ApiSuccessResponse<{ billingAddress: BillingAddress | null }> =
      await apiClient.get("/api/profile/billing-address");
    const raw = res.data.billingAddress;
    if (!raw) return null;
    const parsed = BillingAddressSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },

  /** Persists the address and returns the canonical (normalised) version. */
  async saveBillingAddress(address: BillingAddress): Promise<BillingAddress> {
    const res: ApiSuccessResponse<{ billingAddress: BillingAddress }> =
      await apiClient.put("/api/profile/billing-address", address);
    return res.data.billingAddress;
  },
};
