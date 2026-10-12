/**
 * AI Presenter Avatar — stock presenter library (#1557).
 *
 * Each presenter is described as a small JSON shape (head + body + hair
 * + outfit colors) that the AvatarPresenterCanvas renderer paints to
 * canvas at runtime. Visemes (mouth shapes) are layered on top per
 * frame, driven by TTS `onBoundary` callbacks during preview and by
 * caption-cue timing during render.
 *
 * Visemes follow a simplified IPA-bucketed scheme that's good enough
 * for client-side lip-sync without a phoneme aligner:
 *   - rest:  closed neutral
 *   - ah:    open vowel ("ah", "uh")
 *   - oh:    rounded ("oh", "ow")
 *   - ee:    wide ("ee", "ay")
 *   - mm:    pressed lips ("mm", "bb", "pp")
 *
 * The 6 presenters cover gender / skin-tone / hair variations as a
 * starting stock library; BYO portrait support is the next iteration
 * (uploads carry a still photo + an alpha mask for the mouth region).
 */

export type Viseme = "rest" | "ah" | "oh" | "ee" | "mm";

export interface PresenterColors {
  /** Face / skin fill. */
  skin: string;
  /** Hair fill. */
  hair: string;
  /** Outfit / shirt fill. */
  outfit: string;
  /** Accent for tie / collar / earrings. */
  accent: string;
  /** Lip fill. */
  lips: string;
  /** Stroke / outline. */
  stroke: string;
}

export interface PresenterDefinition {
  id: string;
  label: string;
  description: string;
  colors: PresenterColors;
  /** Hair shape preset — the renderer paints one of these silhouettes. */
  hairStyle: "short" | "long" | "buzz" | "curly" | "bun" | "afro";
}

export const STOCK_PRESENTERS: PresenterDefinition[] = [
  {
    id: "presenter-amber",
    label: "Amber",
    description: "Professional female presenter, long brown hair, navy blazer.",
    hairStyle: "long",
    colors: {
      skin: "#f3d3b4",
      hair: "#5a3a22",
      outfit: "#1e2a4a",
      accent: "#d4af37",
      lips: "#c75a5a",
      stroke: "#1f2937",
    },
  },
  {
    id: "presenter-marcus",
    label: "Marcus",
    description: "Professional male presenter, short black hair, charcoal suit.",
    hairStyle: "short",
    colors: {
      skin: "#7a4a30",
      hair: "#1a1a1a",
      outfit: "#2d3748",
      accent: "#dc2626",
      lips: "#6a3a3a",
      stroke: "#1f2937",
    },
  },
  {
    id: "presenter-priya",
    label: "Priya",
    description: "Professional female presenter, bun, teal blouse.",
    hairStyle: "bun",
    colors: {
      skin: "#caa177",
      hair: "#2a1f1a",
      outfit: "#14b8a6",
      accent: "#f59e0b",
      lips: "#bf5a5a",
      stroke: "#1f2937",
    },
  },
  {
    id: "presenter-noah",
    label: "Noah",
    description: "Friendly male presenter, buzz cut, casual henley.",
    hairStyle: "buzz",
    colors: {
      skin: "#e9c4a3",
      hair: "#a87a4a",
      outfit: "#7c3aed",
      accent: "#ffffff",
      lips: "#9a5a4a",
      stroke: "#1f2937",
    },
  },
  {
    id: "presenter-rita",
    label: "Rita",
    description: "Female presenter, curly hair, emerald top.",
    hairStyle: "curly",
    colors: {
      skin: "#9a6a4a",
      hair: "#2a1a1a",
      outfit: "#059669",
      accent: "#f5deb3",
      lips: "#9a3a3a",
      stroke: "#1f2937",
    },
  },
  {
    id: "presenter-li",
    label: "Li",
    description: "Male presenter, short black hair, slate sweater.",
    hairStyle: "short",
    colors: {
      skin: "#f0d2a8",
      hair: "#1a1a1a",
      outfit: "#475569",
      accent: "#e0e7ff",
      lips: "#a96a5a",
      stroke: "#1f2937",
    },
  },
];

/** Picks a presenter by id with a defensive fallback. */
export function getPresenter(id: string | null | undefined): PresenterDefinition {
  return (
    STOCK_PRESENTERS.find((p) => p.id === id) ?? STOCK_PRESENTERS[0]
  );
}

/** Estimate a sequence of visemes from a piece of text. Pure heuristic
 *  — no phoneme aligner, no external dictionary. Bucketed against the
 *  5 supported mouth shapes. Returns one viseme per word; the renderer
 *  interpolates timing from the word-boundary callback. */
export function estimateVisemesForText(text: string): Viseme[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(visemeForWord);
}

function visemeForWord(word: string): Viseme {
  const lower = word.toLowerCase();
  // First-pass: prefer mm if the word starts with a bilabial consonant.
  if (/^[mbp]/.test(lower)) return "mm";
  // Otherwise pick the most prominent vowel.
  if (/oo|ow|oh|o[^aeiou]/.test(lower)) return "oh";
  if (/ee|ea|ey|ie|y$/.test(lower)) return "ee";
  if (/a|u/.test(lower)) return "ah";
  return "rest";
}
