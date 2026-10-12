/**
 * The "This line" inspector's rows, as data (A2 Workspace board): Simple —
 * Wording · Findings · Job match; Advanced appends the résumé's look —
 * Font & size · Spacing · Colour · Page. Each row's hint, when it shows as
 * changed, and the view it opens in the slot.
 */
import { defineDrills } from "@/components/workspace/inspector/inspector-drills";
import { resumePaper, resumeSizeOf } from "@/lib/build/resume-style";
import type { LineDrillProps } from "./types";
import { FindingsDrill, MatchDrill, WordingDrill } from "./drills/LineSectionDrills";
import { ResumeColourDrill, ResumeFontDrill, ResumePageDrill, ResumeSpacingDrill } from "./drills/ResumeStyleDrills";
import {
  RESUME_COLOUR_LABEL_KEYS,
  RESUME_FONT_LABEL_KEYS,
  RESUME_PAPER_LABEL_KEYS,
  RESUME_SIZE_LABEL_KEYS,
  RESUME_SPACING_LABEL_KEYS,
} from "./drills/resume-style-labels";

export const LINE_DRILL_IDS = ["wording", "findings", "match", "font", "spacing", "colour", "page"] as const;
export type LineDrillId = (typeof LINE_DRILL_IDS)[number];

export const LINE_DRILLS = defineDrills<LineDrillId, LineDrillProps>(LINE_DRILL_IDS, {
  wording: {
    labelKey: "build.thisLine.wording.title",
    depth: "simple",
    // The board's "say how" when there is nothing suggested yet.
    hint: ({ data }, t) =>
      data.suggestions.length > 0 ? t("build.thisLine.wording.hint", { count: data.suggestions.length }) : t("build.thisLine.wording.hintNone"),
    View: WordingDrill,
  },
  findings: {
    labelKey: "build.thisLine.findings.title",
    depth: "simple",
    hint: ({ data }) => (data.findings.length > 0 ? String(data.findings.length) : null),
    View: FindingsDrill,
  },
  match: {
    labelKey: "build.thisLine.match.title",
    depth: "simple",
    hint: ({ data }) => (data.jobMatch ? [String(data.jobMatch.score), data.jobMatch.jobLabel].filter(Boolean).join(" · ") : null),
    View: MatchDrill,
  },
  font: {
    labelKey: "workspace.inspector.fontAndSize",
    depth: "advanced",
    hint: ({ design }, t) =>
      `${t(RESUME_FONT_LABEL_KEYS[design.descriptor.theme.fontFamily])} · ${t(RESUME_SIZE_LABEL_KEYS[resumeSizeOf(design.style)])}`,
    isSet: ({ design }) => !!design.style.font || !!design.style.size,
    View: ResumeFontDrill,
  },
  spacing: {
    labelKey: "workspace.letter.style.spacing",
    depth: "advanced",
    hint: ({ design }, t) => t(RESUME_SPACING_LABEL_KEYS[design.descriptor.theme.density]),
    isSet: ({ design }) => !!design.style.spacing,
    View: ResumeSpacingDrill,
  },
  colour: {
    labelKey: "workspace.inspector.colour",
    depth: "advanced",
    hint: ({ design }, t) => t(RESUME_COLOUR_LABEL_KEYS[design.descriptor.theme.themeKey]),
    isSet: ({ design }) => !!design.style.colour,
    View: ResumeColourDrill,
  },
  page: {
    labelKey: "workspace.letter.style.paper",
    depth: "advanced",
    hint: ({ design }, t) => t(RESUME_PAPER_LABEL_KEYS[resumePaper(design.descriptor)]),
    isSet: ({ design }) => !!design.style.paper,
    View: ResumePageDrill,
  },
});
