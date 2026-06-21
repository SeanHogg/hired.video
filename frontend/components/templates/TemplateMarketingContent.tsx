// TemplateMarketingContent — the description + marketing surface for the
// marketplace template page (#901). Tells a visitor how to use a template,
// why to use it, who it's for, and why to join — and leads with a
// context-aware CTA banner derived from the template's primary audience
// (e.g. the actor showreel opens with "Are you an actor? Showcase your
// acting experience.").
//
// All copy is derived from the catalog via `buildTemplateMarketing(meta)`
// (lib/templates/marketing.ts) — no per-template content is wired here, so a
// new template gets a full marketing page the moment it's registered. Section
// headings (chrome) are localized; the derived body copy is content data,
// consistent with the catalog's existing `desc` / `blurb`.

import { Check, ListChecks, Sparkles, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import { Badge } from "@/components/ui/badge";
import { buildTemplateMarketing } from "@/lib/templates/marketing";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
}

export default function TemplateMarketingContent({ meta }: Props) {
  const { t } = useTranslation();
  const m = buildTemplateMarketing(meta);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-10 sm:px-6">
      {/* Context CTA banner — the audience hook. Leads the marketing block so
          a visitor immediately learns whether (and why) the template is for
          them, with the primary action one click away. */}
      <section className="rounded-2xl border bg-gradient-to-br from-brand-purple/10 to-brand-blue/10 p-6 text-center sm:p-8">
        <h2 className="text-2xl font-bold leading-tight sm:text-3xl">
          {m.cta.headline}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
          {m.cta.subtext}
        </p>
        <div className="mt-5 flex justify-center">
          <TemplateApplyButton meta={meta} size="lg" withArrow />
        </div>
      </section>

      {/* Description / tagline */}
      {m.tagline && (
        <p className="text-base leading-relaxed text-muted-foreground">
          {m.tagline}
        </p>
      )}

      {/* Who it's for — audience chips. Self-gates when a template has no
          mapped audience. */}
      {m.audiences.length > 0 && (
        <Section
          icon={<Users className="h-4 w-4" />}
          title={t("templateMarketing.whoFor.title")}
        >
          <div className="flex flex-wrap gap-2">
            {m.audiences.map((a) => (
              <Badge key={a.id} variant="secondary" title={a.blurb} className="text-xs">
                {a.label}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* How it works */}
      <Section
        icon={<ListChecks className="h-4 w-4" />}
        title={t("templateMarketing.howTo.title")}
      >
        <ol className="space-y-3">
          {m.howItWorks.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-purple/15 text-xs font-semibold text-brand-purple">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Why use this template */}
      <Section
        icon={<Sparkles className="h-4 w-4" />}
        title={t("templateMarketing.why.title")}
      >
        <BulletList items={m.whyUse} />
      </Section>

      {/* Why join hired.video */}
      <Section
        icon={<Sparkles className="h-4 w-4" />}
        title={t("templateMarketing.join.title")}
      >
        <BulletList items={m.whyJoin} />
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-purple" />
          <span className="text-sm leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
