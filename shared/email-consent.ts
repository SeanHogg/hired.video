/**
 * Email marketing consent SSoT — shared by the API (consent service, send
 * paths, preference routes) and the frontend (preference center, Settings
 * panel). Owns the marketing category taxonomy and the opt-out resolution
 * rules so every surface agrees on "is this address mailable for category X".
 *
 * Consent model: OPT-OUT (CAN-SPAM). Everyone is mailable by default until
 * they opt out; an opt-out is sticky and email-keyed, and the ONLY thing that
 * may reverse it is an explicit user action in the preference center. Region-
 * aware double-opt-in (EEA / Quebec) is a roadmap follow-up — see the gap
 * register.
 *
 * Transactional email (verification, password reset, 2FA, magic link,
 * interview invites) is exempt and NEVER routes through this gate — only
 * marketing email (campaigns + nurture drips) does.
 */
import { z } from "zod";

// ─── Category taxonomy ──────────────────────────────────────────────────────
// Job alerts are intentionally NOT here — they keep their own existing toggle
// (user_settings.jobAlertEmailsEnabled).
export const MARKETING_CATEGORIES = [
  "tips_coaching",
  "product_launches",
  "events_webinars",
  "promotions_pricing",
] as const;
export type MarketingCategory = (typeof MARKETING_CATEGORIES)[number];

export const MARKETING_CATEGORY_LABELS: Record<MarketingCategory, string> = {
  tips_coaching: "Tips & coaching",
  product_launches: "Product news & launches",
  events_webinars: "Events & webinars",
  promotions_pricing: "Promotions & pricing",
};

export const MARKETING_CATEGORY_DESCRIPTIONS: Record<MarketingCategory, string> = {
  tips_coaching: "Career, sourcing and hiring how-to content tailored to your role.",
  product_launches: "New features, product updates, and the monthly digest.",
  events_webinars: "Invitations to live sessions, webinars and events.",
  promotions_pricing: "Upgrade offers, seat/pack promotions and discounts.",
};

/** Campaigns that don't pick a category fall here. */
export const DEFAULT_MARKETING_CATEGORY: MarketingCategory = "product_launches";

export function isMarketingCategory(v: unknown): v is MarketingCategory {
  return typeof v === "string" && (MARKETING_CATEGORIES as readonly string[]).includes(v);
}

// ─── Stored shape + resolution ──────────────────────────────────────────────
// The DB stores an explicit opt-out map: `categories[cat] === false` means the
// user opted OUT of that category. Missing/true = subscribed (opt-out default).
export type StoredCategoryPrefs = Record<string, boolean> | null | undefined;

/**
 * The single mailability rule, shared by send paths (server) and the
 * preference UI (client). `category` null/omitted = check only the master
 * switch (used by 1:1 nurture drips that have no category).
 *
 * NOTE: hard suppressions (bounces/complaints) are an additional server-only
 * gate layered on top of this — see MarketingConsentService.
 */
export function isCategoryMailable(
  stored: StoredCategoryPrefs,
  unsubscribedAll: boolean,
  category?: MarketingCategory | null,
): boolean {
  if (unsubscribedAll) return false;
  if (!category) return true;
  return stored?.[category] !== false;
}

/** Resolve stored opt-outs into per-category SUBSCRIBED booleans for the UI. */
export function resolveCategorySubscriptions(
  stored: StoredCategoryPrefs,
  unsubscribedAll: boolean,
): Record<MarketingCategory, boolean> {
  const out = {} as Record<MarketingCategory, boolean>;
  for (const c of MARKETING_CATEGORIES) {
    out[c] = unsubscribedAll ? false : stored?.[c] !== false;
  }
  return out;
}

// ─── Wire DTO + update schema ────────────────────────────────────────────────
export interface EmailMarketingPreferencesDTO {
  /** Masked for display (j•••@acme.com) — the token is the bearer credential. */
  email: string;
  unsubscribedAll: boolean;
  /** Per-category SUBSCRIBED booleans (true = receiving). */
  categories: Record<MarketingCategory, boolean>;
  updatedAt: string | null;
}

export const UpdatePreferencesSchema = z.object({
  unsubscribedAll: z.boolean().optional(),
  /** Per-category SUBSCRIBED booleans (true = subscribe, false = opt out).
   *  Unknown keys are ignored server-side. */
  categories: z.record(z.string(), z.boolean()).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;

// ─── Email masking ──────────────────────────────────────────────────────────
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(1, local.length - 1))}@${domain}`;
}
