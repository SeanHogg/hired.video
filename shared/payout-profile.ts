/**
 * Payout Profile — single source of truth for the entity-type / tax-form
 * shape that creators fill out in Settings → Payouts (or in their Creator
 * Workspace) before they can be paid. Imported by the API (`routes/creators.ts`
 * exposes GET/PATCH `/me/payout-profile`) and by the frontend (`creator-service.ts`
 * wraps the calls; the shared `PayoutProfileForm` component is embedded
 * unchanged in both surfaces).
 *
 * Storage sits at the user level (`payout_profiles` keyed by user_id) NOT the
 * per-creator-profile-row level — taxes follow the person, and re-enrolling
 * in the Creator Program after a cancel must not require re-filing a W-9.
 */

export const ENTITY_TYPES = ["individual", "business"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// US-domestic IDs vs. foreign TIN. The form picker on the frontend is
// `taxResidencyCountry`-driven: residents file W-9 with SSN/EIN/ITIN;
// non-residents file W-8 with the foreign-tax-authority TIN.
export const TAX_ID_TYPES = ["ssn", "ein", "itin", "foreign_tin"] as const;
export type TaxIdType = (typeof TAX_ID_TYPES)[number];

// W-9 = US person (incl. resident aliens). W-8BEN = foreign individual.
// W-8BEN-E = foreign entity. The frontend never asks the user to choose
// directly — it derives from `entityType` × `taxResidencyCountry`.
export const TAX_FORM_TYPES = ["w9", "w8ben", "w8bene"] as const;
export type TaxFormType = (typeof TAX_FORM_TYPES)[number];

// Outbound payout rails. `helcim_ach` pushes funds to a tokenised US bank
// account (collected via HelcimPay verify flow). `tremendous` sends a gift-card
// link to the recipient's email — globally available, no bank details needed.
// `manual` is the admin-driven fallback (out-of-band ACH / wire / check).
// `stripe` / `helcim` are historic values left in the enum so existing rows
// validate while we backfill — they were never wired as outbound rails.
export const PAYOUT_PROVIDERS = [
  "helcim_ach",
  "tremendous",
  "manual",
  "stripe",
  "helcim",
] as const;
export type PayoutProvider = (typeof PAYOUT_PROVIDERS)[number];

// Subset surfaced in the onboarding picker. The legacy values are intentionally
// excluded — UI offers only rails the platform actually moves money on.
export const ACTIVE_PAYOUT_PROVIDERS = ["helcim_ach", "tremendous", "manual"] as const;
export type ActivePayoutProvider = (typeof ACTIVE_PAYOUT_PROVIDERS)[number];

export function isActivePayoutProvider(p: string | null | undefined): p is ActivePayoutProvider {
  return !!p && (ACTIVE_PAYOUT_PROVIDERS as readonly string[]).includes(p);
}

export interface PayoutProfileDTO {
  id: string;
  userId: string;

  entityType: EntityType | null;
  legalName: string | null;
  businessLegalName: string | null;

  taxResidencyCountry: string | null;
  taxIdType: TaxIdType | null;
  taxIdLast4: string | null;
  taxFormType: TaxFormType | null;
  taxFormSubmittedAt: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;

  payoutProvider: PayoutProvider | null;
  payoutAccountId: string | null;
  payoutOnboardedAt: string | null;
  payoutCountry: string | null;
  payoutCurrency: string;

  createdAt: string;
  updatedAt: string;
}

export interface PayoutProfileUpdateInput {
  entityType?: EntityType;
  legalName?: string;
  businessLegalName?: string | null;
  taxResidencyCountry?: string;
  taxIdType?: TaxIdType;
  // The frontend posts the FULL tax ID once on submit; the server stores the
  // last 4 in `taxIdLast4` and the encrypted full value in `taxIdEncrypted`.
  // Encryption-at-rest is currently a TODO — see Gap Register.
  taxId?: string;
  taxFormType?: TaxFormType;
  addressLine1?: string;
  addressLine2?: string | null;
  addressCity?: string;
  addressRegion?: string;
  addressPostalCode?: string;
  addressCountry?: string;
  payoutProvider?: PayoutProvider;
  payoutAccountId?: string;
  payoutCountry?: string;
  payoutCurrency?: string;
}

// Derive the correct tax-form kind from entityType × tax residency. Pure;
// shared between the form's "Which form will you sign?" preview and the
// server validator that confirms the chosen form matches the entity.
export function deriveTaxFormType(
  entityType: EntityType,
  taxResidencyCountry: string,
): TaxFormType {
  if (taxResidencyCountry === "US") return "w9";
  return entityType === "business" ? "w8bene" : "w8ben";
}

// ---------------------------------------------------------------------------
// Outbound onboarding + balance DTOs
// ---------------------------------------------------------------------------

// Returned by POST /api/payouts/me/onboarding/start. The shape varies by rail:
//   helcim_ach  — `checkoutToken` + `sdkScriptUrl` for HelcimPay verify flow
//   tremendous  — no token; the picker just records recipientEmail and POSTs
//                 directly to /complete (the email IS the account reference)
//   manual      — no-op; status flips to onboarded on /complete
export interface PayoutOnboardingSessionDTO {
  provider: ActivePayoutProvider;
  flowType: "embedded" | "email" | "manual";
  checkoutToken?: string;
  sdkScriptUrl?: string;
  helcimJsConfig?: {
    token: string;
    scriptUrl: string;
  };
}

// Posted to POST /api/payouts/me/onboarding/complete.
// `helcim_ach` — providerAccountId is the bankToken returned by HelcimPay
//                success postMessage; hint carries last4 + bankName for UI.
// `tremendous` — providerAccountId is the recipient's email; no hint needed.
// `manual`     — providerAccountId is a free-text reference (e.g. "ACH ref 123")
export interface PayoutOnboardingCompleteInput {
  provider: ActivePayoutProvider;
  providerAccountId: string;
  hint?: {
    last4?: string;
    bankName?: string;
    accountType?: string;
  };
}

// Returned by GET /api/payouts/me/balance.
// `availableCents` is `accruedCents - reservedCents - paidCents`, computed
// from the ledger (NOT from the deprecated creator_profiles.totalEarnedCents
// counter). The cron release worker reads this value to decide whether the
// creator is above the configured min-payout-threshold.
export interface PayoutBalanceDTO {
  accruedCents: number;
  reservedCents: number;
  paidCents: number;
  availableCents: number;
  currency: string;
  minPayoutThresholdCents: number;
  isAboveThreshold: boolean;
}
