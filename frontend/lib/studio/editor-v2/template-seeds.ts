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
};
