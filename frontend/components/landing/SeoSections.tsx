// Section bodies shared by the job-seeker SEO landing pages. Each renders
// inside a MarketingBand (the page supplies the band + MarketingSectionIntro);
// these only own the grid + card anatomy so every page shows steps and
// benefit cards the same way the home page does.

import type { LucideIcon } from "lucide-react";

export interface StepItem {
  title: string;
  body: string;
}

/** "01 / 02 / 03" step cards — mono numeral, display title, muted body. */
export function NumberedSteps({ steps }: { steps: StepItem[] }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6">
          <span
            className="font-display text-[40px] font-extrabold leading-none tracking-[-0.04em] text-primary"
            aria-hidden="true"
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">{step.title}</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export interface IconCardItem {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** Benefit cards with an accent icon tile. */
export function IconCards({ items }: { items: IconCardItem[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
            <Icon className="h-6 w-6" />
          </span>
          <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">{title}</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
        </li>
      ))}
    </ul>
  );
}
