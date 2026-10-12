// /admin/studio?view=promotions — SuperAdmin promotion queue (Lane A, #2046).
// Creators submit rendered projects from the Post panel; approving publishes
// them on hired.video's managed brand account (connected under the "Social
// accounts" segment). Chrome comes from <AdminLayout> at the route.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { promotionService, type PromotionSubmission } from "@/lib/services/promotion-service";
import { socialService } from "@/lib/services/social-service";
import { PROMOTION_PLATFORMS, PROMOTION_STATUSES, type PromotionStatus } from "@shared/promotions";
import { SOCIAL_PLATFORM_META } from "@shared/social-platforms";

const QUEUE_KEY = ["admin", "promotions"] as const;

export default function Promotions() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<PromotionStatus>("pending");
  const queueQ = useQuery({ queryKey: [...QUEUE_KEY, status], queryFn: () => promotionService.queue(status) });
  const managedQ = useQuery({ queryKey: ["admin", "social", "managed"], queryFn: () => socialService.listManaged() });
  const reachQ = useQuery({ queryKey: [...QUEUE_KEY, "reach"], queryFn: () => promotionService.reach() });
  const reach = (reachQ.data?.platforms ?? []).filter((p) => p.posts > 0);
  const notLive = (managedQ.data ?? []).filter(
    (p) => (PROMOTION_PLATFORMS as readonly string[]).includes(p.id) && p.managed !== "ready",
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("admin.promotions.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.promotions.subtitle")}</p>
        {notLive.length > 0 && (
          <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
            {t("admin.promotions.brandNotConnected", { platforms: notLive.map((p) => p.label).join(", ") })}{" "}
            <Link to="/admin/studio?view=social" className="font-semibold text-primary underline-offset-2 hover:underline">
              {t("admin.promotions.connectBrand")}
            </Link>
          </p>
        )}
      </header>

      {reach.length > 0 && (
        <section aria-label={t("admin.promotions.reachHeading")} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">{t("admin.promotions.reachHeading")}</h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-2">
            {reach.map((p) => (
              <li key={p.platform} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{SOCIAL_PLATFORM_META[p.platform].label}</p>
                <p className="text-lg font-semibold text-foreground">
                  {p.views == null ? "—" : p.views.toLocaleString(i18n.language)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.views == null
                    ? t("admin.promotions.reachPostsOnly", { count: p.posts })
                    : t("admin.promotions.reachViews", { count: p.posts })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="tablist" aria-label={t("admin.promotions.statusFilter")} className="mb-4 flex flex-wrap gap-2">
        {PROMOTION_STATUSES.map((s) => (
          <Button
            key={s}
            role="tab"
            aria-selected={status === s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {t(`admin.promotions.status.${s}`)}
          </Button>
        ))}
      </div>

      {queueQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("admin.promotions.loading")}
        </p>
      ) : (queueQ.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.promotions.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {(queueQ.data ?? []).map((s) => (
            <li key={s.id}>
              <SubmissionRow submission={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmissionRow({ submission: s }: { submission: PromotionSubmission }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: QUEUE_KEY });
  const approveM = useMutation({ mutationFn: () => promotionService.approve(s.id), onSettled: refresh });
  const rejectM = useMutation({ mutationFn: () => promotionService.reject(s.id, reason.trim()), onSettled: refresh });
  const reviewable = s.status === "pending" || s.status === "failed";
  const busy = approveM.isPending || rejectM.isPending;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words font-medium text-foreground">{s.title}</p>
            <p className="text-xs text-muted-foreground">
              {SOCIAL_PLATFORM_META[s.platform].label} · {new Date(s.createdAt).toLocaleString(i18n.language)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.screeningVerdict !== "pass" && (
              <Badge variant={s.screeningVerdict === "unscreened" ? "outline" : "destructive"}>
                {t(`admin.promotions.screening.${s.screeningVerdict}`)}
              </Badge>
            )}
            <Badge variant={s.status === "published" ? "default" : "secondary"}>{t(`admin.promotions.status.${s.status}`)}</Badge>
          </div>
        </div>

        {s.screeningNotes && (
          <p className="text-sm text-muted-foreground">
            {t("admin.promotions.screeningNote", { note: s.screeningNotes })}
          </p>
        )}

        {s.status === "failed" && s.lastError && <p className="text-sm text-destructive">{s.lastError}</p>}
        {s.status === "rejected" && s.rejectReason && <p className="text-sm text-muted-foreground">{s.rejectReason}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to={`/studio/${s.projectId}`}>
              {t("admin.promotions.openProject")}
            </Link>
          </Button>
          {s.externalUrl && (
            <Button asChild size="sm" variant="ghost">
              <a href={s.externalUrl} target="_blank" rel="noreferrer">
                {t("admin.promotions.viewPost")} <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Button>
          )}
          {reviewable && !rejecting && (
            <>
              <Button size="sm" disabled={busy} onClick={() => approveM.mutate()}>
                {approveM.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />}
                {t(s.status === "failed" ? "admin.promotions.retry" : "admin.promotions.approve")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("admin.promotions.reject")}
              </Button>
            </>
          )}
        </div>

        {rejecting && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim()) rejectM.mutate();
            }}
          >
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder={t("admin.promotions.rejectReason")}
              aria-label={t("admin.promotions.rejectReason")}
              className="min-w-0 flex-1 basis-56"
            />
            <Button type="submit" size="sm" variant="destructive" disabled={busy || !reason.trim()}>
              {t("admin.promotions.confirmReject")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              {t("actions.cancel")}
            </Button>
          </form>
        )}

        {(approveM.isError || rejectM.isError) && (
          <p role="alert" className="text-sm text-destructive">{t("admin.promotions.actionFailed")}</p>
        )}
      </CardContent>
    </Card>
  );
}
