/**
 * The "This line" Advanced drills — the résumé's look over its template
 * (A2 board: Font & size · Spacing · Colour · Page · Letter / A4). Each
 * writes the résumé's design (useResumeInsights.setStyle → saved on
 * `content.meta.style`), so the page, /resumes/:id and the PDF all follow.
 * They reach the whole résumé, not just the selected line; "Use the
 * template's" puts a setting back.
 */
import { useTranslation } from "react-i18next";
import { THEMES, type ThemeKey } from "@/lib/resume-template-themes";
import { RESUME_COLOURS, RESUME_FONTS, RESUME_PAPERS, RESUME_SIZES, RESUME_SPACINGS, resumePaper, resumeSizeOf, type ResumeStyle } from "@/lib/build/resume-style";
import { cn } from "@/lib/utils";
import InspectorChoice from "@/components/workspace/inspector/InspectorChoice";
import { INSPECTOR_HELP, INSPECTOR_LABEL, INSPECTOR_RESET } from "@/components/workspace/inspector/inspector-styles";
import type { LineDrillProps } from "../types";
import {
  RESUME_COLOUR_LABEL_KEYS,
  RESUME_FONT_LABEL_KEYS,
  RESUME_PAPER_LABEL_KEYS,
  RESUME_SIZE_LABEL_KEYS,
  RESUME_SPACING_LABEL_KEYS,
} from "./resume-style-labels";

/** "Applies to the whole résumé" + the reset, under each drill. */
function StyleFooter({ fields, design }: { fields: Array<keyof ResumeStyle>; design: LineDrillProps["design"] }) {
  const { t } = useTranslation();
  const set = fields.some((f) => design.style[f] !== undefined);
  const reset = () => design.setStyle(Object.fromEntries(fields.map((f) => [f, undefined])) as Partial<ResumeStyle>);
  return (
    <>
      <p className={INSPECTOR_HELP}>{t("build.resumeStyle.wholeResume")}</p>
      <button type="button" className={INSPECTOR_RESET} disabled={!set} onClick={reset}>
        {t("build.resumeStyle.useTemplate")}
      </button>
    </>
  );
}

export function ResumeFontDrill({ design }: LineDrillProps) {
  const { t } = useTranslation();
  const { theme } = design.descriptor;
  return (
    <div className="flex flex-col gap-4">
      <InspectorChoice
        label={t("workspace.letter.style.font")}
        options={RESUME_FONTS}
        value={theme.fontFamily}
        optionLabel={(f) => t(RESUME_FONT_LABEL_KEYS[f])}
        onPick={(font) => design.setStyle({ font })}
      />
      <InspectorChoice
        label={t("workspace.letter.style.size")}
        options={RESUME_SIZES}
        value={resumeSizeOf(design.style)}
        optionLabel={(s) => t(RESUME_SIZE_LABEL_KEYS[s])}
        onPick={(size) => design.setStyle({ size: size === "medium" ? undefined : size })}
      />
      <StyleFooter fields={["font", "size"]} design={design} />
    </div>
  );
}

export function ResumeSpacingDrill({ design }: LineDrillProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <InspectorChoice
        label={t("workspace.letter.style.spacing")}
        options={RESUME_SPACINGS}
        value={design.descriptor.theme.density}
        optionLabel={(d) => t(RESUME_SPACING_LABEL_KEYS[d])}
        onPick={(spacing) => design.setStyle({ spacing })}
      />
      <StyleFooter fields={["spacing"]} design={design} />
    </div>
  );
}

export function ResumeColourDrill({ design }: LineDrillProps) {
  const { t } = useTranslation();
  const current = design.descriptor.theme.themeKey;
  const pick = (colour: ThemeKey) => design.setStyle({ colour });
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className={cn(INSPECTOR_LABEL, "mb-1")}>{t("workspace.inspector.colour")}</legend>
        <div role="radiogroup" aria-label={t("workspace.inspector.colour")} className="grid grid-cols-2 gap-2">
          {RESUME_COLOURS.map((key) => {
            const on = key === current;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(key)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-left text-[13px] font-medium",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
                )}
              >
                {/* The résumé's own accent (paper colours, not the app's theme). */}
                <span aria-hidden="true" className={cn("h-5 w-5 flex-none rounded-full border-4", THEMES[key].accentBorder, THEMES[key].accentBgSoft)} />
                <span className="min-w-0 truncate">{t(RESUME_COLOUR_LABEL_KEYS[key])}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <StyleFooter fields={["colour"]} design={design} />
    </div>
  );
}

export function ResumePageDrill({ design }: LineDrillProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <InspectorChoice
        label={t("workspace.letter.style.paper")}
        options={RESUME_PAPERS}
        value={resumePaper(design.descriptor)}
        optionLabel={(p) => t(RESUME_PAPER_LABEL_KEYS[p])}
        onPick={(paper) => design.setStyle({ paper: paper === "letter" ? undefined : paper })}
      />
      <StyleFooter fields={["paper"]} design={design} />
    </div>
  );
}
