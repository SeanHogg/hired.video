/**
 * Seed a fresh CanvasState from a content-template id. Single source of
 * truth for "what does template X start as" — used by:
 *   - useCreateStudioDraft (the "Use this template" CTA on /studio + the
 *     marketplace preview's Apply button + the carousel)
 *   - StudioEditorV2's localStorage hydration fallback when a fresh
 *     project loads with `?templateHint=`
 *   - The marketplace press-play preview (TemplatePlayer) so visitors
 *     see EXACTLY what they'll get in the editor — pixel-identical
 *   - The agent-tool `generate_video_from_template` hydrator
 *
 * Per the standing DRY rule + the V2-deprecation memory (V1 is being
 * deleted; never author against VideoScript / scene-graph compile()):
 * every "new project from template" path calls `seedCanvasFromTemplate()`
 * and gets back a v2 CanvasState. Unknown ids fall through to an empty
 * canvas (graceful).
 *
 * Content philosophy: the seeds carry REALISTIC values (real names,
 * roles, numbers, copy) so the marketplace press-play preview shows a
 * credible composition and clicking Use drops the user into the editor
 * with content they can swap out widget-by-widget rather than starring
 * at a wall of `[Placeholder]` tokens. The agent-tool hydrator (which
 * historically swapped `[Your name]` tokens for the user's resume
 * basics) now selectively overwrites widget text via the per-template
 * `placeholderTokens` table when invoked — see #700.
 */

import type { ContentTemplate } from "@/components/studio/templates/catalog";
import {
  defaultWidget,
  emptyCanvasState,
  emptyScene,
  type CanvasState,
  type Scene,
  type Widget,
} from "./canvas-state";
import {
  COMIC_GENRES,
  getNarrativeShape,
  pickStockAsset,
  type ComicGenre,
} from "@shared/comic-genres";
import { buildComicPage } from "./comic-page-builder";
import { COMIC_DEFAULT_LAYOUT } from "@shared/comic-spec";

export function seedCanvasFromTemplate(
  templateId: string | null | undefined,
): CanvasState {
  if (!templateId) return emptyCanvasState();
  const seed = SEEDS[templateId as ContentTemplate];
  if (!seed) return emptyCanvasState();
  return seed();
}

// ───────────────────────────────────────────────────────────────────────────
// Builders — shared so each seed reads as a small, declarative recipe.
// Returning fresh instances every call (no shared references) so the
// editor can mutate without surprising another template instance.
// ───────────────────────────────────────────────────────────────────────────

function makeScene(
  label: string,
  backgroundColor: string,
  durationSeconds: number,
  widgets: Widget[],
): Scene {
  return {
    ...emptyScene(label),
    backgroundColor,
    durationSeconds,
    widgets,
  };
}

function makeHeading(text: string, options: Partial<Widget["position"]> & {
  color?: string;
  fontPx?: number;
  align?: "left" | "center" | "right";
} = {}): Widget {
  const w = defaultWidget("heading");
  if (w.params.kind !== "heading") throw new Error("unreachable");
  w.position = {
    x: options.x ?? 0.08,
    y: options.y ?? 0.35,
    width: options.width ?? 0.84,
    height: options.height ?? 0.2,
    z: options.z ?? 2,
    rotation: options.rotation ?? 0,
  };
  w.params.data.text = text;
  if (options.color) w.params.data.color = options.color;
  if (options.fontPx) w.params.data.fontPx = options.fontPx;
  if (options.align) w.params.data.align = options.align;
  return w;
}

function makeText(text: string, options: Partial<Widget["position"]> & {
  color?: string;
  fontPx?: number;
  align?: "left" | "center" | "right";
} = {}): Widget {
  const w = defaultWidget("text");
  if (w.params.kind !== "text") throw new Error("unreachable");
  w.position = {
    x: options.x ?? 0.08,
    y: options.y ?? 0.6,
    width: options.width ?? 0.84,
    height: options.height ?? 0.15,
    z: options.z ?? 2,
    rotation: options.rotation ?? 0,
  };
  w.params.data.text = text;
  if (options.color) w.params.data.color = options.color;
  if (options.fontPx) w.params.data.fontPx = options.fontPx;
  if (options.align) w.params.data.align = options.align;
  return w;
}

function makeShape(
  kind: "shape-rect" | "shape-circle",
  fill: string,
  position: Omit<Widget["position"], "rotation"> & { rotation?: number },
): Widget {
  const w = defaultWidget(kind);
  if (w.params.kind !== "shape-rect" && w.params.kind !== "shape-circle") {
    throw new Error("unreachable");
  }
  w.position = { ...position, rotation: position.rotation ?? 0 };
  w.params.data.fill = fill;
  return w;
}

function makeChips(
  chips: string[],
  options: Partial<Widget["position"]> & {
    chipColor?: string;
    textColor?: string;
    fontPx?: number;
    direction?: "row" | "column";
  } = {},
): Widget {
  const w = defaultWidget("chips");
  if (w.params.kind !== "chips") throw new Error("unreachable");
  w.position = {
    x: options.x ?? 0.08,
    y: options.y ?? 0.55,
    width: options.width ?? 0.84,
    height: options.height ?? 0.25,
    z: options.z ?? 2,
    rotation: options.rotation ?? 0,
  };
  w.params.data.chips = chips;
  if (options.chipColor) w.params.data.chipColor = options.chipColor;
  if (options.textColor) w.params.data.textColor = options.textColor;
  if (options.fontPx) w.params.data.fontPx = options.fontPx;
  if (options.direction) w.params.data.direction = options.direction;
  return w;
}

function makeCta(
  headline: string,
  ctaText: string,
  ctaUrl: string,
  options: Partial<Widget["position"]> & {
    subheadline?: string;
    bgColor?: string;
    textColor?: string;
    accentColor?: string;
    accentTextColor?: string;
  } = {},
): Widget {
  const w = defaultWidget("cta");
  if (w.params.kind !== "cta") throw new Error("unreachable");
  w.position = {
    x: options.x ?? 0.1,
    y: options.y ?? 0.25,
    width: options.width ?? 0.8,
    height: options.height ?? 0.5,
    z: options.z ?? 2,
    rotation: options.rotation ?? 0,
  };
  w.params.data.headline = headline;
  w.params.data.ctaText = ctaText;
  w.params.data.ctaUrl = ctaUrl;
  if (options.subheadline) w.params.data.subheadline = options.subheadline;
  if (options.bgColor) w.params.data.bgColor = options.bgColor;
  if (options.textColor) w.params.data.textColor = options.textColor;
  if (options.accentColor) w.params.data.accentColor = options.accentColor;
  if (options.accentTextColor) w.params.data.accentTextColor = options.accentTextColor;
  return w;
}

// ─── Comic seed adapter ────────────────────────────────────────────────────
//
// The static template seed for every genre. Thin adapter that translates
// the genre's narrative-beat brief + stock-asset rotation into the
// canonical `ComicPageContent` shape, then calls the single
// `buildComicPage()` assembler (shared with the AI-spec hydrator in
// `comic-spec-to-canvas.ts`). No widget defaults / layout / per-widget
// stroke decisions live here — those are owned by `comic-page-builder.ts`.

function comicSeedFor(genre: ComicGenre): CanvasState {
  const beats = getNarrativeShape(genre);
  const pages: Scene[] = beats.map((beat, idx) => {
    const bg = pickStockAsset(genre.stockAssets.backgrounds, idx);
    const character = pickStockAsset(genre.stockAssets.characters, idx);
    const prop = pickStockAsset(genre.stockAssets.props, idx);
    const sfxAsset = pickStockAsset(genre.stockAssets.sfx, idx);
    const sfxText =
      sfxAsset && (beat.beatId === "rising-action" || beat.beatId === "climax")
        ? genre.sfxPalette[idx % Math.max(1, genre.sfxPalette.length)] ?? ""
        : "";
    return buildComicPage(
      {
        label: beat.label,
        caption: beat.label.toUpperCase(),
        protagonistLine: beat.brief,
        protagonistMode: beat.beatId === "midpoint" ? "thought" : "speech",
        // No second speaker in the seed — the seed is a single-voice
        // placeholder. The AI path lights the second bubble up when
        // the beat is a dialogue.
        otherLine: "",
        sfx: sfxText,
        backgroundUrl: bg?.path ?? null,
        characterUrl: character?.path ?? null,
        // Prop only on odd-numbered pages so the layout doesn't get
        // overcrowded — same rule the spec→canvas adapter applies via
        // sfx-vs-prop trade-off.
        propUrl: idx % 2 === 1 ? prop?.path ?? null : null,
      },
      genre.palette,
      COMIC_DEFAULT_LAYOUT,
    );
  });

  return {
    // Comics author at portrait — vertical scroll is the dominant
    // reading affordance (webtoon, social feeds, mobile reader).
    // Genre-specific aspect overrides could land later via a per-
    // genre `aspect` field in the catalog.
    ...emptyCanvasState({ width: 1080, height: 1920, fps: 24 }),
    scenes: pages,
  };
}

/** Seed comic pages for an interactive-comic ("Comic+") template by reusing
 *  a fitting linear-comic genre. Interactive comics author the same pages as
 *  the linear kind (#929) — the branch graph rides on top in
 *  `interactiveComicState`, seeded blank by `template-dispatch`. Falls back
 *  to the first genre if the id is unknown so the seed is never empty. */
function comicSeedForGenreId(genreId: string): CanvasState {
  const genre = COMIC_GENRES.find((g) => g.id === genreId) ?? COMIC_GENRES[0];
  return comicSeedFor(genre);
}

// ───────────────────────────────────────────────────────────────────────────
// Per-template seeds. Each one returns a 1080p / 30fps canvas; the
// scene count + widget mix is just a starting layout — the user is
// expected to edit.
// ───────────────────────────────────────────────────────────────────────────

const SEEDS: Partial<Record<ContentTemplate, () => CanvasState>> = {
  basic: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Intro", "#475569", 6, [
        makeHeading("One scene, one idea.", { y: 0.32, align: "center", color: "#ffffff" }),
        makeText("Type a prompt — get a video.", {
          y: 0.55, align: "center", fontPx: 30, color: "#e2e8f0",
        }),
      ]),
      makeScene("Outro", "#0f172a", 5, [
        makeHeading("Yours in 60 seconds.", { y: 0.36, align: "center", color: "#ffffff" }),
        makeText("No editing required.", { y: 0.58, align: "center", fontPx: 28, color: "#cbd5e1" }),
      ]),
    ],
  }),

  profile: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hello", "#0f172a", 5, [
        makeHeading("Alex Rivera", { y: 0.3, align: "center", color: "#ffffff" }),
        makeText("Product Designer · San Francisco", {
          y: 0.5, align: "center", fontPx: 30, color: "#a78bfa",
        }),
        makeText("Designing tools that help people get back time.", {
          y: 0.66, align: "center", fontPx: 22, color: "#cbd5e1", height: 0.1,
        }),
      ]),
      makeScene("What I do", "#1e293b", 6, [
        makeHeading("What I do", { y: 0.1, fontPx: 56, color: "#ffffff" }),
        makeText(
          "• Lead end-to-end product design for B2B SaaS\n• Ship from research → prototype → production\n• Pair with PMs + engineers daily",
          { y: 0.3, height: 0.5, fontPx: 26, color: "#e2e8f0" },
        ),
      ]),
      makeScene("Services", "#0f172a", 5, [
        makeHeading("Services on offer", { y: 0.12, fontPx: 50, color: "#ffffff" }),
        makeChips(
          ["Design audits", "0-to-1 prototypes", "Design systems", "Workshops"],
          { y: 0.45, height: 0.35, fontPx: 26, chipColor: "rgba(124,58,237,0.25)", textColor: "#c4b5fd" },
        ),
      ]),
      makeScene("CTA", "#0f172a", 4, [
        makeCta("Let's build something.", "Get in touch", "mailto:alex@rivera.design", {
          subheadline: "alex@rivera.design",
          bgColor: "#7c3aed",
          textColor: "#ffffff",
          accentColor: "#ffffff",
          accentTextColor: "#7c3aed",
        }),
      ]),
    ],
  }),

  resume: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 5, [
        makeHeading("Jordan Park", { y: 0.3, align: "center", color: "#ffffff" }),
        makeText("Senior Backend Engineer", {
          y: 0.5, align: "center", fontPx: 30, color: "#5eead4",
        }),
        makeText("Eight years building distributed systems at scale.", {
          y: 0.66, align: "center", fontPx: 22, color: "#cbd5e1", height: 0.1,
        }),
      ]),
      makeScene("Highlights", "#1e293b", 6, [
        makeHeading("Career highlights", { y: 0.08, fontPx: 50, color: "#ffffff" }),
        makeText(
          "• Took payments throughput from 800/s → 14k/s\n• Led migration off monolith for 60-engineer team\n• Cut p99 latency 38% on the auth service",
          { y: 0.3, height: 0.55, fontPx: 26, color: "#e2e8f0" },
        ),
      ]),
      makeScene("Stack", "#0f172a", 5, [
        makeHeading("Core stack", { y: 0.12, fontPx: 50, color: "#ffffff" }),
        makeChips(
          ["Go", "Postgres", "Kafka", "Kubernetes", "gRPC", "Observability"],
          { y: 0.4, height: 0.4, fontPx: 26, chipColor: "rgba(20,184,166,0.25)", textColor: "#5eead4" },
        ),
      ]),
      makeScene("Outro", "#0f172a", 4, [
        makeHeading("Open to roles.", { y: 0.35, align: "center", color: "#ffffff" }),
        makeText("Staff / Principal · remote-first", {
          y: 0.55, align: "center", fontPx: 26, color: "#5eead4",
        }),
      ]),
    ],
  }),

  personal_brand: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#1e1b4b", 5, [
        makeHeading("I rebuild careers.", { y: 0.35, align: "center", color: "#fafafa" }),
        makeText("Coach · Author · Operator", {
          y: 0.57, align: "center", fontPx: 28, color: "#fbbf24",
        }),
      ]),
      makeScene("Three years", "#1e1b4b", 6, [
        makeHeading("Three years, one mission", { y: 0.08, fontPx: 48, color: "#fafafa" }),
        makeText(
          "• 400+ professionals coached into senior roles\n• Best-selling course on career pivots\n• Featured in WSJ, Fast Company, The Information",
          { y: 0.3, height: 0.55, fontPx: 26, color: "#e0e7ff" },
        ),
      ]),
      makeScene("Testimonial", "#0f172a", 5, [
        makeHeading('"She rewrote the way I think about ambition."', {
          y: 0.32, align: "center", fontPx: 38, color: "#fafafa", height: 0.25,
        }),
        makeText("— Maya, now Director of Engineering", {
          y: 0.65, align: "center", fontPx: 24, color: "#fbbf24",
        }),
      ]),
      makeScene("CTA", "#1e1b4b", 4, [
        makeCta("Work with me", "Apply for coaching", "https://rivera-coaching.com", {
          subheadline: "rivera-coaching.com",
          bgColor: "#f43f5e",
          textColor: "#ffffff",
          accentColor: "#fbbf24",
          accentTextColor: "#1e1b4b",
        }),
      ]),
    ],
  }),

  skills_demo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Intro", "#ffffff", 4, [
        makeHeading("Skills, in motion.", { y: 0.35, align: "center", color: "#0f172a" }),
        makeText("Not a list — a portfolio.", {
          y: 0.55, align: "center", fontPx: 28, color: "#7c3aed",
        }),
      ]),
      makeScene("Stack", "#ffffff", 6, [
        makeHeading("What I work with", { y: 0.1, fontPx: 50, color: "#0f172a" }),
        makeChips(
          ["TypeScript", "React", "Node", "Postgres", "AWS", "Terraform"],
          { y: 0.4, height: 0.4, fontPx: 28, chipColor: "rgba(124,58,237,0.15)", textColor: "#7c3aed" },
        ),
      ]),
      makeScene("Wins", "#0f172a", 6, [
        makeHeading("Where each one paid off", { y: 0.08, fontPx: 48, color: "#ffffff" }),
        makeText(
          "• TypeScript → cut runtime bugs 60% on checkout\n• Terraform → onboarding 3 days → 2 hours\n• Postgres tuning → query p99 down 5×",
          { y: 0.32, height: 0.55, fontPx: 26, color: "#fbbf24" },
        ),
      ]),
      makeScene("Outro", "#ffffff", 3, [
        makeHeading("Proof, not promises.", { y: 0.4, align: "center", color: "#0f172a" }),
      ]),
    ],
  }),

  code_walkthrough: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#020617", 5, [
        makeHeading("How it actually works.", {
          y: 0.32, align: "center", color: "#22d3ee",
        }),
        makeText("A 30-second walk through the core loop.", {
          y: 0.55, align: "center", fontPx: 26, color: "#a78bfa",
        }),
      ]),
      makeScene("Pipeline", "#020617", 6, [
        makeHeading("The render pipeline", { y: 0.1, fontPx: 50, color: "#22d3ee" }),
        makeText(
          "CanvasState → canvasStateToTimeline() → Timeline JSON → CanvasStage at 30 FPS.",
          { y: 0.4, height: 0.4, fontPx: 26, color: "#facc15" },
        ),
      ]),
      makeScene("One player", "#020617", 6, [
        makeHeading("Why one player", { y: 0.08, fontPx: 50, color: "#22d3ee" }),
        makeText(
          "• Baked MP4 when fresh\n• Live canvas when not\n• Same external API — chrome doesn't branch",
          { y: 0.32, height: 0.55, fontPx: 26, color: "#a78bfa" },
        ),
      ]),
      makeScene("Repo", "#020617", 4, [
        makeCta("Repo + write-up", "View on GitHub", "https://github.com/yourname/project", {
          subheadline: "github.com/yourname/project",
          bgColor: "#0f172a",
          textColor: "#22d3ee",
          accentColor: "#22d3ee",
          accentTextColor: "#020617",
        }),
      ]),
    ],
  }),

  design_portfolio: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#efe9e1", 5, [
        makeHeading("Selected work, 2024–2026.", {
          y: 0.34, align: "center", color: "#1f2937",
        }),
        makeText("Mira Chen · Product Designer", {
          y: 0.56, align: "center", fontPx: 28, color: "#7a6b5a",
        }),
      ]),
      makeScene("Healthcare", "#efe9e1", 6, [
        makeHeading("Healthcare scheduling redesign", {
          y: 0.1, fontPx: 44, color: "#1f2937",
        }),
        makeShape("shape-rect", "#b8a89a", {
          x: 0.08, y: 0.35, width: 0.4, height: 0.5, z: 1,
        }),
        makeText("Cut booking abandonment from 41% to 17% across 1.2M monthly visits.", {
          x: 0.52, y: 0.4, width: 0.4, height: 0.4, fontPx: 22, color: "#1f2937",
        }),
      ]),
      makeScene("Banking", "#efe9e1", 6, [
        makeHeading("Banking onboarding system", {
          y: 0.1, fontPx: 44, color: "#1f2937",
        }),
        makeShape("shape-rect", "#7a6b5a", {
          x: 0.08, y: 0.35, width: 0.4, height: 0.5, z: 1,
        }),
        makeText("Shipped a 14-screen flow in 9 weeks. Conversion +28% vs control.", {
          x: 0.52, y: 0.4, width: 0.4, height: 0.4, fontPx: 22, color: "#1f2937",
        }),
      ]),
      makeScene("Case studies", "#efe9e1", 4, [
        makeCta("Full case studies", "Visit portfolio", "https://mirachen.design", {
          subheadline: "mirachen.design",
          bgColor: "#7a6b5a",
          textColor: "#efe9e1",
          accentColor: "#efe9e1",
          accentTextColor: "#1f2937",
        }),
      ]),
    ],
  }),

  data_analysis: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#ffffff", 5, [
        makeHeading("Q3 — what the numbers said.", {
          y: 0.32, align: "center", color: "#0f172a",
        }),
        makeText("Three findings, one recommendation.", {
          y: 0.55, align: "center", fontPx: 28, color: "#0ea5e9",
        }),
      ]),
      makeScene("Findings", "#ffffff", 6, [
        makeHeading("Headline findings", { y: 0.08, fontPx: 50, color: "#0f172a" }),
        makeText(
          "• Activation rate up 22% MoM across 14 cohorts\n• Churn concentrated in the 7-day post-trial window\n• Two pricing pages drive 71% of paid conversions",
          { y: 0.3, height: 0.55, fontPx: 26, color: "#0f172a" },
        ),
      ]),
      makeScene("Change", "#ffffff", 5, [
        makeHeading("What changed", { y: 0.1, fontPx: 50, color: "#0f172a" }),
        makeText(
          "We rebuilt the trial-to-paid prompt and re-ordered the pricing grid.",
          { y: 0.4, height: 0.3, fontPx: 28, color: "#7c3aed" },
        ),
      ]),
      makeScene("Recommendation", "#0ea5e9", 4, [
        makeHeading("Recommendation", { y: 0.25, align: "center", color: "#ffffff" }),
        makeText("Ship the new prompt sitewide; A/B the pricing change.", {
          y: 0.55, align: "center", fontPx: 26, color: "#ffffff", height: 0.2,
        }),
      ]),
    ],
  }),

  job_ad: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#7c3aed", 4, [
        makeHeading("We're hiring.", { y: 0.32, align: "center", color: "#ffffff" }),
        makeText("Senior Full-Stack Engineer · Remote", {
          y: 0.55, align: "center", fontPx: 30, color: "#fde68a",
        }),
      ]),
      makeScene("Role", "#1e1b4b", 6, [
        makeHeading("The role", { y: 0.1, fontPx: 50, color: "#ffffff" }),
        makeText(
          "• Own the candidate-facing product end to end\n• Pair with design weekly, ship every Tuesday\n• TypeScript / React / Node / Postgres",
          { y: 0.3, height: 0.55, fontPx: 26, color: "#e0e7ff" },
        ),
      ]),
      makeScene("Why", "#7c3aed", 5, [
        makeHeading("Why join", { y: 0.12, fontPx: 50, color: "#ffffff" }),
        makeChips(
          ["$160k–$210k", "Equity", "Remote-first", "Unlimited PTO", "4-day weeks"],
          { y: 0.42, height: 0.4, fontPx: 24, chipColor: "rgba(255,255,255,0.18)", textColor: "#ffffff" },
        ),
      ]),
      makeScene("Apply", "#1e1b4b", 4, [
        makeCta("Apply by Friday.", "Apply now", "https://jobs.example.com/se", {
          subheadline: "jobs.example.com/se",
          bgColor: "#f43f5e",
          textColor: "#ffffff",
          accentColor: "#fde68a",
          accentTextColor: "#1e1b4b",
        }),
      ]),
    ],
  }),

  company_promo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#0f172a", 5, [
        makeHeading("Build with us.", { y: 0.32, align: "center", color: "#ffffff" }),
        makeText("ACME · Series B · 60 engineers", {
          y: 0.55, align: "center", fontPx: 28, color: "#7c3aed",
        }),
      ]),
      makeScene("How", "#1e1b4b", 6, [
        makeHeading("How we work", { y: 0.1, fontPx: 50, color: "#ffffff" }),
        makeText(
          "• Async-first, two synchronous hours/day\n• Ship to prod from day one\n• Outcomes over output — always",
          { y: 0.3, height: 0.55, fontPx: 26, color: "#e0e7ff" },
        ),
      ]),
      makeScene("Get", "#0f172a", 5, [
        makeHeading("What you get", { y: 0.12, fontPx: 50, color: "#ffffff" }),
        makeChips(
          ["Top-of-market comp", "Equity", "Remote-first", "Learning budget"],
          { y: 0.42, height: 0.4, fontPx: 24, chipColor: "rgba(124,58,237,0.25)", textColor: "#c4b5fd" },
        ),
      ]),
      makeScene("Roles", "#0f172a", 4, [
        makeCta("Open roles", "See openings", "https://acme.co/careers", {
          subheadline: "acme.co/careers",
          bgColor: "#7c3aed",
          textColor: "#ffffff",
          accentColor: "#ffffff",
          accentTextColor: "#7c3aed",
        }),
      ]),
    ],
  }),

  sizzle_reel: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Open", "#bae6fd", 3, [
        makeHeading("Sizzle Reel", { y: 0.32, align: "center", color: "#0f172a" }),
        makeText("Three minutes of the best moments — in twenty seconds.", {
          y: 0.55, align: "center", fontPx: 22, color: "#0f172a", height: 0.15,
        }),
      ]),
      makeScene("Cut", "#bae6fd", 4, [
        makeHeading("Highlights cut to the beat", {
          y: 0.12, fontPx: 44, color: "#0f172a",
        }),
        makeText(
          "Drop clips. Pick a track. We score the moments and cut to the music.",
          { y: 0.4, height: 0.4, fontPx: 26, color: "#0f172a" },
        ),
      ]),
      makeScene("Testimonial", "#84cc16", 5, [
        makeHeading('"It picked the exact shots I\'d have picked — in five seconds."', {
          y: 0.3, align: "center", fontPx: 32, color: "#0f172a", height: 0.3,
        }),
        makeText("— Sam, podcast producer", {
          y: 0.7, align: "center", fontPx: 22, color: "#0f172a",
        }),
      ]),
      makeScene("Build", "#bae6fd", 4, [
        makeCta("Build yours", "Start now", "https://hired.video/studio", {
          subheadline: "Drop clips · pick a track · publish.",
          bgColor: "#0f172a",
          textColor: "#ffffff",
          accentColor: "#84cc16",
          accentTextColor: "#0f172a",
        }),
      ]),
    ],
  }),

  tool_promo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#4338ca", 4, [
        makeHeading("New Tool Drop", { y: 0.32, align: "center", color: "#ffffff" }),
        makeText("A 30-second look at the latest from the catalog.", {
          y: 0.55, align: "center", fontPx: 26, color: "#fde68a",
        }),
      ]),
      makeScene("What", "#4338ca", 6, [
        makeHeading("What it does", { y: 0.1, fontPx: 50, color: "#ffffff" }),
        makeText(
          "Turn raw recordings into shareable videos — captions, music, and end-cap included.",
          { y: 0.4, height: 0.4, fontPx: 26, color: "#fde68a" },
        ),
      ]),
      makeScene("Why", "#d946ef", 5, [
        makeHeading("Why you'll like it", { y: 0.12, fontPx: 50, color: "#ffffff" }),
        makeChips(
          ["No timeline editing", "Captions in 12 languages", "Free tier", "Renders in-browser"],
          { y: 0.42, height: 0.4, fontPx: 24, chipColor: "rgba(255,255,255,0.2)", textColor: "#ffffff" },
        ),
      ]),
      makeScene("Try", "#4338ca", 4, [
        makeCta("Try it", "Visit tools", "https://hired.video/tools", {
          subheadline: "hired.video/tools",
          bgColor: "#fde68a",
          textColor: "#4338ca",
          accentColor: "#4338ca",
          accentTextColor: "#fde68a",
        }),
      ]),
    ],
  }),

  // ─── Film & Acting seeds ─────────────────────────────────────────────────
  // Realistic starter compositions so the marketplace preview is credible.
  // Per the file-level comment: the user is expected to edit text widget-
  // by-widget after picking the template — empty placeholders are
  // discouraged.

  self_tape: () => ({
    ...emptyCanvasState(),
    scenes: [
      // Industry-standard slate — actor name, role, agent/representation.
      makeScene("Slate", "#0f172a", 4, [
        makeHeading("Jamie Reyes", { y: 0.2, align: "center", color: "#ffffff" }),
        makeText("Auditioning for: ELENA — Lead", {
          y: 0.4, align: "center", fontPx: 28, color: "#fde68a",
        }),
        makeText("Repped by Bell & Co · 5'7\" · NYC-based", {
          y: 0.55, align: "center", fontPx: 22, color: "#cbd5e1",
        }),
        makeText("Take 1", {
          y: 0.75, align: "center", fontPx: 20, color: "#94a3b8",
        }),
      ]),
      // Scene-read placeholder — the actor records over this; widgets
      // are the on-screen sides/cue card.
      makeScene("Scene read", "#000000", 30, [
        makeHeading("Scene read", { y: 0.05, fontPx: 28, align: "center", color: "#475569" }),
        makeText(
          "Record your take here. The dialogue lives in your Sides PDF — keep it off-camera.",
          { y: 0.45, height: 0.2, align: "center", fontPx: 22, color: "#475569" },
        ),
      ]),
      // Clean closer — thank-you card, optional contact.
      makeScene("Thanks", "#0f172a", 4, [
        makeHeading("Thank you", { y: 0.32, align: "center", color: "#ffffff" }),
        makeText("Jamie Reyes · jamie@bellco.agency", {
          y: 0.55, align: "center", fontPx: 24, color: "#fde68a",
        }),
      ]),
    ],
  }),

  monologue: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 3, [
        makeHeading('"The Letter Scene"', { y: 0.34, align: "center", color: "#ffffff" }),
        makeText("from Long Day's Journey into Night · O'Neill", {
          y: 0.55, align: "center", fontPx: 22, color: "#a78bfa",
        }),
      ]),
      // Single take — black background so the actor's framing reads first.
      makeScene("Performance", "#000000", 45, [
        makeText(
          "Captions are on by default for casting reviewers — see Captions panel.",
          { y: 0.9, align: "center", fontPx: 16, color: "#334155", height: 0.05 },
        ),
      ]),
      makeScene("Closer", "#0f172a", 3, [
        makeText("Jamie Reyes", { y: 0.45, align: "center", fontPx: 28, color: "#ffffff" }),
        makeText("Available for callbacks · jamie@bellco.agency", {
          y: 0.6, align: "center", fontPx: 20, color: "#a78bfa",
        }),
      ]),
    ],
  }),

  showreel: () => ({
    ...emptyCanvasState(),
    scenes: [
      // Title card — actor name + reps, sets the reel up.
      makeScene("Title", "#000000", 3, [
        makeHeading("JAMIE REYES", { y: 0.32, align: "center", color: "#ffffff", fontPx: 84 }),
        makeText("Reel · 2026", {
          y: 0.52, align: "center", fontPx: 26, color: "#fbbf24",
        }),
        makeText("Bell & Co · Drama / Comedy / Voice", {
          y: 0.68, align: "center", fontPx: 20, color: "#94a3b8",
        }),
      ]),
      // Three project beats with role / production chips so reviewers
      // can read the breadth at a glance even before the clip plays.
      makeScene("Drama beat", "#000000", 8, [
        makeText("DRAMA", { y: 0.05, fontPx: 18, color: "#fbbf24" }),
        makeChips(
          ["Northern Lights (2025) · ELENA · Lead"],
          { y: 0.88, height: 0.08, fontPx: 16, chipColor: "rgba(0,0,0,0.6)", textColor: "#ffffff" },
        ),
      ]),
      makeScene("Comedy beat", "#000000", 8, [
        makeText("COMEDY", { y: 0.05, fontPx: 18, color: "#fbbf24" }),
        makeChips(
          ["Cul-de-Sac (2024) · MAYA · Recurring"],
          { y: 0.88, height: 0.08, fontPx: 16, chipColor: "rgba(0,0,0,0.6)", textColor: "#ffffff" },
        ),
      ]),
      makeScene("Voice beat", "#000000", 8, [
        makeText("VOICE", { y: 0.05, fontPx: 18, color: "#fbbf24" }),
        makeChips(
          ["Echo Hollow (2025) · NARRATOR"],
          { y: 0.88, height: 0.08, fontPx: 16, chipColor: "rgba(0,0,0,0.6)", textColor: "#ffffff" },
        ),
      ]),
      makeScene("Contact", "#000000", 4, [
        makeCta("Get in touch", "Email Bell & Co", "mailto:reps@bellco.agency", {
          subheadline: "jamie@bellco.agency · IMDb: nm0123456",
          bgColor: "#0f172a",
          textColor: "#ffffff",
          accentColor: "#fbbf24",
          accentTextColor: "#0f172a",
        }),
      ]),
    ],
  }),

  director_pitch: () => ({
    ...emptyCanvasState(),
    scenes: [
      // Title + logline — the one-sentence movie.
      makeScene("Logline", "#0f172a", 6, [
        makeHeading("THE LAST FERRY", { y: 0.25, align: "center", color: "#ffffff", fontPx: 80 }),
        makeText(
          "A grieving cartographer races her estranged sister back to the last island before the storm wipes it from the map.",
          { y: 0.5, align: "center", fontPx: 22, color: "#e2e8f0", height: 0.25 },
        ),
        makeText("a feature by Lin Carrow", {
          y: 0.85, align: "center", fontPx: 18, color: "#a78bfa",
        }),
      ]),
      // Tone reference — comp titles.
      makeScene("Tone", "#1e1b4b", 6, [
        makeHeading("Tone", { y: 0.08, fontPx: 48, color: "#ffffff" }),
        makeText(
          "The Lighthouse meets Manchester by the Sea — water, weather, two sisters, one final crossing.",
          { y: 0.32, height: 0.4, fontPx: 26, color: "#e0e7ff" },
        ),
        makeChips(
          ["Drama", "Family", "Atmospheric", "Coastal Maine"],
          { y: 0.72, height: 0.18, fontPx: 22, chipColor: "rgba(167,139,250,0.25)", textColor: "#c4b5fd" },
        ),
      ]),
      // Characters — three beats max.
      makeScene("Characters", "#1e1b4b", 7, [
        makeHeading("Characters", { y: 0.08, fontPx: 48, color: "#ffffff" }),
        makeText(
          "• MAREN (38) — cartographer, mapping a dying island\n• JUNE (34) — her sister, has not been home in twelve years\n• THE FERRYMAN — knows what's coming, won't say",
          { y: 0.3, height: 0.6, fontPx: 24, color: "#e0e7ff" },
        ),
      ]),
      // The ask — budget, partnership, cast attachments.
      makeScene("Ask", "#0f172a", 5, [
        makeHeading("The ask", { y: 0.08, fontPx: 48, color: "#ffffff" }),
        makeText(
          "$2.4M production · seeking lead-cast attachment · principal photography Sept-Oct 2026 in Stonington, ME.",
          { y: 0.32, height: 0.45, fontPx: 24, color: "#fde68a" },
        ),
      ]),
      makeScene("Contact", "#0f172a", 4, [
        makeCta("Let's talk", "Read the treatment", "https://lincarrow.film/lastferry", {
          subheadline: "lin@lincarrow.film",
          bgColor: "#7c3aed",
          textColor: "#ffffff",
          accentColor: "#ffffff",
          accentTextColor: "#7c3aed",
        }),
      ]),
    ],
  }),

  casting_call: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#7c3aed", 4, [
        makeHeading("CASTING", { y: 0.25, align: "center", color: "#fde68a", fontPx: 72 }),
        makeText("THE LAST FERRY · feature · SAG-AFTRA Modified Low Budget", {
          y: 0.5, align: "center", fontPx: 26, color: "#ffffff",
        }),
        makeText("Self-tapes due Friday June 19", {
          y: 0.68, align: "center", fontPx: 22, color: "#fde68a",
        }),
      ]),
      // The role — name, age range, description, sides info.
      makeScene("Role", "#1e1b4b", 7, [
        makeHeading("JUNE", { y: 0.08, fontPx: 56, color: "#ffffff" }),
        makeText("Female-presenting · 30-38 · any ethnicity · supporting lead", {
          y: 0.25, fontPx: 22, color: "#a78bfa",
        }),
        makeText(
          "Estranged sister returning to her childhood island. Sharp, weather-beaten, guarded. Sides on the submission portal.",
          { y: 0.42, height: 0.4, fontPx: 24, color: "#e0e7ff" },
        ),
      ]),
      // Shoot + comp.
      makeScene("Shoot", "#1e1b4b", 5, [
        makeHeading("Shoot", { y: 0.08, fontPx: 48, color: "#ffffff" }),
        makeChips(
          ["Stonington, ME", "Sept-Oct 2026", "SAG-AFTRA MLB", "Travel + lodging covered"],
          { y: 0.35, height: 0.45, fontPx: 22, chipColor: "rgba(124,58,237,0.35)", textColor: "#c4b5fd" },
        ),
      ]),
      // Submission instructions — the most-important card.
      makeScene("Submit", "#0f172a", 5, [
        makeCta(
          "Submit your self-tape",
          "Open submission portal",
          "https://lincarrow.film/casting",
          {
            subheadline: "Slate + one read of the sides · landscape · 3 min max",
            bgColor: "#7c3aed",
            textColor: "#ffffff",
            accentColor: "#fde68a",
            accentTextColor: "#1e1b4b",
          },
        ),
      ]),
    ],
  }),

  // ─── Podcast seeds (Phase 2 of #894) ─────────────────────────────────────
  // Each scene becomes a chapter marker via `timeline.markers[]` once the
  // chapter editor (#907) is wired. For now the scene labels themselves
  // double as chapter cue points — the canvas-to-timeline emitter copies
  // them across on save. Visual layout still authored on the canvas
  // because the video-podcast export branch (MP4 with v-tracks) needs
  // something to compose; audio-only export ignores the visuals.

  podcast_trailer: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Cold open", "#0f172a", 8, [
        makeText("[COLD OPEN]", { y: 0.05, fontPx: 14, color: "#94a3b8" }),
        makeHeading("\"The job market changed overnight.\"", {
          y: 0.32, align: "center", color: "#ffffff", fontPx: 42, height: 0.25,
        }),
        makeText("A 5-second teaser quote that hooks the scroller.", {
          y: 0.7, align: "center", fontPx: 18, color: "#64748b",
        }),
      ]),
      makeScene("Show title", "#7c3aed", 6, [
        makeHeading("HIRED.", { y: 0.18, align: "center", color: "#fafafa", fontPx: 96 }),
        makeText("Conversations about work, careers, and the future of getting paid.", {
          y: 0.5, align: "center", fontPx: 22, color: "#e9d5ff", height: 0.15,
        }),
        makeText("Hosted by Alex Rivera · new episodes weekly", {
          y: 0.78, align: "center", fontPx: 18, color: "#c4b5fd",
        }),
      ]),
      makeScene("What you get", "#1e1b4b", 10, [
        makeHeading("Every Tuesday", { y: 0.08, fontPx: 44, color: "#ffffff" }),
        makeChips(
          [
            "Founder + recruiter interviews",
            "Hiring trend breakdowns",
            "Career pivot case studies",
            "Negotiation tactics",
          ],
          { y: 0.32, height: 0.5, fontPx: 24, chipColor: "rgba(167,139,250,0.25)", textColor: "#ddd6fe" },
        ),
      ]),
      makeScene("Subscribe CTA", "#0f172a", 6, [
        makeCta(
          "Listen wherever you podcast",
          "Open Apple Podcasts",
          "https://podcasts.apple.com/show/hired",
          {
            subheadline: "Apple · Spotify · Overcast · RSS",
            bgColor: "#7c3aed",
            textColor: "#ffffff",
            accentColor: "#fde68a",
            accentTextColor: "#1e1b4b",
          },
        ),
      ]),
    ],
  }),

  podcast_episode: () => ({
    ...emptyCanvasState(),
    scenes: [
      // Chapter 1 — Cold open + intro music bed.
      makeScene("01 · Cold open", "#0f172a", 10, [
        makeText("EPISODE 12", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("\"I quit a six-figure job to make ramen.\"", {
          y: 0.3, align: "center", color: "#ffffff", fontPx: 38, height: 0.3,
        }),
        makeText("[Intro music — 8 seconds, fade under]", {
          y: 0.78, align: "center", fontPx: 18, color: "#64748b",
        }),
      ]),
      // Chapter 2 — Host welcome + guest intro.
      makeScene("02 · Welcome", "#1e293b", 30, [
        makeHeading("Today's guest", { y: 0.08, fontPx: 44, color: "#ffffff" }),
        makeText("Maya Tanaka", { y: 0.3, fontPx: 36, color: "#fde68a" }),
        makeText(
          "Former Stripe PM · founder of Hoshi Ramen · raised $4.2M to scale a single shop into a chain.",
          { y: 0.46, fontPx: 22, color: "#e2e8f0", height: 0.3 },
        ),
        makeChips(
          ["Career pivot", "Founder story", "Negotiation"],
          { y: 0.8, height: 0.15, fontPx: 18, chipColor: "rgba(253,224,71,0.2)", textColor: "#fde68a" },
        ),
      ]),
      // Chapter 3 — Topic block 1.
      makeScene("03 · The decision", "#0f172a", 240, [
        makeHeading("Chapter 1 — The decision", { y: 0.1, fontPx: 40, color: "#ffffff" }),
        makeText(
          "How do you walk away from comp that's compounding? What did the math look like? What was the conversation at home?",
          { y: 0.32, fontPx: 24, color: "#cbd5e1", height: 0.45 },
        ),
      ]),
      // Chapter 4 — Topic block 2.
      makeScene("04 · The first year", "#0f172a", 240, [
        makeHeading("Chapter 2 — The first year", { y: 0.1, fontPx: 40, color: "#ffffff" }),
        makeText(
          "Real numbers. Burn, runway, the moment things almost broke. The mistake she'd never make again.",
          { y: 0.32, fontPx: 24, color: "#cbd5e1", height: 0.45 },
        ),
      ]),
      // Chapter 5 — Sponsor break.
      makeScene("05 · Break", "#7c3aed", 30, [
        makeText("[SPONSOR BREAK]", { y: 0.06, fontPx: 14, color: "#e9d5ff" }),
        makeHeading("We'll be right back", { y: 0.4, align: "center", color: "#ffffff", fontPx: 48 }),
      ]),
      // Chapter 6 — Topic block 3.
      makeScene("06 · The pivot", "#0f172a", 240, [
        makeHeading("Chapter 3 — The pivot", { y: 0.1, fontPx: 40, color: "#ffffff" }),
        makeText(
          "When did the second shop happen? What unlocked the Series A? What's the playbook now?",
          { y: 0.32, fontPx: 24, color: "#cbd5e1", height: 0.45 },
        ),
      ]),
      // Chapter 7 — Listener CTA + outro music.
      makeScene("07 · Outro", "#0f172a", 12, [
        makeCta(
          "If you liked this one",
          "Subscribe & share",
          "https://hired.video/podcast",
          {
            subheadline: "Apple · Spotify · Overcast · RSS · hired.video/podcast",
            bgColor: "#7c3aed",
            textColor: "#ffffff",
            accentColor: "#fde68a",
            accentTextColor: "#1e1b4b",
          },
        ),
      ]),
    ],
  }),

  podcast_interview: () => ({
    ...emptyCanvasState(),
    scenes: [
      // Cold open — teaser pull-quote.
      makeScene("Teaser", "#0f172a", 8, [
        makeText("[COLD OPEN — guest quote]", { y: 0.05, fontPx: 14, color: "#94a3b8" }),
        makeHeading(
          "\"I told the board: I'm hiring engineers who can sell or I'm walking.\"",
          { y: 0.28, align: "center", color: "#ffffff", fontPx: 34, height: 0.4 },
        ),
        makeText("— this week's guest, on the 1-year mark", {
          y: 0.78, align: "center", fontPx: 18, color: "#64748b",
        }),
      ]),
      // Host introduces show + guest.
      makeScene("Intro", "#1e293b", 20, [
        makeHeading("Today on Hired.", { y: 0.08, fontPx: 44, color: "#ffffff" }),
        makeText("Sam Chen — founder of Vellum, ex-VP Eng at Stripe", {
          y: 0.3, fontPx: 26, color: "#fde68a", height: 0.1,
        }),
        makeText(
          "We talk through the hiring decisions that almost broke his Series B and what he'd tell his 1-year-younger self.",
          { y: 0.5, fontPx: 22, color: "#e2e8f0", height: 0.35 },
        ),
      ]),
      // Topic 1.
      makeScene("Q1 · The early hires", "#0f172a", 180, [
        makeHeading("Q1 — The first ten hires", { y: 0.1, fontPx: 40, color: "#ffffff" }),
        makeText(
          "How did you find them? Which ones do you still talk to? Which ones do you regret?",
          { y: 0.32, fontPx: 24, color: "#cbd5e1", height: 0.45 },
        ),
      ]),
      // Topic 2.
      makeScene("Q2 · The bad year", "#0f172a", 180, [
        makeHeading("Q2 — The bad year", { y: 0.1, fontPx: 40, color: "#ffffff" }),
        makeText(
          "Walk us through the cap-table meeting. What changed after? What stayed the same that shouldn't have?",
          { y: 0.32, fontPx: 24, color: "#cbd5e1", height: 0.45 },
        ),
      ]),
      // Topic 3.
      makeScene("Q3 · The next bet", "#0f172a", 180, [
        makeHeading("Q3 — The next bet", { y: 0.1, fontPx: 40, color: "#ffffff" }),
        makeText(
          "What does Vellum look like in 24 months? What hire are you afraid to make? What's the contrarian view inside your team right now?",
          { y: 0.32, fontPx: 24, color: "#cbd5e1", height: 0.45 },
        ),
      ]),
      // Rapid-fire round.
      makeScene("Rapid fire", "#1e1b4b", 60, [
        makeHeading("Rapid fire", { y: 0.1, fontPx: 44, color: "#ffffff" }),
        makeChips(
          [
            "Best business book?",
            "Last book you didn't finish?",
            "City you'd move the company to?",
            "One hire you'd un-do?",
            "What replaces the resume in 5 years?",
          ],
          { y: 0.32, height: 0.55, fontPx: 22, chipColor: "rgba(167,139,250,0.25)", textColor: "#c4b5fd" },
        ),
      ]),
      // Outro — guest CTA + show CTA.
      makeScene("Where to find Sam", "#0f172a", 10, [
        makeCta(
          "Find Sam Chen",
          "@samchen on X",
          "https://x.com/samchen",
          {
            subheadline: "Vellum is hiring · vellum.dev/careers",
            bgColor: "#7c3aed",
            textColor: "#ffffff",
            accentColor: "#fde68a",
            accentTextColor: "#1e1b4b",
          },
        ),
      ]),
    ],
  }),

  // ─── Voice seeds (Phase 4 of #894) ──────────────────────────────────────
  // Audio-only kinds — scenes act as section cues the user records into
  // (voiceover lives on a2). Scene labels project onto `timeline.markers[]`
  // so a chapter editor (#907) finds these section breaks pre-populated.
  // Visual canvas content is minimal because audio-only export ignores it,
  // but the editor's preview surface needs something to paint — keep the
  // backdrops + labels recognisable so the user knows which read they're in.

  voice_audition_reel: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Slate", "#0f172a", 6, [
        makeText("VOICE AUDITION", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Jamie Bell", { y: 0.32, align: "center", color: "#ffffff", fontPx: 56 }),
        makeText("Bell & Co Voice · jamie@bellco.agency", {
          y: 0.55, align: "center", fontPx: 22, color: "#fbbf24",
        }),
      ]),
      makeScene("Read 1 · Warm narrator", "#1e293b", 15, [
        makeText("STYLE 1", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Warm narrator", { y: 0.3, align: "center", color: "#ffffff", fontPx: 40 }),
        makeText(
          "\"Some stories you carry. Others carry you. This is the second kind.\"",
          { y: 0.55, align: "center", fontPx: 22, color: "#e2e8f0", height: 0.3 },
        ),
      ]),
      makeScene("Read 2 · Energetic spot", "#1e1b4b", 15, [
        makeText("STYLE 2", { y: 0.06, fontPx: 14, color: "#c4b5fd" }),
        makeHeading("Energetic commercial", { y: 0.3, align: "center", color: "#ffffff", fontPx: 40 }),
        makeText(
          "\"Friday night. Game on. Half-price wings until ten. Tag a friend who's hungry.\"",
          { y: 0.55, align: "center", fontPx: 22, color: "#ddd6fe", height: 0.3 },
        ),
      ]),
      makeScene("Read 3 · Character voice", "#1e293b", 15, [
        makeText("STYLE 3", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Character — gruff veteran", { y: 0.3, align: "center", color: "#ffffff", fontPx: 36 }),
        makeText(
          "\"I told 'em the bridge wouldn't hold. They said: we'll cross when we get there.\"",
          { y: 0.55, align: "center", fontPx: 22, color: "#e2e8f0", height: 0.3 },
        ),
      ]),
      makeScene("Contact", "#0f172a", 5, [
        makeCta("Bell & Co Voice", "reps@bellco.agency", "mailto:reps@bellco.agency", {
          subheadline: "jamie@bellco.agency · 555-0142",
          bgColor: "#fbbf24",
          textColor: "#0f172a",
          accentColor: "#0f172a",
          accentTextColor: "#fbbf24",
        }),
      ]),
    ],
  }),

  voice_ivr_prompt: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Greeting", "#0f172a", 5, [
        makeText("IVR · GREETING", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Greeting", { y: 0.28, align: "center", color: "#ffffff", fontPx: 40 }),
        makeText(
          "\"Thanks for calling Acme Co. We're glad you're here.\"",
          { y: 0.5, align: "center", fontPx: 22, color: "#e2e8f0", height: 0.25 },
        ),
        makeText("Tone: warm, unhurried", {
          y: 0.82, align: "center", fontPx: 16, color: "#64748b",
        }),
      ]),
      makeScene("Menu options", "#1e293b", 12, [
        makeText("IVR · MENU", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Menu", { y: 0.16, align: "center", color: "#ffffff", fontPx: 36 }),
        makeText(
          "\"Press 1 for sales. Press 2 for support. Press 0 to reach a person.\"",
          { y: 0.36, align: "center", fontPx: 22, color: "#e2e8f0", height: 0.3 },
        ),
        makeText("Pause 1 second between options for the touch-tone capture window.", {
          y: 0.78, align: "center", fontPx: 16, color: "#64748b", height: 0.15,
        }),
      ]),
      makeScene("Hold handoff", "#0f172a", 4, [
        makeText("IVR · HOLD", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Handoff", { y: 0.28, align: "center", color: "#ffffff", fontPx: 40 }),
        makeText(
          "\"One moment — connecting you now.\"",
          { y: 0.52, align: "center", fontPx: 22, color: "#e2e8f0", height: 0.18,
          },
        ),
      ]),
    ],
  }),

  voice_audiobook_chapter: () => ({
    ...emptyCanvasState(),
    scenes: [
      // 2-second pre-roll silence for engineer trim.
      makeScene("Pre-roll", "#000000", 2, [
        makeText("[2-second silence — engineer trim point]", {
          y: 0.46, align: "center", fontPx: 18, color: "#475569", height: 0.1,
        }),
      ]),
      // Chapter slate — read aloud.
      makeScene("Chapter slate", "#0f172a", 6, [
        makeText("AUDIOBOOK", { y: 0.05, fontPx: 14, color: "#94a3b8" }),
        makeHeading("The Last Ferry", { y: 0.25, align: "center", color: "#ffffff", fontPx: 48 }),
        makeText("Chapter Four · The crossing", {
          y: 0.5, align: "center", fontPx: 26, color: "#fde68a",
        }),
        makeText("Read aloud as the chapter slate.", {
          y: 0.78, align: "center", fontPx: 16, color: "#64748b",
        }),
      ]),
      // Body — paced narration.
      makeScene("Narration", "#1e293b", 180, [
        makeText("NARRATION", { y: 0.05, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Body", { y: 0.16, fontPx: 36, color: "#ffffff" }),
        makeText(
          "Paste the chapter text here. Pace at roughly 150 words/min for audiobook delivery. Vary cadence on dialogue. Breath between paragraphs.",
          { y: 0.3, fontPx: 22, color: "#e2e8f0", height: 0.6 },
        ),
      ]),
      // 3-second silence outro — clean join point.
      makeScene("Outro silence", "#000000", 3, [
        makeText("[3-second silence — chapter join point]", {
          y: 0.46, align: "center", fontPx: 18, color: "#475569", height: 0.1,
        }),
      ]),
    ],
  }),

  // ─── Generic Promo seed (#926) ─────────────────────────────────────────
  // Closes the customer ask "why can't I make a promo video?". 4-scene
  // marketing arc: Problem → Product → Proof → Call-to-action. Realistic
  // placeholder copy so the press-play preview reads as a credible promo.
  product_promo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Problem", "#0f172a", 5, [
        makeText("THE PROBLEM", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("Your team writes the same emails every week.", {
          y: 0.34, align: "center", color: "#ffffff", fontPx: 38, height: 0.3,
        }),
        makeText("Hours every Friday — gone.", {
          y: 0.72, align: "center", fontPx: 22, color: "#fbbf24",
        }),
      ]),
      makeScene("Product", "#1e1b4b", 7, [
        makeHeading("Meet Inboxly.", { y: 0.1, align: "center", color: "#ffffff", fontPx: 56 }),
        makeText(
          "One-click reply suggestions trained on your past responses.",
          { y: 0.42, align: "center", fontPx: 24, color: "#e0e7ff", height: 0.3 },
        ),
        makeChips(
          ["Gmail · Outlook · Apple Mail", "Reads your tone", "Sends in 1 click"],
          { y: 0.74, height: 0.2, fontPx: 18, chipColor: "rgba(167,139,250,0.25)", textColor: "#ddd6fe" },
        ),
      ]),
      makeScene("Proof", "#0f172a", 6, [
        makeText("WHAT USERS SAY", { y: 0.06, fontPx: 14, color: "#94a3b8" }),
        makeHeading("\"6 hours back every week.\"", {
          y: 0.3, align: "center", color: "#ffffff", fontPx: 36, height: 0.3,
        }),
        makeText("— Priya R., Head of Sales · Lumen", {
          y: 0.62, align: "center", fontPx: 20, color: "#fde68a",
        }),
        makeText("4.9 ★ · 1,400 reviews", {
          y: 0.8, align: "center", fontPx: 18, color: "#cbd5e1",
        }),
      ]),
      makeScene("Call to action", "#0f172a", 6, [
        makeCta(
          "Try Inboxly free for 14 days",
          "Start free trial",
          "https://inboxly.app/start",
          {
            subheadline: "No card · Cancel anytime · 30-second setup",
            bgColor: "#7c3aed",
            textColor: "#ffffff",
            accentColor: "#fde68a",
            accentTextColor: "#1e1b4b",
          },
        ),
      ]),
    ],
  }),

  // ─── Social-video ad seeds (#1041 / `category: "ads"`) ───────────────
  // Each opens the v2 editor with the canvas sized to the platform's
  // official spec (pulled from `lib/studio/video-formats.ts`). Skeletal
  // content — the user is expected to swap copy in. The marketing arc
  // (hook → product → CTA) is the same one `product_promo` uses; the
  // dimension is the differentiator. Display-ad seeds (mediaKind="image")
  // live in `lib/studio/drawing/drawing-template-presets.ts` and don't
  // need an entry here.
  ad_social_reel_9x16: () => ({
    ...emptyCanvasState({ width: 1080, height: 1920, fps: 30 }),
    scenes: [
      makeScene("Hook (3s)", "#0f172a", 3, [
        makeHeading("Watch this →", { y: 0.32, align: "center", color: "#ffffff", fontPx: 64 }),
        makeText("Stop the scroll in the first second.", {
          y: 0.5, align: "center", fontPx: 28, color: "#fde68a", height: 0.1,
        }),
      ]),
      makeScene("Reveal", "#1e1b4b", 6, [
        makeHeading("Your product here.", { y: 0.3, align: "center", color: "#ffffff", fontPx: 56 }),
        makeText("One sentence that says what it does.", {
          y: 0.5, align: "center", fontPx: 24, color: "#e0e7ff", height: 0.2,
        }),
      ]),
      makeScene("CTA", "#0f172a", 4, [
        makeCta("Try it free", "Get started", "https://example.com", {
          subheadline: "Link in bio · 60-sec setup",
          bgColor: "#7c3aed",
          textColor: "#ffffff",
          accentColor: "#fde68a",
          accentTextColor: "#1e1b4b",
        }),
      ]),
    ],
  }),

  ad_meta_in_feed_4x5: () => ({
    ...emptyCanvasState({ width: 1080, height: 1350, fps: 30 }),
    scenes: [
      makeScene("Hook", "#0f172a", 3, [
        makeHeading("Here's the thing.", { y: 0.35, align: "center", color: "#ffffff", fontPx: 56 }),
        makeText("Hook them in 3 seconds.", {
          y: 0.55, align: "center", fontPx: 26, color: "#fde68a",
        }),
      ]),
      makeScene("Product", "#1e293b", 6, [
        makeHeading("Meet [Product].", { y: 0.2, align: "center", color: "#ffffff", fontPx: 52 }),
        makeText("One value claim. One image. One reason to care.", {
          y: 0.45, align: "center", fontPx: 24, color: "#e2e8f0", height: 0.2,
        }),
      ]),
      makeScene("CTA", "#0f172a", 4, [
        makeCta("Shop now", "Get yours", "https://example.com", {
          subheadline: "Free shipping · 30-day returns",
          bgColor: "#7c3aed",
          textColor: "#ffffff",
          accentColor: "#fde68a",
          accentTextColor: "#1e1b4b",
        }),
      ]),
    ],
  }),

  ad_pinterest_pin_2x3: () => ({
    ...emptyCanvasState({ width: 1000, height: 1500, fps: 30 }),
    scenes: [
      makeScene("Pin", "#0f172a", 6, [
        makeHeading("Big bold headline.", { y: 0.06, align: "center", color: "#ffffff", fontPx: 60, height: 0.18 }),
        makeText("Hero image goes here.", {
          y: 0.42, align: "center", fontPx: 22, color: "#cbd5e1",
        }),
        makeText("Save for later → tap to learn more.", {
          y: 0.86, align: "center", fontPx: 22, color: "#fde68a", height: 0.1,
        }),
      ]),
    ],
  }),

  ad_youtube_bumper_6s: () => ({
    ...emptyCanvasState({ width: 1920, height: 1080, fps: 30 }),
    scenes: [
      makeScene("One beat", "#1e1b4b", 6, [
        makeHeading("One product. One CTA.", { y: 0.3, align: "center", color: "#ffffff", fontPx: 72 }),
        makeText("6 seconds, no skip — make every frame count.", {
          y: 0.55, align: "center", fontPx: 28, color: "#fde68a",
        }),
        makeText("[Brand] · example.com", {
          y: 0.78, align: "center", fontPx: 22, color: "#cbd5e1",
        }),
      ]),
    ],
  }),

  ad_outdoor_billboard_4x1: () => ({
    ...emptyCanvasState({ width: 1920, height: 480, fps: 30 }),
    scenes: [
      makeScene("Billboard", "#7c3aed", 6, [
        makeHeading("Five words. Tops.", { y: 0.18, align: "center", color: "#ffffff", fontPx: 96, height: 0.5 }),
        makeText("[Brand] · short.url", {
          y: 0.72, align: "center", fontPx: 32, color: "#fde68a",
        }),
      ]),
    ],
  }),

  // ─── Comic genre seeds (#894 / mediaKind === "comic") ─────────────────
  // One seed per genre, all built from the shared `comicSeedFor()` helper.
  // The helper reads the genre's palette + stock assets + narrative beats
  // from `shared/comic-genres.ts` so adding a 13th genre needs zero
  // changes here — the spread below picks it up.
  ...Object.fromEntries(
    COMIC_GENRES.map(
      (g) => [`comic_${g.id}` as ContentTemplate, () => comicSeedFor(g)],
    ),
  ),

  // ─── Interactive comic ("Comic+") seeds (#929 / mediaKind === "interactive_comic") ──
  // Open with real comic pages instead of a blank canvas by reusing a
  // fitting genre's narrative beats; the branching graph is seeded blank
  // by `template-dispatch` and authored in the editor.
  icomic_branching_pitch: () => comicSeedForGenreId("hero"),
  icomic_choose_path: () => comicSeedForGenreId("adventure"),
  icomic_case_study: () => comicSeedForGenreId("slice"),
};
