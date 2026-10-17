import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatLocaleDate } from "@/lib/format";
import { ExternalLink, Loader2, Plug } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  partnerConnectionService,
  type PartnerGrant,
  type PartnerConnectionStatus,
} from "@/lib/services/partner-connection-service";

const STATUS_META: Record<
  PartnerConnectionStatus,
  { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { labelKey: "connectedPlatforms.status.active", variant: "default" },
  pending: { labelKey: "connectedPlatforms.status.pending", variant: "secondary" },
  revoked: { labelKey: "connectedPlatforms.status.revoked", variant: "outline" },
};

/**
 * Self-contained "Connected platforms" management card. Lists the partner
 * platforms the current job seeker has connected and lets them revoke access
 * (optimistic update + toast). Drops into any settings section without
 * prop-drilling — it owns its own data load.
 */
export default function ConnectedPlatformsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [grants, setGrants] = useState<PartnerGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    partnerConnectionService
      .listGrants()
      .then((g) => {
        if (!cancelled) setGrants(g);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRevoke = async (grant: PartnerGrant) => {
    setRevoking(grant.id);
    // Optimistic: reflect revoked status immediately.
    const previous = grants;
    setGrants((prev) =>
      prev.map((g) => (g.id === grant.id ? { ...g, status: "revoked" as const } : g)),
    );
    try {
      await partnerConnectionService.revoke(grant.id);
      toast({ title: t("connectedPlatforms.revokedToast") });
    } catch {
      setGrants(previous);
      toast({
        title: t("connectedPlatforms.revokeErrorToast"),
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          {t("connectedPlatforms.title")}
        </CardTitle>
        <CardDescription>{t("connectedPlatforms.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("connectedPlatforms.loadError")}
          </p>
        ) : grants.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("connectedPlatforms.empty")}
          </p>
        ) : (
          <ul className="divide-y">
            {grants.map((grant) => {
              const meta = STATUS_META[grant.status];
              const connectedDate = formatLocaleDate(grant.consentAgreedAt ?? grant.createdAt);
              return (
                <li
                  key={grant.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {grant.partnerLogoUrl ? (
                      <img
                        src={grant.partnerLogoUrl}
                        alt={grant.partnerName}
                        className="h-10 w-10 shrink-0 rounded-lg border object-contain"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-semibold text-muted-foreground">
                        {grant.partnerName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {grant.partnerName}
                        </span>
                        <Badge variant={meta.variant} className="shrink-0">
                          {t(meta.labelKey)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {connectedDate ? (
                          <span>
                            {t("connectedPlatforms.connectedOn", { date: connectedDate })}
                          </span>
                        ) : null}
                        {grant.partnerWebsiteUrl ? (
                          <a
                            href={grant.partnerWebsiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {t("connectedPlatforms.visitWebsite")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {grant.status !== "revoked" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleRevoke(grant)}
                      disabled={revoking === grant.id}
                    >
                      {revoking === grant.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("connectedPlatforms.revoking")}
                        </>
                      ) : (
                        t("connectedPlatforms.revoke")
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
