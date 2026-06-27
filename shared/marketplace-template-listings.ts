/**
 * First-party RESUME template listings — single source of truth for the
 * *listing-level* copy (slug, name, industry, description) of the resume
 * presets hired.video publishes to the marketplace.
 *
 * Why this lives in `shared/` (a leaf module with zero runtime imports):
 *
 *   1. frontend/types/resume-template.ts — the resume preset descriptors
 *      consume `resumeListing(slug)` so the render copy and the marketplace
 *      copy never drift (DRY: one source for name/industry/description).
 *   2. api/src/routes/sitemap.ts — uses these slugs as the always-available
 *      fallback when the generated template manifest can't be fetched.
 *
 * The FULL static catalog (resume + studio-builtin) used by the prerender and
 * the sitemap is the generated `public/templates-manifest.json`, emitted by
 * frontend/scripts/generate-templates-manifest.mjs from the live registry —
 * so studio-builtin templates are covered without hand-duplicating
 * catalog.tsx's React-coupled data here. Creator-published templates (DB
 * `studio_templates` rows) are dynamic and enumerated straight from the
 * database by the sitemap.
 *
 * Adding a first-party resume template = add one entry here + reference it
 * from the descriptor in resume-template.ts.
 */

export type MarketplaceTemplateKind = "resume";

export interface MarketplaceTemplateListing {
  /** URL-safe slug — drives /marketplace/templates/<slug>. */
  slug: string;
  kind: MarketplaceTemplateKind;
  name: string;
  /** Display industry label, e.g. "Hospitality / Retail". */
  industry: string;
  /** Short marketing copy — the card blurb + meta description + JSON-LD. */
  description: string;
}

/**
 * The 12 first-party resume template presets. Order mirrors
 * `TEMPLATE_PRESETS` in frontend/types/resume-template.ts.
 */
export const RESUME_TEMPLATE_LISTINGS: MarketplaceTemplateListing[] = [
  {
    slug: "hired-default",
    kind: "resume",
    name: "Hired Video (Default)",
    industry: "All",
    description:
      "Signature hired.video layout — gradient hero with embedded video resume, timeline work history, and cross-section career overview.",
  },
  {
    slug: "payroll-iron-gray",
    kind: "resume",
    name: "Payroll & Finance — Iron Gray",
    industry: "Finance / Payroll",
    description:
      "Classic two-column print layout with sober serif headings — ATS-friendly for payroll, accounting, and financial analyst roles.",
  },
  {
    slug: "risk-asphalt",
    kind: "resume",
    name: "Risk & Consulting — Asphalt",
    industry: "Risk / Consulting",
    description:
      "Dark, assertive two-column layout with ALL-CAPS headings — signals gravitas for risk, audit, compliance, and consulting.",
  },
  {
    slug: "executive-taupe",
    kind: "resume",
    name: "Executive — Trusted Taupe",
    industry: "Executive / C-Suite",
    description:
      "Spacious single-column serif layout with elegant divider headings — built for CXO, VP, and Director-level narratives.",
  },
  {
    slug: "intern-education-first",
    kind: "resume",
    name: "New Grad — Education First",
    industry: "Intern / New Grad",
    description:
      "Education leads, projects and coursework shine — optimized for interns, recent grads, and anyone with limited work history.",
  },
  {
    slug: "hospitality-amber",
    kind: "resume",
    name: "Hospitality — Warm Amber",
    industry: "Hospitality / Retail",
    description:
      "Warm, approachable amber palette with ALL-CAPS headings — suited to hospitality, retail, customer success, and service roles.",
  },
  {
    slug: "creative-minimal",
    kind: "resume",
    name: "Creative — Minimal Slate",
    industry: "Creative / Product",
    description:
      "Ultra-minimal monospace layout with generous whitespace — product designers, creative directors, and indie makers.",
  },
  {
    slug: "software-engineer-graphite",
    kind: "resume",
    name: "Software Engineer — Dev Graphite",
    industry: "Software / Engineering",
    description:
      "Two-column developer-focused layout with monospace accents — tech stack and projects sidebar, achievement-led work history.",
  },
  {
    slug: "healthcare-clinical-blue",
    kind: "resume",
    name: "Healthcare — Clinical Blue",
    industry: "Healthcare / Clinical",
    description:
      "Credentials-forward two-column layout for nurses, physicians, and allied health — licenses and certifications above the fold.",
  },
  {
    slug: "sales-growth-emerald",
    kind: "resume",
    name: "Sales — Growth Emerald",
    industry: "Sales / Business Development",
    description:
      "Achievement-driven single-column layout with confident green accents — built for AEs, SDRs, sales leaders, and BD professionals.",
  },
  {
    slug: "actor-headshot-hero",
    kind: "resume",
    name: "Actor — Headshot Hero",
    industry: "Film / Theatre / Television",
    description:
      "Industry-standard actor one-pager — large headshot, projects-first credits (film / TV / theatre), training, special skills, reps + contact.",
  },
  {
    slug: "director-filmography-serif",
    kind: "resume",
    name: "Director — Filmography Serif",
    industry: "Film / Television",
    description:
      "Print-style directorial CV — filmography-led with festival selections and awards above the fold, classic serif with divider headings.",
  },
];

const BY_SLUG: Record<string, MarketplaceTemplateListing> = Object.fromEntries(
  RESUME_TEMPLATE_LISTINGS.map((l) => [l.slug, l]),
);

/**
 * Listing copy for a resume preset, by slug. The resume descriptors spread
 * the result into their own `{ name, industry, description }` so render copy
 * and marketplace copy stay byte-identical. Throws on an unknown slug — a
 * build-time guard against a descriptor referencing a missing listing.
 */
export function resumeListing(slug: string): {
  name: string;
  industry: string;
  description: string;
} {
  const l = BY_SLUG[slug];
  if (!l) {
    throw new Error(
      `resumeListing: no marketplace listing for resume preset "${slug}". ` +
        `Add it to RESUME_TEMPLATE_LISTINGS in shared/marketplace-template-listings.ts.`,
    );
  }
  return { name: l.name, industry: l.industry, description: l.description };
}
