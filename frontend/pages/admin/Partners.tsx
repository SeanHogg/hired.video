// SuperAdmin — partner platform access governance. Account owners request
// partner access from Settings → Partner Access; this queue is where a
// SuperAdmin approves/rejects requests and suspends/activates existing
// partners. Rendered inside <AdminLayout> (provides chrome + superadmin gate).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatLocaleDate } from "@/lib/format";
import {
  Check,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plug,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  partnerAdminService,
} from "@/lib/services/partner-admin-service";
import {
  type PartnerView,
  type PartnerStatus,
} from "@/lib/services/partner-account-service";

type Filter = "pending" | "all";

const STATUS_VARIANT: Record<
  PartnerStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  pending: "secondary",
  suspended: "destructive",
  rejected: "outline",
};

export default function Partners() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [partners, setPartners] = useState<PartnerView[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async (f: Filter) => {
    setLoading(true);
    try {
      const list = await partnerAdminService.listPartners(
        f === "pending" ? "pending" : undefined,
      );
      setPartners(list);
    } catch {
      toast({ title: t("adminPartners.loadError"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(filter);
  }, [filter]);

  const runAction = async (
    partner: PartnerView,
    action: "approve" | "reject" | "suspend" | "activate",
    successKey: string,
  ) => {
    setBusyId(partner.id);
    try {
      const updated = await partnerAdminService[action](partner.id);
      toast({ title: t(successKey) });
      // On the pending filter, approved/rejected rows drop out of view.
      setPartners((prev) =>
        filter === "pending" && updated.status !== "pending"
          ? prev.filter((p) => p.id !== partner.id)
          : prev.map((p) => (p.id === partner.id ? updated : p)),
      );
    } catch {
      toast({ title: t("adminPartners.actionError"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Plug className="h-6 w-6 text-primary" />
            {t("adminPartners.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("adminPartners.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refresh(filter)} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("adminPartners.refresh")}
        </Button>
      </div>

      {/* Filter */}
      <div className="inline-flex rounded-lg border bg-muted p-1">
        {(["pending", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "pending" ? t("adminPartners.filterPending") : t("adminPartners.filterAll")}
          </button>
        ))}
      </div>

      {loading && partners.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : partners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("adminPartners.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {partners.map((p) => {
            const busy = busyId === p.id;
            return (
              <Card key={p.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{p.name}</span>
                      <Badge variant={STATUS_VARIANT[p.status]}>
                        {t(`adminPartners.status.${p.status}`)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {p.contactEmail ? <span>{p.contactEmail}</span> : null}
                      {p.websiteUrl ? (
                        <a
                          href={p.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {t("adminPartners.website")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      <span>{t("adminPartners.requested", { date: formatLocaleDate(p.createdAt) })}</span>
                    </div>
                    {p.requestNote ? (
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        {p.requestNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {p.status === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            runAction(p, "approve", "adminPartners.approvedToast")
                          }
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="mr-1.5 h-4 w-4" />
                              {t("adminPartners.approve")}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            runAction(p, "reject", "adminPartners.rejectedToast")
                          }
                          disabled={busy}
                        >
                          <X className="mr-1.5 h-4 w-4" />
                          {t("adminPartners.reject")}
                        </Button>
                      </>
                    ) : null}
                    {p.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          runAction(p, "suspend", "adminPartners.suspendedToast")
                        }
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Pause className="mr-1.5 h-4 w-4" />
                            {t("adminPartners.suspend")}
                          </>
                        )}
                      </Button>
                    ) : null}
                    {p.status === "suspended" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          runAction(p, "activate", "adminPartners.activatedToast")
                        }
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="mr-1.5 h-4 w-4" />
                            {t("adminPartners.activate")}
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
