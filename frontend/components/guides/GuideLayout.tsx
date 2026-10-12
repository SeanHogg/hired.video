// Shared layout for the step-by-step guides under /guides/* (getting
// started, video best practices, networking, job search, workforce). Each
// page supplies localized steps; this owns the reading column, header,
// numbered step cards and previous/next navigation.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReadingBackLink, ReadingHeader } from "@/components/content/ReadingLayout";
import { CONTENT_CARD, ICON_TILE, READING_COLUMN, TEXT_LINK } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";

export interface GuideStep {
  icon: LucideIcon;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

export interface GuideNavLink {
  to: string;
  label: string;
}

interface GuideLayoutProps {
  title: string;
  lede: string;
  steps: GuideStep[];
  /** Number the steps (sequential how-to) vs. icon-only tips. Default true. */
  numbered?: boolean;
  prev?: GuideNavLink;
  next?: GuideNavLink;
  /** Optional closing block (e.g. a related-page CTA card). */
  footer?: ReactNode;
}

export default function GuideLayout({
  title,
  lede,
  steps,
  numbered = true,
  prev,
  next,
  footer,
}: GuideLayoutProps) {
  const { t } = useTranslation();
  const countKey = numbered ? "guides.meta.steps" : "guides.meta.tips";

  return (
    <AppShell bgClassName="bg-background">
      <article className={cn(READING_COLUMN, "flex flex-col gap-8 pb-[72px] pt-6")}>
        <ReadingBackLink to="/help">{t("guides.backToHelp")}</ReadingBackLink>

        <ReadingHeader
          eyebrow={t("guides.eyebrow")}
          title={title}
          lede={lede}
          meta={[t(countKey, { count: steps.length })]}
        />

        <ol className="flex flex-col gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className={cn(CONTENT_CARD, "flex gap-4 p-6")}>
                {numbered ? (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-base font-semibold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                ) : (
                  <span className={ICON_TILE}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                    {numbered && <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
                    {step.title}
                  </h2>
                  <p className="text-base leading-relaxed text-foreground/85">{step.body}</p>
                  {step.cta && (
                    <Link to={step.cta.to} className={cn(TEXT_LINK, "self-start text-sm")}>
                      {step.cta.label}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {footer}

        {(prev || next) && (
          <nav aria-label={t("guides.navAria")} className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
            {prev ? <GuideNavCard link={prev} direction="prev" /> : <span className="hidden sm:block" />}
            {next && <GuideNavCard link={next} direction="next" />}
          </nav>
        )}
      </article>
    </AppShell>
  );
}

function GuideNavCard({ link, direction }: { link: GuideNavLink; direction: "prev" | "next" }) {
  const { t } = useTranslation();
  const isNext = direction === "next";
  return (
    <Link
      to={link.to}
      className={cn(
        CONTENT_CARD,
        "group flex min-h-[44px] flex-col gap-1 p-5 transition-colors hover:border-primary/50",
        isNext && "items-end text-right",
      )}
    >
      <span className="font-mono text-[11px] uppercase text-muted-foreground">
        {isNext ? t("guides.next") : t("guides.previous")}
      </span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground group-hover:text-primary">
        {!isNext && <ArrowLeft className="h-4 w-4" aria-hidden="true" />}
        {link.label}
        {isNext && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </span>
    </Link>
  );
}
