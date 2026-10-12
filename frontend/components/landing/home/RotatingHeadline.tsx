import { useTranslation } from "react-i18next";
import { useRotation } from "@/hooks/use-rotation";

/**
 * Rotating headline ("You're made to be <seen>.") and the line under it. A
 * headline with `whole` replaces the full sentence instead of the last word
 * ("Be Remembered.").
 */
const HEADLINES = [
  { id: "seen", whole: false },
  { id: "heard", whole: false },
  { id: "hired", whole: false },
  { id: "remembered", whole: true },
] as const;
type Headline = (typeof HEADLINES)[number];
const LINE_IDS = ["promote", "show", "more", "remember"] as const;
const ROTATE_MS = 2600;
/** Soft fade on each swap; reduced motion swaps without it. */
const FADE = "animate-in fade-in duration-500 motion-reduce:animate-none";

/**
 * The home page's person-first headline (Copy board, "you" voice). One word
 * and one line change about every 2.5 s. Screen readers hear the first
 * version only (the rotating copy is aria-hidden).
 */
export function RotatingHeadline() {
  const { t } = useTranslation();
  const word = useRotation(HEADLINES.length, ROTATE_MS);
  const line = useRotation(LINE_IDS.length, ROTATE_MS);
  const text = (h: Headline) => (h.whole ? t(`landing.hero.whole.${h.id}`) : `${t("landing.hero.lead")} ${t(`landing.hero.word.${h.id}`)}.`);
  const current = HEADLINES[word];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[clamp(44px,5.6vw,76px)] font-extrabold leading-none tracking-[-0.035em] text-foreground">
        <span className="sr-only">{text(HEADLINES[0])}</span>
        {current.whole ? (
          <span key={current.id} aria-hidden="true" className={`text-primary ${FADE}`}>
            {t(`landing.hero.whole.${current.id}`)}
          </span>
        ) : (
          <span aria-hidden="true">
            {t("landing.hero.lead")}{" "}
            <span key={current.id} className={`whitespace-nowrap text-primary ${FADE}`}>
              {t(`landing.hero.word.${current.id}`)}.
            </span>
          </span>
        )}
      </h1>
      <p className="min-h-[1.5em] text-xl font-semibold text-foreground">
        <span className="sr-only">{t(`landing.hero.line.${LINE_IDS[0]}`)}</span>
        <span key={LINE_IDS[line]} aria-hidden="true" className={`inline-block ${FADE}`}>
          {t(`landing.hero.line.${LINE_IDS[line]}`)}
        </span>
      </p>
    </div>
  );
}
