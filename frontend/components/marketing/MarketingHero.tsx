// Hero + closing CTA for the public marketing pages (About, Contact, Careers,
// Features, Pricing, Security, …). One place owns the mockup type scale —
// mono eyebrow chip, display h1, muted lede, 52px primary CTA + text link —
// so every page opens and closes the same way as /rewards and the landing.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MarketingBand } from "@/components/marketing/MarketingBand";

/** 52px / rounded-14 primary CTA for <Link>/<a>/<button> elements. */
export const HERO_CTA_PRIMARY =
  "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60";

/** Secondary text link that sits beside the primary CTA. */
export const HERO_CTA_LINK =
  "inline-flex min-h-[44px] items-center gap-1.5 text-base font-semibold text-primary hover:underline";

/** Secondary text link on the navy ink band. */
export const INK_CTA_LINK =
  "inline-flex min-h-[44px] items-center gap-1.5 text-base font-semibold text-ink-accent hover:underline";

/** Mono uppercase eyebrow chip. */
export function EyebrowChip({ children, className }: { children: ReactNode; className?: string }) {
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

interface MarketingHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** CTA row (primary link + secondary text link). */
  actions?: ReactNode;
  /** Optional right-hand column (card, mockup). Two columns when present. */
  aside?: ReactNode;
  /** Content under the CTA row in the text column (badges, notes). */
  footer?: ReactNode;
  className?: string;
}

export function MarketingHero({ eyebrow, title, subtitle, actions, aside, footer, className }: MarketingHeroProps) {
  const text = (
    <div className="flex flex-col gap-[22px]">
      {eyebrow && <EyebrowChip>{eyebrow}</EyebrowChip>}
      <h1 className="font-display text-[clamp(42px,5.6vw,72px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
        {title}
      </h1>
      {subtitle && <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">{subtitle}</p>}
      {actions && <div className="flex flex-wrap items-center gap-x-6 gap-y-3">{actions}</div>}
      {footer}
    </div>
  );

  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[1200px] px-6 pb-16 pt-12 sm:pb-20 sm:pt-16",
        aside && "grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-center gap-12",
        className,
      )}
    >
      {text}
      {aside}
    </section>
  );
}

interface MarketingFinalCtaProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Primary action (and optional secondary) — use HERO_CTA_PRIMARY / INK_CTA_LINK. */
  actions: ReactNode;
  /** Id for the h2, so the band is labelled by it. */
  id?: string;
  /** Line above the title (e.g. the site-wide mantra). */
  kicker?: ReactNode;
  /** Full-width row under title + actions (proof, reassurance). */
  footer?: ReactNode;
}

/** Closing navy band: display h2 + actions. The ONE ink CTA band — every
 *  marketing/landing page closes with this (directly or via SeoFinalCta). */
export function MarketingFinalCta({ title, subtitle, actions, id, kicker, footer }: MarketingFinalCtaProps) {
  const titleId = id ? `${id}-final-title` : undefined;
  return (
    <MarketingBand
      tone="ink"
      labelledBy={titleId}
      className="flex flex-wrap items-center justify-between gap-6 py-[72px] sm:py-[88px]"
    >
      <div className="flex max-w-[36em] flex-col gap-3">
        {kicker}
        <h2
          id={titleId}
          className="font-display text-[clamp(32px,4.4vw,56px)] font-bold leading-[0.98] tracking-[-0.035em] text-ink-foreground"
        >
          {title}
        </h2>
        {subtitle && <p className="text-lg leading-relaxed text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">{actions}</div>
      {footer}
    </MarketingBand>
  );
}
