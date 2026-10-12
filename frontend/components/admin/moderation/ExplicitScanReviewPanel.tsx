/**
 * Home-wall explicit-scan queue — public videos the explicit scan blocked or
 * couldn't check (unscreened), kept off the hired.video home page. Approve
 * puts one on the wall; "Keep blocked" pins it off even if a rescan of the
 * same content would pass. Both are audit-logged. "Scan unscanned videos"
 * backfills public videos posted before the gate shipped. Sibling tab to the
 * article-review, resource and abuse-report panels on /admin/moderation.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ExternalLink, Loader2, RefreshCcw, ScanSearch, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useExplicitCategoryList } from "@/hooks/use-explicit-category-list";
import {
  contentScanService,
  type VideoScanFilter,
  type VideoScanReviewItem,
} from "@/lib/services/content-scan-service";
import type { ScanOverride } from "@shared/moderation/explicit";

export default function ExplicitScanReviewPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const listCategories = useExplicitCategoryList();
  const [rows, setRows] = useState<VideoScanReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<VideoScanFilter>("needs_review");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const errorText = (err: unknown) => (err instanceof Error ? err.message : t("moderation.admin.unknownError"));

  async function load() {
    setLoading(true);
    try {
      setRows(await contentScanService.listVideoScans(filter));
    } catch (err) {
      toast({ title: t("moderation.admin.loadFailed"), description: errorText(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function decide(row: VideoScanReviewItem, override: ScanOverride) {
    setBusyId(row.videoId);
    try {
      await contentScanService.overrideVideoScan(row.videoId, override);
      toast({ title: override === "pass" ? t("moderation.admin.approved") : t("moderation.admin.keptBlocked") });
      await load();
    } catch (err) {
      toast({ title: t("moderation.admin.actionFailed"), description: errorText(err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function backfill() {
    setBackfilling(true);
    try {
      const scanned = await contentScanService.backfillVideoScans();
      toast({ title: t("moderation.admin.backfilled", { count: scanned }) });
      await load();
    } catch (err) {
      toast({ title: t("moderation.admin.actionFailed"), description: errorText(err), variant: "destructive" });
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">{t("moderation.admin.intro")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as VideoScanFilter)}>
            <SelectTrigger className="min-h-11 w-44" aria-label={t("moderation.admin.filter")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="needs_review">{t("moderation.admin.filterNeedsReview")}</SelectItem>
              <SelectItem value="approved">{t("moderation.admin.filterApproved")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="min-h-11" onClick={backfill} disabled={backfilling}>
            {backfilling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1.5 h-4 w-4" />}
            {t("moderation.admin.backfill")}
          </Button>
          <Button variant="outline" size="sm" className="min-h-11" onClick={load} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            {t("moderation.admin.refresh")}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t("moderation.admin.loading")} />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium">{t("moderation.admin.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("moderation.admin.emptyBody")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.videoId}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      {row.thumbnailUrl && (
                        <img src={row.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />
                      )}
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{row.title || t("moderation.admin.untitled")}</CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant={row.verdict === "block" ? "destructive" : "secondary"} className="text-[10px]">
                            {t(`moderation.verdict.${row.verdict}`)}
                          </Badge>
                          {row.overrideVerdict && (
                            <Badge variant="outline" className="text-[10px]">
                              {row.overrideVerdict === "pass" ? t("moderation.admin.approvedBadge") : t("moderation.admin.keptBlockedBadge")}
                            </Badge>
                          )}
                          {row.categories.length > 0 && (
                            <span className="text-muted-foreground">{listCategories(row.categories)}</span>
                          )}
                          {row.ownerName && <span className="text-muted-foreground">· {row.ownerName}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {row.overrideVerdict !== "pass" && (
                        <Button size="sm" className="min-h-11" onClick={() => decide(row, "pass")} disabled={busyId === row.videoId}>
                          {busyId === row.videoId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                          {t("moderation.admin.approve")}
                        </Button>
                      )}
                      {row.overrideVerdict !== "block" && (
                        <Button size="sm" variant="destructive" className="min-h-11" onClick={() => decide(row, "block")} disabled={busyId === row.videoId}>
                          <ShieldOff className="mr-1 h-3.5 w-3.5" />
                          {t("moderation.admin.keepBlocked")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-sm">
                  {row.reason && <p className="text-xs text-muted-foreground">{row.reason}</p>}
                  {row.videoUrl && (
                    <a
                      href={row.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex min-h-11 items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      {t("moderation.admin.watch")}
                    </a>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
