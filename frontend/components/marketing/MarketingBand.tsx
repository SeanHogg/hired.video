// Full-bleed marketing band + section intro: the two layout primitives every
// job-seeker marketing page repeats (landing, /rewards, /templates). A band
// owns its surface (page / card / ink) and the 1200px content column, so
// pages compose sections instead of re-deriving widths and paddings.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BandTone = "page" | "card" | "ink";

const TONE_CLASS: Record<BandTone, string> = {
  page: "bg-background",
  card: "bg-card border-y border-border",
  ink: "bg-ink text-ink-foreground",
};

interface MarketingBandProps {
  tone?: BandTone;
  id?: string;
  /** Labelled-by id for the section's heading (a11y landmark name). */
  labelledBy?: string;
  /** Extra classes for the inner 1200px column (spacing / layout). */
  className?: string;
  children: ReactNode;
}

export function MarketingBand({
  tone = "page",
  id,
  labelledBy,
  className,
  children,
}: MarketingBandProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(TONE_CLASS[tone], id && "scroll-mt-20")}>
      <div className={cn("mx-auto w-full max-w-[1200px] px-6 py-16 sm:py-20", className)}>
        {children}
      </div>
    </section>
  );
}

interface MarketingSectionIntroProps {
  id?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

/** H2 + supporting line in the mockups' type scale (display, tight tracking). */
export function MarketingSectionIntro({ id, title, subtitle, className }: MarketingSectionIntroProps) {
  return (
    <div className={cn("flex max-w-[44em] flex-col gap-2.5", className)}>
      <h2
        id={id}
        className="font-display text-[clamp(32px,3.8vw,48px)] font-bold leading-none tracking-[-0.03em]"
      >
        {title}
      </h2>
      {subtitle && <p className="text-base leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
