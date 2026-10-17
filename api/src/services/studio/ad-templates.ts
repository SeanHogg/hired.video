/**
 * Ad-optimised studio templates (GET /api/studio/ad-templates): the static
 * catalog plus the per-viewer listing (filtered by purpose; Pro-tier rows
 * flagged `locked` for free users). Split out of routes/studio.ts (W2-3a).
 */
import { TIER_ID, type AdTemplateTier } from "../../../../shared/tier-copy.js";
import { getSubscription } from "../billing/BillingService.js";

export interface AdTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tier: AdTemplateTier;
  readonly purpose: string;
  readonly style: { theme: string; color_palette: readonly string[]; font_style: string };
  readonly motion: "minimal" | "moderate" | "cinematic";
  readonly resolution: "720p" | "1080p";
  readonly previewUrl: string | null;
}

export const AD_TEMPLATES: readonly AdTemplate[] = [
  {
    id: "job-ad-bold",
    name: "Job Ad — Bold",
    description: "High-contrast job advertisement template with prominent CTA",
    tier: TIER_ID.free,
    purpose: "job_ad",
    style: { theme: "bold", color_palette: ["#1e1b4b", "#7c3aed", "#fbbf24"], font_style: "Poppins" },
    motion: "moderate",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "company-promo-clean",
    name: "Company Promo — Clean",
    description: "Professional brand video template for company promotions",
    tier: TIER_ID.free,
    purpose: "company_promo",
    style: { theme: "corporate", color_palette: ["#1e3a5f", "#3b82f6", "#f8fafc"], font_style: "Inter" },
    motion: "minimal",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "recruiter-brand-warm",
    name: "Recruiter Brand — Warm",
    description: "Personal brand template designed for recruiters and talent partners",
    tier: TIER_ID.free,
    purpose: "recruiter_brand",
    style: { theme: "warm", color_palette: ["#7c2d12", "#fb923c", "#fef3c7"], font_style: "Nunito" },
    motion: "moderate",
    resolution: "720p",
    previewUrl: null,
  },
  {
    id: "product-launch-neon",
    name: "Product Launch — Neon",
    description: "Energetic neon-accented template for product and feature launches",
    tier: TIER_ID.pro,
    purpose: "product_launch",
    style: { theme: "tech", color_palette: ["#030712", "#22d3ee", "#a3e635"], font_style: "JetBrains Mono" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
  {
    id: "testimonial-social",
    name: "Testimonial — Social",
    description: "9:16 vertical format optimised for social-first testimonial ads",
    tier: TIER_ID.pro,
    purpose: "company_promo",
    style: { theme: "social", color_palette: ["#18181b", "#f472b6", "#fbbf24"], font_style: "DM Sans" },
    motion: "cinematic",
    resolution: "1080p",
    previewUrl: null,
  },
];

/** The ad templates a user sees, optionally narrowed to one purpose. */
export async function listAdTemplatesForUser(
  userId: string,
  purpose: string | undefined,
): Promise<ReadonlyArray<AdTemplate | (AdTemplate & { locked: boolean })>> {
  const sub = await getSubscription(userId);
  let filtered = AD_TEMPLATES;
  if (purpose) filtered = filtered.filter((t) => t.purpose === purpose);
  return sub.isPro ? filtered : filtered.map((t) => ({ ...t, locked: t.tier === TIER_ID.pro }));
}
