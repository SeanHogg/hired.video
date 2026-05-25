import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "@/lib/seo";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface BreadcrumbTrailItem {
  name: string;
  url: string;
}

/**
 * Single seam for every "show a trail" surface. Pairs the visible
 * breadcrumb (ui/breadcrumb primitive) with the BreadcrumbList JSON-LD
 * (useBreadcrumbs hook) so on-page nav and Google rich results always
 * agree on the trail. The final item renders as the current
 * BreadcrumbPage; earlier items are links.
 *
 * Self-gates on empty trails (returns null) so consumers can pass a
 * trail that's still loading without guarding each render site.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbTrailItem[];
  className?: string;
}): JSX.Element | null {
  useBreadcrumbs(items);

  if (items.length === 0) return null;

  return (
    <Breadcrumb className={cn("mb-6", className)}>
      <BreadcrumbList>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <Fragment key={item.url}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="truncate max-w-[60ch]">
                    {item.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.url}>{item.name}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
