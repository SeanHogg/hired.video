import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Illustrative persona shown on the composition (a proper name, not copy). */
const SAMPLE_NAME = "Sean Hogg";

const SKILL_KEYS = ["research", "figma", "systems"] as const;

/** Grey placeholder text line on the paper resume. */
function Line({ className }: { className?: string }) {
  return <div className={cn("h-1.5 rounded-[3px] bg-border", className)} />;
}

/** Mono section label on the paper resume ("EXPERIENCE", "SKILLS"). */
function ResumeLabel({ children }: { children: string }) {
  return (
    <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">{children}</div>
  );
}

/** Mono channel tag printed on a video tile ("YOUTUBE · 16:9"). */
function TileTag({ children, className }: { children: string; className?: string }) {
  return <span className={cn("font-mono text-[9px] uppercase text-ink-muted", className)}>{children}</span>;
}

/** The paper resume, tilted, on the left of the composition. */
function PaperResume() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-[250px] flex-[1_1_200px] -rotate-3 flex-col gap-2.5 rounded-[10px] border border-border bg-card px-5 py-[22px] text-foreground shadow-[0_24px_50px_-28px_hsl(var(--foreground)/0.45)]">
      <div className="font-display text-[19px] font-bold tracking-[-0.01em]">{SAMPLE_NAME}</div>
      <div className="text-xs text-muted-foreground">{t("landing.illustration.jobTitle")}</div>
      <ResumeLabel>{t("landing.illustration.experience")}</ResumeLabel>
      <Line className="w-[90%]" />
      <Line className="w-[76%]" />
      <Line className="w-[84%]" />
      <ResumeLabel>{t("landing.illustration.skills")}</ResumeLabel>
      <div className="flex flex-wrap gap-[5px]">
        {SKILL_KEYS.map((k) => (
          <span key={k} className="rounded-md bg-accent/60 px-[7px] py-[3px] text-[10px]">
            {t(`landing.illustration.skill.${k}`)}
          </span>
        ))}
      </div>
      <Line className="mt-1.5 w-[64%]" />
      <Line className="w-[80%]" />
    </div>
  );
}

/**
 * Hero composition: one paper resume becoming a 16:9 YouTube video, a 9:16
 * Short, a 1:1 LinkedIn post and a profile banner. Pure tokens; exposed to AT
 * as a single labelled image.
 */
export function HeroIllustration() {
  const { t } = useTranslation();
  return (
    <div
      role="img"
      aria-label={t("landing.illustration.ariaLabel")}
      className="flex flex-wrap items-center gap-5"
    >
      <PaperResume />

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
        {/* YouTube 16:9 */}
        <div className="relative flex aspect-video items-center gap-4 overflow-hidden rounded-[14px] bg-ink p-[18px]">
          <div className="flex aspect-square w-[26%] flex-none items-center justify-center rounded-full border-2 border-ink-accent bg-ink-raised font-mono text-[10px] uppercase text-ink-muted">
            {t("landing.illustration.photo")}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="font-display text-2xl font-bold leading-none text-ink-foreground">{SAMPLE_NAME}</div>
            <div className="text-[13px] text-ink-muted">{t("landing.illustration.tagline")}</div>
          </div>
          <div className="absolute bottom-3 left-[18px] right-[18px] h-[3px] rounded-sm bg-ink-raised">
            <div className="h-[3px] w-[38%] rounded-sm bg-ink-accent" />
          </div>
          <TileTag className="absolute right-3.5 top-3 text-[10px]">{t("landing.illustration.youtubeTag")}</TileTag>
        </div>

        <div className="grid grid-cols-[0.62fr_1fr] items-end gap-3">
          {/* Shorts 9:16 */}
          <div className="relative flex aspect-[9/16] flex-col justify-end gap-1.5 rounded-[14px] bg-ink p-3">
            <TileTag className="absolute left-3 top-2.5">{t("landing.illustration.shortsTag")}</TileTag>
            <div className="font-display text-[17px] font-bold leading-[1.05] text-ink-foreground">
              {t("landing.illustration.shortsTitle")}
            </div>
            <div className="h-[3px] w-[60%] rounded-sm bg-ink-accent" />
          </div>

          <div className="flex flex-col gap-3">
            {/* LinkedIn 1:1 */}
            <div className="flex aspect-square flex-col justify-between rounded-[14px] bg-accent p-3.5">
              <span className="font-mono text-[9px] uppercase text-primary">{t("landing.illustration.linkedinTag")}</span>
              <div className="font-display text-lg font-bold leading-[1.05] text-accent-foreground">
                {t("landing.illustration.linkedinTitle")}
              </div>
            </div>
            {/* Profile banner 4:1 */}
            <div className="flex aspect-[4/1] items-center rounded-[10px] bg-ink px-3">
              <TileTag>{t("landing.illustration.bannerTag")}</TileTag>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
