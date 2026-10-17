/**
 * Shared shape for the user's billing / mailing address.
 *
 * Single source of truth for:
 *   - Checkout (pre-fills the form and persists what the buyer enters)
 *   - Settings → Billing (read/edit)
 *   - Services marketplace contact details (per-product reqs)
 *
 * Storage: the `billing_addresses` table (one row per user, mig 0631).
 * Owners read/write via /api/profile/billing-address.
 */

import { z } from "zod";
import { getPostalPattern } from "./postal-codes.js";

export const BillingAddressSchema = z
  .object({
    /** Full name on the address — used as the cardholder hint in Checkout. */
    fullName: z.string().trim().min(1).max(160),
    /** Optional company name (B2B invoices). */
    company: z.string().trim().max(160).optional().nullable(),
    /** Street line 1 (number + street). */
    line1: z.string().trim().min(1).max(200),
    /** Street line 2 (apt, suite, unit). */
    line2: z.string().trim().max(200).optional().nullable(),
    city: z.string().trim().min(1).max(100),
    /** State / province / region. Free-form to support every country. */
    state: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
    /** ISO 3166-1 alpha-2 country code (e.g. "US"). */
    country: z.string().trim().length(2).toUpperCase(),
    /** Optional contact phone. Helcim uses it for AVS — keep it loose. */
    phone: z.string().trim().max(40).optional().nullable(),
  })
  // Postal-code format check — branches on `country` via the shared pattern
  // table in shared/postal-codes.ts. Countries without a registered pattern
  // fall through to the legacy max-20-chars rule above.
  .superRefine((data, ctx) => {
    const pat = getPostalPattern(data.country);
    if (!pat) return;
    if (!pat.pattern.test(data.postalCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postalCode"],
        message: `Invalid postal code for ${data.country} — expected format: ${pat.placeholder}`,
      });
    }
  });

export type BillingAddress = z.infer<typeof BillingAddressSchema>;

/** Empty default — the shape Checkout / Settings starts from. */
export const EMPTY_BILLING_ADDRESS: BillingAddress = {
  fullName: "",
  company: null,
  line1: "",
  line2: null,
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  phone: null,
};
