// "More templates like this" — internal-link section on the marketplace
// template page (#orphan-fix). Distributes link equity across the first-party
// catalog and gives crawlers (and visitors) a path from any template page to
// related ones, so template pages are no longer near-orphans reachable only
// through the JS-rendered browse grid.
//
// Self-gating: renders nothing when there's nothing to relate to. Related set
// is derived once from the registry (getRelatedTemplates) — no per-template
// wiring, so a new template gets a related grid for free.

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import TemplateCardThumb from "@/components/templates/TemplateCardThumb";
import { getRelatedTemplates } from "@/lib/templates/registry";
import { cn } from "@/lib/utils";
import { isResumeTemplate, type TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
  limit?: number;
}

export default function RelatedTemplates({ meta, limit = 6 }: Props) {
  const { t } = useTranslation();
  const related = getRelatedTemplates(meta, limit);
  if (related.length === 0) return null;

  return (
    <section className="flex flex-col gap-[18px]" aria-labelledby="related-templates-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2
          id="related-templates-heading"
          className="font-display text-[30px] font-bold tracking-[-0.02em] text-foreground"
        >
          {t("marketplaceTemplate.related.title")}
        </h2>
        <Link
          to="/templates"
          className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-primary hover:underline"
        >
          {t("marketplaceTemplate.related.browseAll")}
        </Link>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(170px,100%),1fr))] gap-4">
        {related.map((r) => (
          <li key={r.slug} className="flex">
            <Link
              to={`/marketplace/templates/${encodeURIComponent(r.slug)}`}
              className="flex w-full flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 text-foreground transition-colors hover:border-primary/50"
            >
              <span
                className={cn("block rounded-[10px]", isResumeTemplate(r) && "bg-muted px-3.5 py-2.5")}
              >
                <TemplateCardThumb meta={r} />
              </span>
              <span className="text-sm font-semibold leading-snug">{r.name}</span>
              {r.industry && <span className="text-xs text-muted-foreground">{r.industry}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
