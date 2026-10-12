import { useTranslation } from "react-i18next";
import { HeroIllustration } from "@/components/landing/HeroIllustration";
import { usePublicVideoFeed } from "@/hooks/use-public-video-feed";
import { HERO_STACK_COUNT } from "@/lib/landing/video-wall";
import { cn } from "@/lib/utils";
import { PublicVideoCard } from "./PublicVideoCard";

/** Fan-out of the stack: the newest video in the middle, raised. */
const SLOT_CLASS = [
  "z-10 w-[min(250px,44%)] shadow-[0_24px_50px_-20px_hsl(var(--foreground)/0.55)]",
  "w-[min(170px,28%)] -rotate-[5deg] translate-y-5 opacity-90",
  "w-[min(170px,28%)] rotate-[5deg] translate-y-5 opacity-90",
] as const;
/** Visual order left → right: older, newest, older. */
const VISUAL_ORDER = [1, 0, 2] as const;

/**
 * The hero's right side: the three most recent posted videos under a
 * "Just posted on hired.video" tag. Until there are videos, the résumé →
 * video illustration stands in.
 */
export function JustPostedStack() {
  const { t } = useTranslation();
  const { videos } = usePublicVideoFeed();
  const shown = videos.slice(0, HERO_STACK_COUNT);
  if (shown.length === 0) return <HeroIllustration />;

  return (
    <figure className="relative flex min-h-[480px] items-center justify-center gap-3.5 pt-10">
      <figcaption className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-foreground">
        <span className="h-[7px] w-[7px] rounded-full bg-destructive" aria-hidden="true" />
        {t("landing.hero.justPosted")}
      </figcaption>
      {VISUAL_ORDER.filter((i) => shown[i]).map((i) => (
        <PublicVideoCard key={shown[i].id} video={shown[i]} bare className={cn("flex-none", SLOT_CLASS[i])} />
      ))}
    </figure>
  );
}
