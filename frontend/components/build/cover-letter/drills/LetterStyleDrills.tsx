/**
 * The letter's Advanced drills — how it is set on paper (A2 board: Font &
 * size · Spacing · Page · Letter / A4). Each writes `letter.style` through
 * `onChange` (one Undo group for a burst of style clicks); every renderer
 * reads it via letterStyleVars.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { CoverLetterStyleSchema, LETTER_FONT_SIZE_MAX, LETTER_FONT_SIZE_MIN, type CoverLetterStyle } from "@shared/cover-letter";
import { resolveLetterStyle } from "@/lib/build/cover-letter/letter-style";
import InspectorChoice, { PAPER_LABEL_KEYS } from "@/components/workspace/inspector/InspectorChoice";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";
import type { LetterDrillProps } from "../letter-types";

export const LETTER_STYLE_OPTIONS = {
  font: CoverLetterStyleSchema.shape.font.options,
  spacing: CoverLetterStyleSchema.shape.spacing.options,
  paper: CoverLetterStyleSchema.shape.paper.options,
} as const;

const STEP =
  "flex h-11 w-11 flex-none items-center justify-center rounded-md border border-input bg-card text-foreground hover:bg-muted disabled:opacity-40";

/** The letter's resolved style and a setter that writes one Undo group. */
function useLetterStyle({ letter, onChange }: LetterDrillProps) {
  const style = resolveLetterStyle(letter.style);
  const set = (patch: Partial<CoverLetterStyle>) => onChange?.({ ...letter, style: { ...style, ...patch } }, "letter:style");
  return { style, set, readOnly: !onChange };
}

export function LetterFontDrill(props: LetterDrillProps) {
  const { t } = useTranslation();
  const id = useId();
  const { style, set, readOnly } = useLetterStyle(props);
  return (
    <div className="flex flex-col gap-4">
      <InspectorChoice
        label={t("workspace.letter.style.font")}
        options={LETTER_STYLE_OPTIONS.font}
        value={style.font}
        optionLabel={(v) => t(`workspace.letter.style.${v}`)}
        onPick={(font) => set({ font })}
        disabled={readOnly}
      />
      <div className="flex flex-col gap-1.5">
        <span id={id} className={INSPECTOR_LABEL}>
          {t("workspace.letter.style.size")}
        </span>
        <div className="flex items-center gap-2" role="group" aria-labelledby={id}>
          <button
            type="button"
            className={STEP}
            disabled={readOnly || style.size <= LETTER_FONT_SIZE_MIN}
            onClick={() => set({ size: Math.max(LETTER_FONT_SIZE_MIN, style.size - 1) })}
            aria-label={t("workspace.letter.style.smaller")}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <output aria-live="polite" className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums">
            {t("workspace.letter.style.sizeValue", { size: style.size })}
          </output>
          <button
            type="button"
            className={STEP}
            disabled={readOnly || style.size >= LETTER_FONT_SIZE_MAX}
            onClick={() => set({ size: Math.min(LETTER_FONT_SIZE_MAX, style.size + 1) })}
            aria-label={t("workspace.letter.style.larger")}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function LetterSpacingDrill(props: LetterDrillProps) {
  const { t } = useTranslation();
  const { style, set, readOnly } = useLetterStyle(props);
  return (
    <InspectorChoice
      label={t("workspace.letter.style.spacing")}
      options={LETTER_STYLE_OPTIONS.spacing}
      value={style.spacing}
      optionLabel={(v) => t(`workspace.letter.style.${v}`)}
      onPick={(spacing) => set({ spacing })}
      disabled={readOnly}
    />
  );
}

export function LetterPageDrill(props: LetterDrillProps) {
  const { t } = useTranslation();
  const { style, set, readOnly } = useLetterStyle(props);
  return (
    <InspectorChoice
      label={t("workspace.letter.style.paper")}
      options={LETTER_STYLE_OPTIONS.paper}
      value={style.paper}
      optionLabel={(v) => t(PAPER_LABEL_KEYS[v])}
      onPick={(paper) => set({ paper })}
      disabled={readOnly}
    />
  );
}
