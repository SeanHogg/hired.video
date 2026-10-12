/**
 * The registries the marketing sitemap + /for/:audience prerender are
 * generated from (#920), projected to plain data. Loaded at build time by
 * scripts/generate-sitemap.mjs through Vite's SSR loader (which resolves
 * the app's `@/` + `@shared` aliases and TSX), never by the app itself.
 */
import { AUDIENCES } from "@/lib/studio/templates/audiences";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import { LIFE_STAGE_AUDIENCE_REGISTRY } from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";
import type { LandingCopy, MarketingRegistries } from "./marketing-sitemap";

export * from "./marketing-sitemap";

export interface LoadedMarketingRegistries {
  registries: MarketingRegistries;
  professions: LandingCopy[];
  lifeStages: LandingCopy[];
}

export function loadMarketingRegistries(): LoadedMarketingRegistries {
  const professions = AUDIENCES.map((a) => ({ slug: a.id, label: a.label, description: a.blurb }));
  const lifeStages = LIFE_STAGE_AUDIENCE_REGISTRY.map((m) => ({
    slug: audienceSlug(m.key),
    label: m.label,
    description: m.thesis,
  }));
  return {
    registries: {
      professionIds: professions.map((p) => p.slug),
      lifeStageSlugs: lifeStages.map((l) => l.slug),
      templateIds: TEMPLATE_CATALOG.map((t) => t.id),
    },
    professions,
    lifeStages,
  };
}
