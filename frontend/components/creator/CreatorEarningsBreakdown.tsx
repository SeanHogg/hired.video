/**
 * CreatorEarningsBreakdown — all-channel creator revenue card (#1185).
 *
 * Where the older `CreatorTemplateEarnings` card only ever reported template
 * marketplace sales (zero for creators whose money comes from services, voice
 * clones, courses, or articles), this card reads the ledger-derived
 * earnings-by-source rollup (`/api/creators/me/earnings-rollup`) and shows the
 * lifetime total plus a per-source breakdown — promo videos, voice clones,
 * templates, services, courses, articles, contract work.
 *
 * Self-gating per the standing DRY rule:
 *   - returns null while the first fetch is in flight (no skeleton thrash), and
 *   - returns null when the creator has no accruals yet (the row count is the
 *     ground truth — no `canX` prop drilling).
 *
 * It sits above the template-only card on the Payouts & Earnings tab: this card
 * answers "where did my money come from", the template card keeps the
 * per-template drill-down.
 */
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  Briefcase,
  DollarSign,
  FileText,
  GraduationCap,
  LayoutTemplate,
  Mic,
  ShoppingBag,
  Video,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  creatorService,
  type CreatorEarningsRollupDTO,
  type EarningsSourceKey,
} from "@/lib/services/creator-service";

const SOURCE_ICON: Record<EarningsSourceKey, ComponentType<{ className?: string }>> = {
  promo_video: Video,
  voice_clone: Mic,
  template: LayoutTemplate,
  service: Briefcase,
  course: GraduationCap,
  article: FileText,
  contract: Wrench,
  other: DollarSign,
};

function formatCents(cents: number, currency: string): string {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export default function CreatorEarningsBreakdown() {
  const [data, setData] = useState<CreatorEarningsRollupDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    creatorService
      .getEarningsRollup()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // Silent fail — the card simply doesn't render. A 401 / 5xx here
        // shouldn't break the Payouts & Earnings tab.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Self-gate: nothing before the fetch resolves, and nothing for creators who
  // have never earned (no accrual rows in the ledger).
  if (!loaded || !data || data.rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-emerald-500" />
          Earnings by source
        </CardTitle>
        <CardDescription className="text-xs">
          Lifetime earnings across every revenue channel, derived from your
          payout ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aggregate row — total $ earned + paid event count. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Total earned
            </div>
            <div className="mt-1 text-xl font-semibold">
              {formatCents(data.totalEarnedCents, data.currency)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShoppingBag className="h-3 w-3" />
              Paid sales
            </div>
            <div className="mt-1 text-xl font-semibold">{data.totalSales}</div>
          </div>
        </div>

        {/* Per-source breakdown */}
        <ul className="flex flex-col gap-2">
          {data.rows.map((row) => {
            const Icon = SOURCE_ICON[row.source] ?? DollarSign;
            return (
              <li
                key={row.source}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.salesCount} paid{" "}
                    {row.salesCount === 1 ? "sale" : "sales"}
                  </p>
                </div>
                <div className="text-right text-sm font-semibold">
                  {formatCents(row.earningsCents, data.currency)}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
