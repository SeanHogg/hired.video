/**
 * AudienceHeroArt — the hero imagery of a /for/:audience page (#922). Which
 * composition draws comes from the audience registry (`AudienceDef.heroArt`):
 *
 *   resume → the home hero's paper résumé becoming a video, a Short, a post
 *   reel   → a 16:9 video, a 9:16 Short and a 1:1 post, titled with the
 *            audience's own templates (so every page shows what IT makes)
 *   brand  → a company card becoming a job video
 *
 * Pure tokens (ink / accent / card), so it reads in light and dark mode and
 * wraps at 360px. Exposed to assistive tech as one labelled image.
 */
import { useTranslation } from "react-i18next";
import type { AudienceHeroArt as HeroArtKind } from "@/lib/studio/templates/audiences";
import type { TemplateDef } from "@/lib/studio/templates/catalog";
import { cn } from "@/lib/utils";
import { HeroIllustration } from "./HeroIllustration";

interface AudienceHeroArtProps {
  art: HeroArtKind;
  /** The audience's localized plural label ("Actors"). */
  label: string;
  /** The audience's templates, catalog order (first three title the tiles). */
  templates: readonly TemplateDef[];
}

function TileTag({ children, className }: { children: string; className?: string }) {
  return <span className={cn("font-mono text-[9px] uppercase text-ink-muted", className)}>{children}</span>;
}

function ProgressBar({ width }: { width: string }) {
  return (
    <div className="absolute bottom-3 left-[18px] right-[18px] h-[3px] rounded-sm bg-ink-raised">
      <div className="h-[3px] rounded-sm bg-ink-accent" style={{ width }} />
    </div>
  );
}

/** A 16:9 ink video tile: big title, small subtitle, a tag and a play bar. */
function WideTile({ title, subtitle, tag }: { title: string; subtitle: string; tag: string }) {
  return (
    <div className="relative flex aspect-video min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-[14px] bg-ink p-[18px]">
      <div className="break-words font-display text-2xl font-bold leading-none text-ink-foreground">{title}</div>
      <div className="line-clamp-2 text-[13px] text-ink-muted">{subtitle}</div>
      <ProgressBar width="38%" />
      <TileTag className="absolute right-3.5 top-3 text-[10px]">{tag}</TileTag>
    </div>
  );
}

function ReelArt({ label, templates }: { label: string; templates: readonly TemplateDef[] }) {
  const { t } = useTranslation();
  const [first, second, third] = templates;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <WideTile
        title={label}
        subtitle={first?.label ?? t("audienceLanding.art.yourVideo")}
        tag={t("audienceLanding.art.videoTag")}
      />
      <div className="grid grid-cols-[0.62fr_1fr] items-end gap-3">
        <div className="relative flex aspect-[9/16] min-w-0 flex-col justify-end gap-1.5 rounded-[14px] bg-ink p-3">
          <TileTag className="absolute left-3 top-2.5">{t("audienceLanding.art.shortTag")}</TileTag>
          <div className="line-clamp-3 font-display text-[17px] font-bold leading-[1.05] text-ink-foreground">
            {second?.label ?? t("audienceLanding.art.yourShort")}
          </div>
          <div className="h-[3px] w-[60%] rounded-sm bg-ink-accent" />
        </div>
        <div className="flex aspect-square min-w-0 flex-col justify-between rounded-[14px] bg-accent p-3.5">
          <span className="font-mono text-[9px] uppercase text-primary">{t("audienceLanding.art.postTag")}</span>
          <div className="line-clamp-3 font-display text-lg font-bold leading-[1.05] text-accent-foreground">
            {third?.label ?? t("audienceLanding.art.yourPost")}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandArt({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex max-w-[250px] flex-[1_1_200px] -rotate-3 flex-col gap-3 rounded-[10px] border border-border bg-card px-5 py-[22px] text-foreground shadow-[0_24px_50px_-28px_hsl(var(--foreground)/0.45)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground" aria-hidden="true">
            {label.charAt(0)}
          </div>
          <div className="min-w-0 font-display text-[17px] font-bold leading-tight">{t("audienceLanding.art.yourCompany")}</div>
        </div>
        <span className="self-start rounded-md bg-accent/60 px-2 py-1 text-[11px] font-semibold">
          {t("audienceLanding.art.hiring")}
        </span>
        <div className="h-1.5 w-[90%] rounded-[3px] bg-border" />
        <div className="h-1.5 w-[76%] rounded-[3px] bg-border" />
        <div className="h-1.5 w-[84%] rounded-[3px] bg-border" />
      </div>
      <div className="min-w-0 flex-[1_1_260px]">
        <WideTile
          title={t("audienceLanding.art.jobTitle")}
          subtitle={t("audienceLanding.art.jobSubtitle")}
          tag={t("audienceLanding.art.videoTag")}
        />
      </div>
    </div>
  );
}

export function AudienceHeroArt({ art, label, templates }: AudienceHeroArtProps) {
  const { t } = useTranslation();
  if (art === "resume") return <HeroIllustration />;
  return (
    <div role="img" aria-label={t("audienceLanding.art.ariaLabel", { label })}>
      {art === "reel" ? <ReelArt label={label} templates={templates} /> : <BrandArt label={label} />}
    </div>
  );
}
