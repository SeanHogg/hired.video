/**
 * CreatorTemplateEarnings — single source of truth for the creator's
 * template marketplace revenue card. Fetches the per-template + aggregate
 * earnings rollup (`/api/studio/templates/me/earnings`) and renders:
 *
 *   • Aggregate: total earnings, total paid sales, currency
 *   • Per-template breakdown: thumbnail, name, paid sales count, $earned
 *
 * Self-gating per the standing DRY rule:
 *   - Returns null while the fetch is in flight on first load (no skeleton
 *     thrash on /services), and
 *   - Returns null when the creator has zero published templates (the row
 *     count is the ground truth — no `canX` prop drilling).
 *
 * Mount it anywhere the caller wants to surface template revenue. The
 * /services dashboard is the primary host today; the Studio sidebar /
 * a future /creator/dashboard route can drop it in unchanged.
 *
 * Payout / withdraw flow is intentionally NOT included here yet — that
 * lives behind a follow-up gap once the platform payout backend ships.
 * This card is a read-only reporting surface.
 */
import { useEffect, useState } from "react";
import { DollarSign, ExternalLink, ShoppingBag, Store } from "lucide-react";
import { formatMoneyCents } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  studioTemplatesService,
  type CreatorTemplateEarnings,
} from "@/lib/services/studio-templates-service";


export default function CreatorTemplateEarnings() {
  const [data, setData] = useState<CreatorTemplateEarnings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    studioTemplatesService
      .myEarnings()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // Silent fail — the card simply doesn't render. The /services
        // Creator widget already surfaces program enrollment state; this
        // card is supplementary and a 401 / 5xx shouldn't break the page.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Self-gate: nothing to show before the fetch resolves, and nothing to
  // show for creators who haven't published any templates yet.
  if (!loaded || !data || data.rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4 text-pink-500" />
          Template Marketplace Earnings
        </CardTitle>
        <CardDescription className="text-xs">
          Revenue from creators who purchased your studio templates. Free
          claims and owner copies don't count toward earnings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aggregate row — total $ earned + paid sale count. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Total earned
            </div>
            <div className="mt-1 text-xl font-semibold">
              {formatMoneyCents(data.totalEarningsCents, data.currency, 2)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShoppingBag className="h-3 w-3" />
              Paid sales
            </div>
            <div className="mt-1 text-xl font-semibold">
              {data.totalPaidLicenses}
            </div>
          </div>
        </div>

        {/* Per-template breakdown */}
        <ul className="flex flex-col gap-2">
          {data.rows.map((row) => (
            <li
              key={row.templateId}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              {row.thumbnailUrl ? (
                <img
                  src={row.thumbnailUrl}
                  alt=""
                  className="h-10 w-16 shrink-0 rounded object-cover"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Store className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <Badge
                    variant={
                      row.visibility === "public"
                        ? "default"
                        : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {row.visibility}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.paidLicenseCount} paid · listed at{" "}
                  {row.priceCents === 0
                    ? "Free"
                    : formatMoneyCents(row.priceCents, row.currency, 2)}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">
                  {formatMoneyCents(row.earningsCents, row.currency, 2)}
                </div>
                {row.listingSlug && row.visibility === "public" && (
                  <a
                    href={`/marketplace/templates/${row.listingSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    View listing
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
