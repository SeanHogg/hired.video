/**
 * The letter inspector's rows, as data (A2 Workspace board): Simple —
 * To · <recipient>, Highlights · <n> from your résumé, Tone · <tone>;
 * Advanced appends Font & size · Spacing · Page · Letter / A4. Each row's
 * hint, when it shows as changed, and the view it opens in the slot.
 */
import { defineDrills } from "@/components/workspace/inspector/inspector-drills";
import { PAPER_LABEL_KEYS } from "@/components/workspace/inspector/InspectorChoice";
import { resolveLetterStyle } from "@/lib/build/cover-letter/letter-style";
import type { CoverLetter } from "@shared/cover-letter";
import type { LetterDrillProps } from "./letter-types";
import LetterToDrill from "./drills/LetterToDrill";
import LetterHighlightsDrill from "./drills/LetterHighlightsDrill";
import LetterToneDrill, { TONE_LABEL_KEYS } from "./drills/LetterToneDrill";
import { LetterFontDrill, LetterPageDrill, LetterSpacingDrill } from "./drills/LetterStyleDrills";

export const LETTER_DRILL_IDS = ["to", "highlights", "tone", "font", "spacing", "page"] as const;
export type LetterDrillId = (typeof LETTER_DRILL_IDS)[number];

/** Who the letter goes to, in a few words: the first address line, else the organisation. Pure. */
export function letterRecipient(letter: CoverLetter): string | null {
  return letter.recipientLines.map((l) => l.trim()).find(Boolean) ?? (letter.organization.trim() || null);
}

export const LETTER_DRILLS = defineDrills<LetterDrillId, LetterDrillProps>(LETTER_DRILL_IDS, {
  to: { labelKey: "workspace.letter.to", depth: "simple", hint: ({ letter }) => letterRecipient(letter), View: LetterToDrill },
  highlights: {
    labelKey: "workspace.letter.highlights",
    depth: "simple",
    hint: ({ letter }, t) => t("workspace.letter.highlightsHint", { count: letter.highlights.length }),
    View: LetterHighlightsDrill,
  },
  tone: {
    labelKey: "workspace.letter.tone.title",
    depth: "simple",
    hint: ({ letter }, t) => (letter.tone ? t(TONE_LABEL_KEYS[letter.tone]) : null),
    View: LetterToneDrill,
  },
  font: {
    labelKey: "workspace.inspector.fontAndSize",
    depth: "advanced",
    hint: ({ letter }, t) => {
      const style = resolveLetterStyle(letter.style);
      return `${t(`workspace.letter.style.${style.font}`)} · ${t("workspace.letter.style.sizeValue", { size: style.size })}`;
    },
    View: LetterFontDrill,
  },
  spacing: {
    labelKey: "workspace.letter.style.spacing",
    depth: "advanced",
    hint: ({ letter }, t) => t(`workspace.letter.style.${resolveLetterStyle(letter.style).spacing}`),
    View: LetterSpacingDrill,
  },
  page: {
    labelKey: "workspace.letter.style.paper",
    depth: "advanced",
    hint: ({ letter }, t) => t(PAPER_LABEL_KEYS[resolveLetterStyle(letter.style).paper]),
    View: LetterPageDrill,
  },
});
