// Hero for every job-seeker SEO landing page (/for, /sectors, /in, /salary,
// /resume-guide, /resume-templates, template pages…). Same anatomy as the
// home and /rewards heroes: mono eyebrow chip → display h1 → muted lede →
// primary CTA (defaults to the kit entry) + secondary text link, with an
// optional aside column. Pages pass copy only; layout lives here.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { cn } from "@/lib/utils";

export interface HeroLink {
  to: string;
  label: string;
}

interface SeoHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Primary CTA. Omit for "Build my resume" → the kit workspace; `null` hides it. */
  primary?: HeroLink | null;
  secondary?: HeroLink;
  /** Right-hand column (illustration, stat card…). */
  aside?: ReactNode;
  /** Extra content under the CTAs (chips, meta line). */
  children?: ReactNode;
  className?: string;
}

/** Mono uppercase eyebrow chip (hero + section labels). */
export function HeroEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "self-start rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeoHero({ eyebrow, title, lede, primary, secondary, aside, children, className }: SeoHeroProps) {
  const { t } = useTranslation();
  const cta = primary === undefined ? { to: NEW_KIT_PATH, label: t("landing.cta.buildMyResume") } : primary;

  return (
    <section
      className={cn(
        "mx-auto grid w-full max-w-[1200px] items-center gap-12 px-6 pb-20 pt-12",
        aside && "grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-[22px]">
        {eyebrow && <HeroEyebrow>{eyebrow}</HeroEyebrow>}
        <h1 className="break-words font-display text-[clamp(42px,5.6vw,72px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
          {title}
        </h1>
        {lede && <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">{lede}</p>}
        {(cta || secondary) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {cta && (
              <Button asChild size="lg">
                <Link to={cta.to}>
                  {cta.label}
                  <ArrowRight className="ml-1 h-[18px] w-[18px]" aria-hidden="true" />
                </Link>
              </Button>
            )}
            {secondary && (
              <Link
                to={secondary.to}
                className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        )}
        {children}
      </div>
      {aside && <div className="min-w-0">{aside}</div>}
    </section>
  );
}

/** Loading placeholder with the hero's footprint. */
export function SeoHeroSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-6 pb-20 pt-12" aria-hidden="true">
      <div className="h-7 w-32 animate-pulse rounded-full bg-muted" />
      <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-muted" />
      <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
