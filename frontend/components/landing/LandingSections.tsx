import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { HOME_ANCHOR_IDS } from "@/lib/nav/public-nav";

const STEPS = [
  {
    id: "create",
    number: "01",
    card: "bg-primary/5",
    tone: "text-primary",
    points: ["upload", "paste", "describe"],
  },
  {
    id: "target",
    number: "02",
    card: "bg-accent/40",
    tone: "text-primary",
    points: ["tailor", "letter", "video"],
  },
  {
    id: "promote",
    number: "03",
    card: "bg-brand-green/5",
    tone: "text-brand-green-text",
    points: ["post", "pro", "profile"],
  },
] as const;

const POINT_LETTERS = ["A", "B", "C"] as const;

/** "Three steps. That's the whole product." — white full-bleed band. */
export function LandingSteps({ proPrice }: { proPrice: string }) {
  const { t } = useTranslation();
  return (
    <MarketingBand tone="card" id={HOME_ANCHOR_IDS.howItWorks} labelledBy="landing-steps-title" className="flex flex-col gap-12 py-24 sm:py-24">
      <MarketingSectionIntro id="landing-steps-title" title={t("landing.steps.title")} className="max-w-[560px]" />
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-6">
        {STEPS.map((step) => (
          <li
            key={step.id}
            className={cn("flex flex-col gap-[18px] rounded-[22px] border border-border p-8", step.card)}
          >
            <span
              className={cn("font-display text-[64px] font-extrabold leading-[0.9] tracking-[-0.04em]", step.tone)}
              aria-hidden="true"
            >
              {step.number}
            </span>
            <h3 className="font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
              {t(`landing.steps.${step.id}.title`)}
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground">{t(`landing.steps.${step.id}.body`)}</p>
            <ul className="flex flex-col gap-2.5 text-[15px] text-foreground">
              {step.points.map((p, i) => (
                <li key={p} className="flex items-baseline gap-2.5">
                  <span className={cn("font-mono text-xs", step.tone)} aria-hidden="true">
                    {POINT_LETTERS[i]}
                  </span>
                  <span>{t(`landing.steps.${step.id}.${p}`, { price: proPrice })}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </MarketingBand>
  );
}

/** Play glyph for the format previews; colour comes from `className` (fill-current). */
function PlayGlyph({ className }: { className: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" className={cn("fill-current", className)}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

const FORMAT_IDS = ["youtube", "linkedin", "vertical", "banner", "profile"] as const;

/** Decorative preview tile per format (shape + surface only). */
function FormatPreview({ id }: { id: (typeof FORMAT_IDS)[number] }) {
  switch (id) {
    case "youtube":
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-ink">
          <PlayGlyph className="text-ink-accent" />
        </div>
      );
    case "linkedin":
      return (
        <div className="flex aspect-square items-center justify-center rounded-xl bg-accent">
          <PlayGlyph className="text-primary" />
        </div>
      );
    case "vertical":
      return (
        <div className="flex aspect-[9/16] max-h-[260px] items-center justify-center rounded-xl bg-ink">
          <PlayGlyph className="text-ink-positive" />
        </div>
      );
    case "banner":
      return <div className="aspect-[4/1] rounded-lg bg-ink" />;
    case "profile":
      return (
        <div className="flex aspect-[4/3] flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
          <div className="h-[18px] w-[18px] rounded-full bg-accent" />
          <div className="h-1.5 w-[70%] rounded-[3px] bg-border" />
          <div className="flex-1 rounded-md bg-ink" />
        </div>
      );
  }
}

/** "One resume, every channel." format tiles. */
export function LandingFormats() {
  const { t } = useTranslation();
  return (
    <MarketingBand id="formats" labelledBy="landing-formats-title" className="flex flex-col gap-10 py-24 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <MarketingSectionIntro id="landing-formats-title" title={t("landing.formats.title")} className="max-w-[480px]" />
        <p className="max-w-[30em] text-base text-muted-foreground">{t("landing.formats.subtitle")}</p>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] items-end gap-5">
        {FORMAT_IDS.map((id) => (
          <li key={id} className="flex flex-col gap-3">
            <div aria-hidden="true">
              <FormatPreview id={id} />
            </div>
            <h3 className="font-semibold text-foreground">{t(`landing.formats.${id}.title`)}</h3>
            <p className="font-mono text-xs text-muted-foreground">{t(`landing.formats.${id}.meta`)}</p>
          </li>
        ))}
      </ul>
    </MarketingBand>
  );
}
