// "More templates like this" — internal-link section on the marketplace
// template page (#orphan-fix). Distributes link equity across the first-party
// catalog and gives crawlers (and visitors) a path from any template page to
// related ones, so template pages are no longer near-orphans reachable only
// through the JS-rendered browse grid.
//
// Self-gating: renders nothing when there's nothing to relate to. Related set
// is derived once from the registry (getRelatedTemplates) — no per-template
// wiring, so a new template gets a related grid for free.

import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getRelatedTemplates } from "@/lib/templates/registry";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
  limit?: number;
}

export default function RelatedTemplates({ meta, limit = 6 }: Props) {
  const { t } = useTranslation();
  const related = getRelatedTemplates(meta, limit);
  if (related.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-12 sm:px-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("marketplaceTemplate.related.title")}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {related.map((r) => (
          <li key={r.slug}>
            <Link
              to={`/marketplace/templates/${encodeURIComponent(r.slug)}`}
              className="group flex h-full flex-col rounded-xl border p-4 transition-colors hover:border-brand-purple/50 hover:bg-muted/40"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium leading-tight">{r.name}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              {r.industry && (
                <span className="mt-1 text-xs text-muted-foreground">{r.industry}</span>
              )}
              {r.blurb && (
                <span className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {r.blurb}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <Link
          to="/search?category=templates"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-purple hover:underline"
        >
          {t("marketplaceTemplate.related.browseAll")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
