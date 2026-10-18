/**
 * Campaign Manager hierarchy card — presentational context (cross-links to
 * the surfaces that own each level of the hierarchy today).
 */
import { BarChart3, Layers, Mail, Target } from "lucide-react";
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

type Tone = "purple" | "blue" | "primary" | "muted";

const TONE_CLASSES: Record<Tone, { card: string; label: string }> = {
  purple: {
    card: "border-brand-primary/20 bg-accent/50",
    label: "text-brand-primary",
  },
  blue: {
    card: "border-brand-blue/20 bg-accent/50",
    label: "text-brand-blue",
  },
  primary: {
    card: "border-primary/20 bg-accent/50",
    label: "text-primary",
  },
  muted: {
    card: "border-muted bg-muted/50",
    label: "text-muted-foreground",
  },
};

export function CampaignManagerCard({
  onNavigateTo,
}: {
  onNavigateTo: (tab: "advertise" | "content" | "performance") => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          {t("outreach.campaignManager.title")}
        </CardTitle>
        <CardDescription>
          {t("outreach.campaignManager.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <HierarchyTile
            tone="purple"
            level={t("outreach.campaignManager.level1")}
            title={t("outreach.campaignManager.campaignTitle")}
            description={t("outreach.campaignManager.campaignDesc")}
            status="planned"
          />
          <HierarchyTile
            tone="blue"
            level={t("outreach.campaignManager.level2")}
            title={t("outreach.campaignManager.adSetTitle")}
            description={t("outreach.campaignManager.adSetDesc")}
            status="live"
            actionLabel={t("outreach.campaignManager.manageBoosts")}
            onAction={() => onNavigateTo("advertise")}
          />
          <HierarchyTile
            tone="primary"
            level={t("outreach.campaignManager.level3")}
            title={t("outreach.campaignManager.creativeTitle")}
            description={t("outreach.campaignManager.creativeDesc")}
            status="live"
            actionLabel={t("outreach.campaignManager.openStudio")}
            onAction={() => { window.location.href = "/studio"; }}
          />
          <HierarchyTile
            tone="muted"
            level={t("outreach.campaignManager.analyticsLevel")}
            title={t("outreach.campaignManager.roasTitle")}
            description={t("outreach.campaignManager.roasDesc")}
            status="live"
            actionLabel={t("outreach.campaignManager.viewPerformance")}
            onAction={() => onNavigateTo("performance")}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <FeatureBullet
            icon={Target}
            iconClass="text-brand-primary"
            title={t("outreach.campaignManager.targetingTitle")}
            description={t("outreach.campaignManager.targetingDesc")}
          />
          <FeatureBullet
            icon={BarChart3}
            iconClass="text-brand-blue"
            title={t("outreach.campaignManager.bidTitle")}
            description={t("outreach.campaignManager.bidDesc")}
          />
          <FeatureBullet
            icon={Mail}
            iconClass="text-primary"
            title={t("outreach.campaignManager.crossChannelTitle")}
            description={t("outreach.campaignManager.crossChannelDesc")}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function HierarchyTile({
  tone,
  level,
  title,
  description,
  status,
  actionLabel,
  onAction,
}: {
  tone: Tone;
  level: string;
  title: string;
  description: string;
  status: "live" | "planned";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useTranslation();
  const classes = TONE_CLASSES[tone];
  return (
    <div className={`${classes.card} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-xs font-semibold ${classes.label} uppercase tracking-wide`}>
          {level}
        </div>
        {status === "live" ? (
          <Badge
            className="text-[10px] bg-green-500/10 text-green-700 border-green-200"
            variant="outline"
          >
            {t("outreach.campaignManager.statusLive")}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            {t("outreach.campaignManager.statusPlanned")}
          </Badge>
        )}
      </div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-xs text-muted-foreground mb-2">{description}</div>
      {actionLabel && onAction && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function FeatureBullet({
  icon: Icon,
  iconClass,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground text-xs mt-0.5">{description}</div>
      </div>
    </div>
  );
}
