/**
 * To — who the letter goes to: the role, the organisation, the inside
 * address (one line each) and the greeting. The greeting can't be empty
 * (the letter's schema): its field can be cleared while retyping, and
 * leaving it empty puts the last greeting back (useFieldDraft).
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { CoverLetter } from "@shared/cover-letter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFieldDraft } from "@/components/workspace/inspector/use-field-draft";
import type { LetterDrillProps } from "../letter-types";

const FIELD = "flex flex-col gap-1 text-sm";

export default function LetterToDrill({ letter, onChange }: LetterDrillProps) {
  const { t } = useTranslation();
  const ids = useId();
  const set = <K extends keyof CoverLetter>(key: K, value: CoverLetter[K]) => onChange?.({ ...letter, [key]: value }, `letter:to:${key}`);
  const salutation = useFieldDraft(letter.salutation, (next) => set("salutation", next));

  return (
    <fieldset className="flex flex-col gap-3" disabled={!onChange}>
      <legend className="sr-only">{t("workspace.letter.to")}</legend>
      <label className={FIELD} htmlFor={`${ids}-role`}>
        {t("workspace.letter.role")}
        <Input id={`${ids}-role`} className="h-11" value={letter.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
      </label>
      <label className={FIELD} htmlFor={`${ids}-org`}>
        {t("workspace.letter.organization")}
        <Input id={`${ids}-org`} className="h-11" value={letter.organization} onChange={(e) => set("organization", e.target.value)} />
      </label>
      <label className={FIELD} htmlFor={`${ids}-address`}>
        {t("build.letter.recipient")}
        <Textarea
          id={`${ids}-address`}
          rows={3}
          value={letter.recipientLines.join("\n")}
          onChange={(e) => set("recipientLines", e.target.value.split("\n"))}
        />
      </label>
      <label className={FIELD} htmlFor={`${ids}-greeting`}>
        {t("build.letter.salutation")}
        <Input id={`${ids}-greeting`} className="h-11" {...salutation} />
      </label>
    </fieldset>
  );
}
