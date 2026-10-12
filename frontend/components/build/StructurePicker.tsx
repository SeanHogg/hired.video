/**
 * Three resume structures as a radio group (visually: stacked option cards);
 * the recommended one carries a green mono chip.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { RESUME_STRUCTURES, type ResumeStructure } from "@shared/resume-insights";
import { cn } from "@/lib/utils";
import { STRUCTURE_LABEL_KEYS, STRUCTURE_WHY_KEYS } from "@/lib/build/insight-labels";

interface StructurePickerProps {
  /** null = none picked (an existing résumé keeping its template's order). */
  value: ResumeStructure | null;
  recommended: ResumeStructure;
  onChange: (structure: ResumeStructure) => void;
}

export default function StructurePicker({ value, recommended, onChange }: StructurePickerProps) {
  const { t } = useTranslation();
  const name = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {t("build.structure.title")}
      </legend>
      {RESUME_STRUCTURES.map((s) => {
        const checked = value === s;
        return (
          <label
            key={s}
            className={cn(
              "flex min-h-14 cursor-pointer flex-col items-start gap-0.5 rounded-xl text-left text-foreground transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
              checked
                ? "border-2 border-primary bg-accent/40 px-[13px] py-[11px]"
                : "border border-border bg-card px-3.5 py-3 hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={s}
              checked={checked}
              onChange={() => onChange(s)}
              className="sr-only"
            />
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-semibold first-letter:uppercase">{t(STRUCTURE_LABEL_KEYS[s])}</strong>
              {s === recommended && (
                <span className="rounded-[5px] bg-brand-green/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-brand-green-text">
                  {t("build.structure.recommended")}
                </span>
              )}
            </span>
            <span className="text-[13px] text-muted-foreground">{t(STRUCTURE_WHY_KEYS[s])}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
