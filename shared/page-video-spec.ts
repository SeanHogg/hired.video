/**
 * Wire shape for the **page → video** scaffolder (SuperAdmin "turn this
 * marketing page into a Studio video" flow, #1860).
 *
 * Lives in `shared/` so both the API route + scaffolder service AND the
 * frontend page-harvester + `pageVideoSpecToCanvas()` consume the same
 * types. Two-sided contracts in a typed monorepo belong in `shared/`
 * (DRY rule — never duplicate the structure on both ends).
 *
 * Direction of data:
 *   1. Client harvests the live page → `HarvestedPage` (DOM text +
 *      images + CTAs + the matched PAGE_SEO entry).
 *   2. `POST /api/studio/generate-from-page` enriches it with
 *      server-known route facts, runs the LLM via `scaffoldPageVideo()`,
 *      and returns a `PageVideoSpec`.
 *   3. `frontend/lib/studio/editor-v2/page-spec-to-canvas.ts` hydrates
 *      the spec into a `CanvasState` the Studio editor mounts as-is.
 *
 * Mirrors the comic scaffolder contract (`shared/comic-spec.ts`): the
 * LLM only ever picks an IMAGE INDEX into the harvested list — it never
 * emits a URL — so the route can resolve indices back to the real
 * (already-trusted) asset URLs and the model can't hallucinate sources.
 */

// ─── Client → server: the harvested page ─────────────────────────────────────

export interface HarvestedImage {
  /** Absolute, http(s) URL. Data-URIs and tiny chrome icons are dropped
   *  client-side before harvest so the model only sees content imagery. */
  url: string;
  /** Alt text (empty string when the page didn't supply any). */
  alt: string;
  /** Natural pixel dimensions when the browser knew them — lets the
   *  scaffolder prefer hero-sized imagery over thumbnails. */
  width?: number;
  height?: number;
}

export interface HarvestedSection {
  /** Heading level 1..3. */
  level: number;
  heading: string;
  /** Concatenated body copy that follows this heading, capped. */
  text: string;
}

export interface HarvestedCta {
  text: string;
  /** Absolute href; same-origin app links are kept relative-free. */
  href: string;
}

/** Everything the client knows about the page it's standing on. */
export interface HarvestedPage {
  /** Full document URL (origin + pathname + search). */
  url: string;
  /** Route pathname, used for server-side route-fact enrichment. */
  pathname: string;
  /** `document.title`. */
  title: string;
  /** `<meta name="description">` content, when present. */
  metaDescription: string;
  /** Ordered headings (h1–h3) as the user reads them top-to-bottom. */
  headings: Array<{ level: number; text: string }>;
  /** Heading-anchored sections with their body copy. */
  sections: HarvestedSection[];
  /** Content imagery (chrome / icons already filtered out). */
  images: HarvestedImage[];
  /** Primary call-to-action links. */
  ctas: HarvestedCta[];
  /** The app's own SEO record for this route (PAGE_SEO), when the client
   *  matched one — gives the model the canonical positioning copy. */
  seoTitle?: string;
  seoDescription?: string;
  /** Capped plaintext of the whole page — fallback signal when the
   *  structured fields above are thin (e.g. a heavily-canvas page). */
  bodyText: string;
}

// ─── Server → client: the scaffolded spec ────────────────────────────────────

/** Each scene plays one beat of the page's story. */
export type PageSceneKind = "hook" | "point" | "stat" | "cta";

export interface PageVideoScene {
  kind: PageSceneKind;
  /** Beat label for the editor's scene rail ("Hook", "Why it matters"…). */
  label: string;
  /** The on-screen headline — short, punchy, social-ready. */
  headline: string;
  /** Optional supporting line under the headline (""=none). */
  subhead: string;
  /** For "point" scenes — up to 4 short bullets. Empty otherwise. */
  bullets: string[];
  /** For "stat" scenes — the big number/figure (e.g. "1M tokens"). */
  stat: string;
  /** Caption under the stat. */
  statCaption: string;
  /** Resolved (server-side) content image URL, or null. */
  imageUrl: string | null;
  /** For "cta" scenes — button label + destination. */
  ctaText: string;
  ctaUrl: string;
  durationSeconds: number;
}

export interface PageVideoPalette {
  background: string;
  accent: string;
  text: string;
  muted: string;
}

export type PageVideoAspect = "landscape" | "portrait" | "square";

export interface PageVideoSpec {
  title: string;
  palette: PageVideoPalette;
  /** Output framing — defaults to portrait (the social-feed format the
   *  challenge targets). The scaffolder may override per page intent. */
  aspect: PageVideoAspect;
  scenes: PageVideoScene[];
}

/** Envelope returned by `POST /api/studio/generate-from-page`. */
export interface GeneratePageVideoResponse {
  spec: PageVideoSpec;
  /** Echoes which page the spec was built from (the toast says "Built
   *  from /pricing"). */
  sourcePath: string;
}

// ─── Shared defaults (single source of truth for both ends) ──────────────────

/** Brand-neutral dark palette. Mirrors `emptyScene()`'s `#0f172a` so an
 *  AI-built draft and a hand-started one look like the same product. */
export const PAGE_VIDEO_DEFAULT_PALETTE: PageVideoPalette = {
  background: "#0f172a",
  accent: "#a78bfa",
  text: "#ffffff",
  muted: "#94a3b8",
};

/** Canonical canvas dimensions per aspect. The scaffolder, the
 *  spec→canvas hydrator, and any preview surface all read this so they
 *  can't drift. */
export function pageVideoDimensions(aspect: PageVideoAspect): {
  width: number;
  height: number;
} {
  switch (aspect) {
    case "landscape":
      return { width: 1920, height: 1080 };
    case "square":
      return { width: 1080, height: 1080 };
    case "portrait":
    default:
      return { width: 1080, height: 1920 };
  }
}
