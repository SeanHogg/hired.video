/**
 * Tone — pick a tone, the whole letter is rewritten in it (free), and the
 * rewrite shows before / after until the person applies it (one Undo step;
 * the tone is stored on the letter) or keeps theirs. State and the AI call
 * live in useLetterTone (held by LetterInspector); this only draws them.
 */
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { COVER_LETTER_TONES, type CoverLetter, type CoverLetterTone } from "@shared/cover-letter";
import { Button } from "@/components/ui/button";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";
import type { LetterDrillProps } from "../letter-types";

/** One label key per shared tone — a new tone is a new entry here. */
export const TONE_LABEL_KEYS: Record<CoverLetterTone, string> = {
  warm: "workspace.letter.tone.warm",
  confident: "workspace.letter.tone.confident",
  formal: "workspace.letter.tone.formal",
  brief: "workspace.letter.tone.brief",
};

/** The letter body as the paragraphs a reader sees (the preview's text). Pure. */
export function letterBodyParagraphs(letter: CoverLetter): string[] {
  return [
    ...letter.opening,
    ...(letter.highlightsIntro ? [letter.highlightsIntro] : []),
    ...letter.highlights.map((h) => `• ${h.label ? `${h.label}. ` : ""}${h.text}`),
    ...letter.closing,
  ];
}

/** The tone shown as picked: the one being written / previewed, else the letter's own. Pure. */
export function pressedTone(letter: CoverLetter, tone: Pick<LetterDrillProps["tone"], "status" | "tone">): CoverLetterTone | null {
  return tone.status === "idle" ? (letter.tone ?? null) : tone.tone;
}

function BodyPreview({ title, letter, after }: { title: string; letter: CoverLetter; after: boolean }) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-2 rounded-lg border p-3 text-sm ${
        after ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground"
      }`}
    >
      <h4 className={INSPECTOR_LABEL}>{title}</h4>
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
        {letterBodyParagraphs(letter).map((para, i) => (
          <p key={i} className="whitespace-pre-line">
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}

export default function LetterToneDrill({ letter, onChange, tone }: LetterDrillProps) {
  const { t } = useTranslation();
  const readOnly = !onChange;
  const busy = tone.status === "rewriting";
  const toneName = tone.tone ? t(TONE_LABEL_KEYS[tone.tone]) : "";
  const pressed = pressedTone(letter, tone);

  return (
    <fieldset className="flex flex-col gap-3" disabled={readOnly}>
      <legend className="sr-only">{t("workspace.letter.tone.title")}</legend>
      <p className="text-xs text-muted-foreground">{t("workspace.letter.tone.hint")}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("workspace.letter.tone.title")}>
        {COVER_LETTER_TONES.map((id) => {
          const on = pressed === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={readOnly || busy}
              onClick={() => tone.rewrite(id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold disabled:opacity-50 ${
                on ? "border-primary bg-primary/10 text-primary" : "border-input bg-card text-foreground hover:bg-muted"
              }`}
            >
              {on && busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t(TONE_LABEL_KEYS[id])}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {busy && <p className="text-sm text-muted-foreground">{t("workspace.letter.tone.rewriting", { tone: toneName })}</p>}
        {(tone.status === "failed" || tone.status === "limited") && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>{t(tone.status === "limited" ? "workspace.letter.tone.limited" : "workspace.letter.tone.failed")}</span>
            {tone.status === "failed" && tone.tone && (
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => tone.tone && tone.rewrite(tone.tone)}>
                {t("build.letter.tryAgain")}
              </Button>
            )}
          </div>
        )}
        {tone.status === "preview" && tone.proposal && (
          <>
            <BodyPreview title={t("workspace.letter.tone.before")} letter={letter} after={false} />
            <BodyPreview title={t("workspace.letter.tone.after", { tone: toneName })} letter={tone.proposal} after />
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11" onClick={tone.apply}>
                {t("workspace.letter.tone.apply")}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={tone.keepMine}>
                {t("workspace.letter.tone.keepMine")}
              </Button>
            </div>
          </>
        )}
      </div>
    </fieldset>
  );
}
