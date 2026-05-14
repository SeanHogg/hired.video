/**
 * Seed a fresh CanvasState from a content-template id. The legacy
 * template catalog at [components/studio/templates/catalog.tsx]
 * generates scene-based storyboards for the classic editor; the v2
 * canvas editor seeds *its* equivalent here so the chooser's
 * "Personal Brand", "Video Resume" etc. cards land users on a usable
 * starting layout instead of a blank canvas.
 *
 * Per the standing DRY rule: every "new project from template" path —
 * the v2 landing chooser, the editor's "?template=" param, any future
 * deep-link — calls `seedCanvasFromTemplate()`. Templates that aren't
 * recognised fall through to the empty canvas (graceful).
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

// ───────────────────────────────────────────────────────────────────────────
// Per-template seeds. Each one returns a 1080p / 30fps canvas; the
// scene count + widget mix is just a starting layout — the user is
// expected to edit.
// ───────────────────────────────────────────────────────────────────────────

const SEEDS: Partial<Record<ContentTemplate, () => CanvasState>> = {
  basic: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Intro", "#0f172a", 6, [
        makeHeading("Your title", { y: 0.4, align: "center" }),
        makeText("Add your hook here.", { y: 0.62, align: "center", fontPx: 28 }),
      ]),
    ],
  }),

  profile: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hello", "#0f172a", 5, [
        makeHeading("Hi, I'm [Your Name]", { y: 0.35, align: "center" }),
        makeText("[Role] · [Specialty]", { y: 0.55, align: "center", fontPx: 28 }),
      ]),
      makeScene("What I do", "#1e293b", 6, [
        makeHeading("What I do", { y: 0.15, fontPx: 56 }),
        makeText("• Build [thing]\n• Lead [thing]\n• Specialise in [thing]", {
          y: 0.35,
          height: 0.4,
          fontPx: 28,
        }),
      ]),
      makeScene("Let's talk", "#0f172a", 4, [
        makeHeading("Let's talk", { y: 0.4, align: "center" }),
        makeText("[your-email]", { y: 0.6, align: "center", fontPx: 28 }),
      ]),
    ],
  }),

  resume: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 4, [
        makeHeading("[Your Name]", { y: 0.35, align: "center" }),
        makeText("[Current role] · [Years] years", {
          y: 0.55,
          align: "center",
          fontPx: 28,
        }),
      ]),
      makeScene("Experience", "#1e293b", 8, [
        makeHeading("Recent work", { y: 0.1, fontPx: 56 }),
        makeText("• [Company] — [Role]\n• [Company] — [Role]\n• [Company] — [Role]", {
          y: 0.3,
          height: 0.55,
          fontPx: 28,
        }),
      ]),
      makeScene("Skills", "#0f172a", 6, [
        makeHeading("Skills", { y: 0.15, fontPx: 56 }),
        makeShape("shape-rect", "#0ea5e9", {
          x: 0.08, y: 0.4, width: 0.2, height: 0.1, z: 1,
        }),
        makeShape("shape-rect", "#22c55e", {
          x: 0.32, y: 0.4, width: 0.2, height: 0.1, z: 1,
        }),
        makeShape("shape-rect", "#a855f7", {
          x: 0.56, y: 0.4, width: 0.2, height: 0.1, z: 1,
        }),
      ]),
      makeScene("Outro", "#0f172a", 4, [
        makeHeading("Let's chat", { y: 0.4, align: "center" }),
      ]),
    ],
  }),

  personal_brand: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#0f172a", 5, [
        makeHeading("[Your hook]", { y: 0.35, align: "center" }),
      ]),
      makeScene("Story", "#1e293b", 8, [
        makeHeading("My story", { y: 0.12, fontPx: 56 }),
        makeText("[Paragraph one]\n[Paragraph two]", {
          y: 0.3,
          height: 0.55,
          fontPx: 28,
        }),
      ]),
      makeScene("CTA", "#0f172a", 4, [
        makeHeading("Follow along", { y: 0.4, align: "center" }),
        makeText("[your link]", { y: 0.6, align: "center", fontPx: 28 }),
      ]),
    ],
  }),

  skills_demo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 4, [
        makeHeading("Skills demo", { y: 0.4, align: "center" }),
      ]),
      makeScene("Skill 1", "#1e293b", 6, [
        makeHeading("[Skill name]", { y: 0.12, fontPx: 56 }),
        makeText("Where I used it: [project / company]", {
          y: 0.32, fontPx: 28,
        }),
        makeShape("shape-rect", "#0ea5e9", {
          x: 0.08, y: 0.55, width: 0.84, height: 0.3, z: 1,
        }),
      ]),
      makeScene("Skill 2", "#1e293b", 6, [
        makeHeading("[Skill name]", { y: 0.12, fontPx: 56 }),
        makeText("Where I used it: [project / company]", {
          y: 0.32, fontPx: 28,
        }),
        makeShape("shape-rect", "#22c55e", {
          x: 0.08, y: 0.55, width: 0.84, height: 0.3, z: 1,
        }),
      ]),
    ],
  }),

  code_walkthrough: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 4, [
        makeHeading("[Project name]", { y: 0.35, align: "center" }),
        makeText("Walkthrough", { y: 0.55, align: "center", fontPx: 28 }),
      ]),
      makeScene("Architecture", "#1e293b", 8, [
        makeHeading("Architecture", { y: 0.1, fontPx: 56 }),
        makeShape("shape-rect", "#1e3a5f", {
          x: 0.1, y: 0.28, width: 0.8, height: 0.55, z: 1,
        }),
      ]),
      makeScene("Code", "#020617", 8, [
        makeText("// Paste a snippet here", {
          x: 0.05, y: 0.1, width: 0.9, height: 0.8, fontPx: 24, color: "#a5f3fc",
        }),
      ]),
    ],
  }),

  design_portfolio: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 4, [
        makeHeading("Design portfolio", { y: 0.4, align: "center" }),
      ]),
      makeScene("Project 1", "#1e293b", 6, [
        makeHeading("[Project name]", { y: 0.1, fontPx: 56 }),
        makeShape("shape-rect", "#a855f7", {
          x: 0.08, y: 0.3, width: 0.4, height: 0.55, z: 1,
        }),
        makeText("[What you designed]", { x: 0.52, y: 0.35, width: 0.4, fontPx: 24 }),
      ]),
    ],
  }),

  data_analysis: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Title", "#0f172a", 4, [
        makeHeading("Data analysis", { y: 0.4, align: "center" }),
      ]),
      makeScene("Insight", "#1e293b", 7, [
        makeHeading("[Headline insight]", { y: 0.1, fontPx: 56 }),
        makeShape("shape-rect", "#22c55e", {
          x: 0.1, y: 0.35, width: 0.8, height: 0.45, z: 1,
        }),
        makeText("[caption]", { y: 0.85, align: "center", fontPx: 24, height: 0.08 }),
      ]),
    ],
  }),

  job_ad: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#0f172a", 4, [
        makeHeading("We're hiring", { y: 0.4, align: "center" }),
        makeText("[Role]", { y: 0.6, align: "center", fontPx: 32 }),
      ]),
      makeScene("Why", "#1e293b", 6, [
        makeHeading("Why join us", { y: 0.1, fontPx: 56 }),
        makeText("• [Benefit one]\n• [Benefit two]\n• [Benefit three]", {
          y: 0.3, height: 0.55, fontPx: 28,
        }),
      ]),
      makeScene("Apply", "#0f172a", 3, [
        makeHeading("Apply", { y: 0.4, align: "center" }),
        makeText("[link]", { y: 0.6, align: "center", fontPx: 28 }),
      ]),
    ],
  }),

  company_promo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#0f172a", 4, [
        makeHeading("[Company name]", { y: 0.4, align: "center" }),
      ]),
      makeScene("What we do", "#1e293b", 7, [
        makeHeading("What we do", { y: 0.1, fontPx: 56 }),
        makeText("[One-line pitch]", { y: 0.35, fontPx: 32 }),
      ]),
      makeScene("CTA", "#0f172a", 3, [
        makeHeading("Learn more", { y: 0.4, align: "center" }),
      ]),
    ],
  }),

  sizzle_reel: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Open", "#0f172a", 3, [
        makeHeading("Best moments", { y: 0.4, align: "center" }),
      ]),
      makeScene("Clip 1", "#020617", 4, []),
      makeScene("Clip 2", "#020617", 4, []),
      makeScene("Close", "#0f172a", 3, [
        makeHeading("Thanks for watching", { y: 0.4, align: "center" }),
      ]),
    ],
  }),

  tool_promo: () => ({
    ...emptyCanvasState(),
    scenes: [
      makeScene("Hook", "#0f172a", 4, [
        makeHeading("[Tool name]", { y: 0.4, align: "center" }),
      ]),
      makeScene("Demo", "#020617", 8, [
        makeShape("shape-rect", "#1e3a5f", {
          x: 0.08, y: 0.1, width: 0.84, height: 0.7, z: 1,
        }),
        makeText("[caption]", { y: 0.85, align: "center", fontPx: 24, height: 0.08 }),
      ]),
      makeScene("Try it", "#0f172a", 3, [
        makeHeading("Try it free", { y: 0.4, align: "center" }),
        makeText("[link]", { y: 0.6, align: "center", fontPx: 28 }),
      ]),
    ],
  }),
};
