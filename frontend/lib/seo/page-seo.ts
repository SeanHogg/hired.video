import type { SEOData } from "./types";
import { PAGE_SEO_MARKETING_CORE } from "./page-seo-data/marketing-core";
import { PAGE_SEO_PEOPLE_SECTORS } from "./page-seo-data/people-sectors";
import { PAGE_SEO_AUTH_COMPANY } from "./page-seo-data/auth-company";
import { PAGE_SEO_GUIDES_LEARNING } from "./page-seo-data/guides-learning";
import { PAGE_SEO_TOOLS_CONTACT } from "./page-seo-data/tools-contact";

/**
 * Page-specific SEO configurations. The single SEO store, keyed by
 * canonical route path. Data lives in per-area slices under
 * `./page-seo-data/`; they are spread here in their original order so the
 * key order of PAGE_SEO is unchanged.
 */
export const PAGE_SEO: Record<string, SEOData> = {
  ...PAGE_SEO_MARKETING_CORE,
  ...PAGE_SEO_PEOPLE_SECTORS,
  ...PAGE_SEO_AUTH_COMPANY,
  ...PAGE_SEO_GUIDES_LEARNING,
  ...PAGE_SEO_TOOLS_CONTACT,
};
