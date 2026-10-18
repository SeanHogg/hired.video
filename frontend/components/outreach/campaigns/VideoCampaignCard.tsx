/** One Studio (video) campaign in the Outreach Campaigns tab — list row or grid card. */
import { ExternalLink, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import { CreativeSizeMatrix, type SizeAwareCampaign } from "@/components/campaigns";
import type { VideoCampaign } from "@/lib/services/studio-service";

export function VideoCampaignCard({
  campaign: vc,
  viewMode,
  assets,
  onDelete,
}: {
  campaign: VideoCampaign;
  viewMode: ViewMode;
  assets: SizeAwareCampaign["assets"];
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const description = vc.description || t("outreach.videoCampaign.noDescription");
  const statusBadgeVariant = vc.status === "active" ? "default" : "secondary";
  const deleteButton = (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs"
      onClick={() => onDelete(vc.id)}
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  );
  return (
    <Card className={viewMode === "list" ? "flex flex-row items-center" : ""}>
      {viewMode === "list" ? (
        <>
          <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{vc.name}</p>
              <p className="text-sm text-muted-foreground truncate">
                {description}
              </p>
              <CreativeSizeMatrix assets={assets} />
            </div>
            <div className="hidden md:flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
              <span>
                {t(
                  vc.projectIds.length === 1
                    ? "outreach.videoCampaign.assetCountOne"
                    : "outreach.videoCampaign.assetCountOther",
                  { count: vc.projectIds.length },
                )}
              </span>
              <span>{new Date(vc.createdAt).toLocaleDateString()}</span>
              <Link
                to="/studio"
                className="flex items-center gap-1 text-brand-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("outreach.videoCampaign.studioLink")}
              </Link>
            </div>
            <Badge variant={statusBadgeVariant} className="flex-shrink-0">
              {vc.status}
            </Badge>
          </div>
          <div className="flex-shrink-0 p-2">{deleteButton}</div>
        </>
      ) : (
        <>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{vc.name}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusBadgeVariant}>{vc.status}</Badge>
                {deleteButton}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Stat label={t("outreach.videoCampaign.studioAssets")} value={vc.projectIds.length} />
              <Stat label={t("outreach.videoCampaign.utmSource")} value={vc.utmSource || "—"} />
              <Stat label={t("outreach.videoCampaign.utmMedium")} value={vc.utmMedium || "—"} />
              <Stat
                label={t("outreach.videoCampaign.created")}
                value={new Date(vc.createdAt).toLocaleDateString()}
              />
            </div>
            <CreativeSizeMatrix assets={assets} />
            <div className="mt-4 flex items-center justify-end">
              <Link
                to="/studio"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("outreach.videoCampaign.manageInStudio")}
              </Link>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
