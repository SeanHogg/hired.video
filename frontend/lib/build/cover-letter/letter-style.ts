/**
 * The cover letter's look on paper — ONE resolver from the letter's optional
 * `style` (shared/cover-letter.ts) to what every renderer needs: the type
 * (family, size, line height) and the sheet it prints on. A letter written
 * before styles existed has none and gets DEFAULT_LETTER_STYLE.
 *
 * Pure: no DOM, no React.
 */
import type { CoverLetterStyle } from "@shared/cover-letter";

export const DEFAULT_LETTER_STYLE: CoverLetterStyle = {
  font: "sans",
  size: 11,
  spacing: "normal",
  paper: "letter",
};

const FONT_FAMILY: Record<CoverLetterStyle["font"], string> = {
  sans: 'Calibri, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: '"Geist Mono", "Courier New", Courier, monospace',
};

const LINE_HEIGHT: Record<CoverLetterStyle["spacing"], string> = {
  tight: "1.3",
  normal: "1.5",
  relaxed: "1.75",
};

/** Sheet sizes in inches (portrait). */
const PAPER_IN: Record<CoverLetterStyle["paper"], { width: number; height: number }> = {
  letter: { width: 8.5, height: 11 },
  a4: { width: 8.27, height: 11.69 },
};

/** The letter's style with the defaults filled in (what a control shows). */
export function resolveLetterStyle(style?: CoverLetterStyle): CoverLetterStyle {
  return style ?? DEFAULT_LETTER_STYLE;
}

/** CSS `@page { size }` for print / PDF — A4 is exactly 210×297mm. */
export function letterPrintPageSize(style?: CoverLetterStyle): string {
  return resolveLetterStyle(style).paper === "a4" ? "210mm 297mm" : "8.5in 11in";
}

export function letterStyleVars(style?: CoverLetterStyle): {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  pageWidthIn: number;
  pageHeightIn: number;
} {
  const s = style ?? DEFAULT_LETTER_STYLE;
  const paper = PAPER_IN[s.paper] ?? PAPER_IN.letter;
  return {
    fontFamily: FONT_FAMILY[s.font] ?? FONT_FAMILY.sans,
    fontSize: `${s.size}pt`,
    lineHeight: LINE_HEIGHT[s.spacing] ?? LINE_HEIGHT.normal,
    pageWidthIn: paper.width,
    pageHeightIn: paper.height,
  };
}
