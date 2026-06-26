// Unified template registry — single access layer that fans out to all
// underlying sources and returns TemplateMeta. UI surfaces never import
// the per-kind catalogs directly; they import from here so a new kind
// (e.g. job templates, voice templates) lands in one place.

import { useEffect, useState } from "react";
import { TEMPLATE_PRESETS, type ResumeTemplateDescriptor } from "@/types/resume-template";
import {
  TEMPLATE_CATALOG as STUDIO_BUILTIN_CATALOG,
  type ContentTemplate,
  type TemplateDef as StudioBuiltinDef,
} from "@/components/studio/templates/catalog";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import type { TemplateFilter, TemplateMeta } from "./types";

// ─── Slug normalization ─────────────────────────────────────────────────────

/** Studio built-in ids use snake_case (e.g. "personal_brand") so they read
 *  naturally as TS string literals; URLs prefer kebab-case. We normalize at
 *  the registry boundary so consumers always see kebab slugs. */
function studioBuiltinSlug(id: ContentTemplate): string {
  return id.replace(/_/g, "-");
}

/** Inverse of `studioBuiltinSlug` — used when a slug coming from the URL
 *  needs to be resolved back to a catalog entry. */
function slugToBuiltinId(slug: string): ContentTemplate | null {
  const candidate = slug.replace(/-/g, "_") as ContentTemplate;
  return STUDIO_BUILTIN_CATALOG.some((t) => t.id === candidate) ? candidate : null;
}

// ─── Adapters ───────────────────────────────────────────────────────────────

function fromResume(d: ResumeTemplateDescriptor): TemplateMeta {
  return {
    slug: d.id,
    kind: "resume",
    name: d.name,
    blurb: d.description ?? "",
    priceCents: d.priceCents ?? 0,
    industry: d.industry,
    tags: d.industry ? [d.industry] : [],
    origin: { kind: "resume", descriptor: d },
  };
}

function fromStudioBuiltin(def: StudioBuiltinDef): TemplateMeta {
  return {
    slug: studioBuiltinSlug(def.id),
    kind: "studio-builtin",
    name: def.label,
    blurb: def.desc,
    priceCents: 0,
    tags: ["video", "studio"],
    origin: { kind: "studio-builtin", def },
  };
}

function fromStudioCreator(t: StudioTemplate): TemplateMeta {
  return {
    slug: t.listingSlug ?? t.id,
    kind: "studio-creator",
    name: t.name,
    blurb: t.description ?? "",
    thumbnailUrl: t.thumbnailUrl ?? undefined,
    previewVideoUrl: t.previewVideoUrl ?? undefined,
    priceCents: t.priceCents,
    tags: ["video", "creator", ...(t.tags ?? [])],
    origin: { kind: "studio-creator", template: t },
  };
}

// ─── Sync sources ───────────────────────────────────────────────────────────

/** All resume + studio-builtin templates available without any network call.
 *  Studio-creator templates require an async fetch and are merged in by
 *  `useTemplates`. Components that need an immediate result (e.g. the
 *  Studio sidebar that shows the same list it always did) read from here. */
export function getStaticTemplates(): TemplateMeta[] {
  return [
    ...TEMPLATE_PRESETS.map(fromResume),
    ...STUDIO_BUILTIN_CATALOG.map(fromStudioBuiltin),
  ];
}

/** Look up a single template by slug across all static sources. Async
 *  callers that need creator templates should use `fetchTemplateBySlug`. */
export function getStaticTemplateBySlug(slug: string): TemplateMeta | null {
  if (!slug) return null;
  const resume = TEMPLATE_PRESETS.find((d) => d.id === slug);
  if (resume) return fromResume(resume);
  const builtinId = slugToBuiltinId(slug);
  if (builtinId) {
    const def = STUDIO_BUILTIN_CATALOG.find((t) => t.id === builtinId);
    if (def) return fromStudioBuiltin(def);
  }
  return null;
}

/** Resolve a slug, falling back to a network fetch for creator-published
 *  templates. Returns null if nothing matches anywhere. */
export async function fetchTemplateBySlug(slug: string): Promise<TemplateMeta | null> {
  const staticHit = getStaticTemplateBySlug(slug);
  if (staticHit) return staticHit;
  try {
    const t = await studioTemplatesService.getBySlug(slug);
    return fromStudioCreator(t);
  } catch {
    return null;
  }
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/** Resolve a template by slug. Returns the static result synchronously when
 *  available, then upgrades to the async creator-template result if the
 *  slug isn't in the static catalogs. `null` while loading an unknown slug. */
export function useTemplate(slug: string | null | undefined): {
  template: TemplateMeta | null;
  loading: boolean;
} {
  const initial = slug ? getStaticTemplateBySlug(slug) : null;
  const [template, setTemplate] = useState<TemplateMeta | null>(initial);
  const [loading, setLoading] = useState(initial == null && !!slug);

  useEffect(() => {
    if (!slug) {
      setTemplate(null);
      setLoading(false);
      return;
    }
    const hit = getStaticTemplateBySlug(slug);
    if (hit) {
      setTemplate(hit);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTemplateBySlug(slug)
      .then((t) => {
        if (!cancelled) setTemplate(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { template, loading };
}

function matchesQuery(meta: TemplateMeta, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  if (meta.name.toLowerCase().includes(needle)) return true;
  if (meta.blurb.toLowerCase().includes(needle)) return true;
  if (meta.industry?.toLowerCase().includes(needle)) return true;
  return meta.tags.some((t) => t.toLowerCase().includes(needle));
}

/** List templates matching a filter. Static sources are returned immediately;
 *  creator-published templates are merged in once their fetch resolves. */
export function useTemplates(filter: TemplateFilter = {}): {
  templates: TemplateMeta[];
  loading: boolean;
} {
  const staticAll = getStaticTemplates();
  const initial = staticAll.filter(
    (t) => (!filter.kind || t.kind === filter.kind) && matchesQuery(t, filter.query ?? ""),
  );
  const [creator, setCreator] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(filter.kind !== "resume" && filter.kind !== "studio-builtin");

  useEffect(() => {
    if (filter.kind === "resume" || filter.kind === "studio-builtin") {
      setCreator([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Public marketplace listing — every creator's `visibility='public'`
    // templates, anonymous-friendly. De-duplication of the caller's own
    // private/unlisted drafts lives in the dedicated "My published
    // templates" panel; this hook only shows what every visitor sees.
    studioTemplatesService
      .listPublic({ search: filter.query?.trim() || undefined })
      .then((rows) => {
        if (cancelled) return;
        setCreator(rows.map(fromStudioCreator));
      })
      .catch(() => {
        if (!cancelled) setCreator([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter.kind, filter.query]);

  const merged = [
    ...initial,
    ...creator.filter(
      (t) => (!filter.kind || t.kind === filter.kind) && matchesQuery(t, filter.query ?? ""),
    ),
  ];
  return { templates: merged, loading };
}

// ─── Related templates ──────────────────────────────────────────────────────

/** Overlap score between two templates — drives the "More templates like
 *  this" grid + the prerendered crawlable internal links. Pure + kind-
 *  agnostic so resume, studio-builtin, and creator templates all relate to
 *  each other through one rule (DRY: the page never re-derives this). */
function relatednessScore(a: TemplateMeta, b: TemplateMeta): number {
  let score = 0;
  if (a.industry && b.industry && a.industry === b.industry) score += 3;
  const aTags = new Set(a.tags.map((t) => t.toLowerCase()));
  for (const t of b.tags) if (aTags.has(t.toLowerCase())) score += 1;
  if (a.kind === b.kind) score += 1;
  return score;
}

/**
 * Templates most related to `meta`, ranked by shared industry / tags / kind.
 * Resolved synchronously over the static catalog (resume + studio-builtin)
 * so the related grid renders immediately and the same set can be emitted as
 * crawlable links. Falls back to same-kind, then any, template so the grid is
 * never empty — every template page stays internally linked, not orphaned.
 */
export function getRelatedTemplates(meta: TemplateMeta, limit = 6): TemplateMeta[] {
  const pool = getStaticTemplates().filter((t) => t.slug !== meta.slug);
  const scored = pool
    .map((t) => ({ t, score: relatednessScore(meta, t) }))
    .sort((a, b) => b.score - a.score);

  const related = scored.filter((s) => s.score > 0).map((s) => s.t);
  if (related.length >= limit) return related.slice(0, limit);

  // Backfill with the remaining (zero-overlap) templates, same-kind first, so
  // the section always offers somewhere to click.
  const remaining = scored
    .filter((s) => s.score === 0)
    .map((s) => s.t)
    .sort((a, b) => Number(b.kind === meta.kind) - Number(a.kind === meta.kind));
  return [...related, ...remaining].slice(0, limit);
}

// ─── Helpers exported for the apply layer + studio deep-link ────────────────

export { studioBuiltinSlug, slugToBuiltinId };
