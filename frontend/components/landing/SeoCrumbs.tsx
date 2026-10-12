// Visible breadcrumb trail for the programmatic SEO pages (the JSON-LD
// BreadcrumbList comes from useBreadcrumbs; this is the on-page links).

import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface Crumb {
  label: string;
  /** Omit on the current page. */
  to?: string;
}

export function SeoCrumbs({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("seoLanding.common.breadcrumb")} className="mx-auto w-full max-w-[1200px] px-6 pt-8">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
        {items.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <li aria-hidden="true">/</li>}
            <li>
              {c.to ? (
                <Link to={c.to} className="hover:text-foreground hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground" aria-current="page">
                  {c.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
