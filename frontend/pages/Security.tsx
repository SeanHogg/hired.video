/**
 * /security — public CISO-facing marketing page that documents which
 * security controls hired.video implements, against which standards.
 *
 * Single source of truth for all "is hired.video secure?" claims. The
 * Trust badges in the footer, RFP responses, and any sales collateral
 * should link here rather than duplicating control lists.
 *
 * Honesty rule: every "Implemented" item must point to code/policy
 * that actually exists today. "In progress" = work has started.
 * "Roadmap" = committed but not started. Don't promote roadmap items
 * upward without a corresponding ship in main.
 *
 * Catalog: components/security/security-controls.ts. Sections render via
 * components/security/SecurityControlSection.tsx.
 */

import { Link, useLocation } from "react-router-dom";
import { Mail, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { MarketingBand } from "@/components/marketing/MarketingBand";
import { MarketingHero, HERO_CTA_PRIMARY, HERO_CTA_LINK } from "@/components/marketing/MarketingHero";
import SecurityControlSection from "@/components/security/SecurityControlSection";
import { buildSections, buildStandards, type Status } from "@/components/security/security-controls";

const OUTLINE_LINK =
  "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent";

export default function Security() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("headings.security.breadcrumb"), url: "/security" }]);

  const sections = buildSections(t);
  const standards = buildStandards(t);

  const counts = sections.reduce(
    (acc, s) => {
      for (const c of s.controls) acc[c.status] += 1;
      return acc;
    },
    { implemented: 0, in_progress: 0, roadmap: 0 } as Record<Status, number>,
  );

  const countRows: { status: Status; labelKey: string; positive?: boolean }[] = [
    { status: "implemented", labelKey: "labels.security.statusImplemented", positive: true },
    { status: "in_progress", labelKey: "labels.security.statusInProgress" },
    { status: "roadmap", labelKey: "labels.security.statusRoadmap" },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <MarketingHero
          eyebrow={t("headings.security.heroBrand")}
          title={
            <>
              {t("headings.security.heroTitleLead")}{" "}
              <span className="text-primary">{t("headings.security.heroTitleHighlight")}</span>
            </>
          }
          subtitle={t("messages.security.heroSubtitle")}
          actions={
            <>
              <Link to="/security/sessions" className={HERO_CTA_PRIMARY}>
                {t("actions.security.manageSessions")}
              </Link>
              <Link to="/contact" className={HERO_CTA_LINK}>
                {t("actions.security.requestQuestionnaire")}
              </Link>
            </>
          }
          aside={
            <dl className="flex flex-col gap-4 rounded-3xl bg-ink p-7 text-ink-foreground">
              {countRows.map((row) => (
                <div
                  key={row.status}
                  className="flex items-baseline justify-between gap-4 border-b border-ink-raised pb-4 last:border-b-0 last:pb-0"
                >
                  <dt className="font-mono text-xs uppercase tracking-[0.1em] text-ink-muted">{t(row.labelKey)}</dt>
                  <dd
                    className={`font-display text-[48px] font-extrabold leading-none tracking-[-0.03em] tabular-nums ${
                      row.positive ? "text-ink-positive" : ""
                    }`}
                  >
                    {counts[row.status]}
                  </dd>
                </div>
              ))}
            </dl>
          }
        />

        {/* Standards strip */}
        <MarketingBand tone="card" labelledBy="security-standards-heading" className="flex flex-col gap-6 py-12 sm:py-12">
          <h2
            id="security-standards-heading"
            className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            {t("headings.security.standardsStrip")}
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-4">
            {standards.map((s) => (
              <li key={s.acronym} className="flex flex-col gap-1 rounded-[20px] border border-border p-4">
                <span className="font-display text-base font-bold text-foreground">{s.acronym}</span>
                <span className="text-xs text-muted-foreground">{s.name}</span>
                <span className="mt-1 font-mono text-[11px] font-semibold uppercase text-primary">{s.level}</span>
              </li>
            ))}
          </ul>
          {/* Quick nav */}
          <nav aria-label={t("security.quickNav")} className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="inline-flex min-h-[40px] items-center rounded-full border border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {s.title}
              </a>
            ))}
          </nav>
        </MarketingBand>

        {sections.map((s, i) => (
          <SecurityControlSection key={s.id} section={s} tone={i % 2 === 0 ? "page" : "card"} />
        ))}

        {/* Disclosure */}
        <MarketingBand tone="ink" labelledBy="security-disclosure-heading" className="flex flex-col gap-6">
          <h2
            id="security-disclosure-heading"
            className="font-display text-[clamp(32px,4.4vw,56px)] font-bold leading-none tracking-[-0.035em]"
          >
            {t("headings.security.disclosure")}
          </h2>
          <p className="max-w-[44em] text-lg leading-relaxed text-ink-muted">
            {t("messages.security.disclosureLead")}{" "}
            <a className="font-semibold text-ink-accent hover:underline" href="mailto:security@hired.video">
              security@hired.video
            </a>{" "}
            {t("messages.security.disclosureBody")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="mailto:security@hired.video" className={HERO_CTA_PRIMARY}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              security@hired.video
            </a>
            <Link to="/privacy" className={OUTLINE_LINK}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t("actions.security.privacyPolicy")}
            </Link>
            <Link to="/terms" className={OUTLINE_LINK}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t("actions.security.termsOfService")}
            </Link>
          </div>
        </MarketingBand>
      </main>
    </AppShell>
  );
}
