import { useTranslation } from "react-i18next";
import { Bell, Edit, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { JOB_ALERT_FREQUENCY_LABELS } from "@/lib/constants/enums";
import CreateJobAlertButton from "@/components/CreateJobAlertButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTimeAgo } from "@/hooks/use-time-ago";
import { parseSearchCriteria, type JobAlert } from "./jobs-hub-model";
import { HubEmptyCard, HubListSkeleton } from "./HubTabStates";

interface JobAlertsTabProps {
  alerts: JobAlert[];
  loading: boolean;
  onReload: () => void;
  onToggleActive: (alertId: string, currentStatus: boolean) => void;
  onEdit: (alert: JobAlert) => void;
  onDelete: (alertId: string) => void;
}

/** Alerts tab body of the /jobs hub. */
export function JobAlertsTab({
  alerts,
  loading,
  onReload,
  onToggleActive,
  onEdit,
  onDelete,
}: JobAlertsTabProps) {
  const { t } = useTranslation();
  const { formatDate } = useTimeAgo();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">{t("headings.jobAlerts")}</h2>
          <p className="text-muted-foreground">
            {t("messages.alertsConfiguredCount", { count: alerts.length })}
          </p>
        </div>
        <CreateJobAlertButton
          onAlertCreated={onReload}
          variant="default"
          size="default"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("actions.createAlert")}
        </CreateJobAlertButton>
      </div>

      {loading ? (
        <HubListSkeleton />
      ) : alerts.length === 0 ? (
        <HubEmptyCard
          icon={Bell}
          title={t("headings.noJobAlertsYet")}
          description={t("messages.noJobAlertsDesc")}
          action={
            <CreateJobAlertButton onAlertCreated={onReload}>
              <Plus className="h-4 w-4 mr-2" />
              {t("actions.createYourFirstAlert")}
            </CreateJobAlertButton>
          }
        />
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const { keywords, location } = parseSearchCriteria(alert.searchCriteria);
            return (
              <Card key={alert.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{alert.name}</CardTitle>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant={alert.isActive ? "default" : "secondary"}>
                          {alert.isActive ? t("labels.active") : t("labels.inactive")}
                        </Badge>
                        <Badge variant="outline">
                          {JOB_ALERT_FREQUENCY_LABELS[alert.alertFrequency] || alert.alertFrequency}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={alert.isActive}
                        onCheckedChange={() => onToggleActive(alert.id, alert.isActive)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(alert)}
                      >
                        <Edit className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(alert.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Search className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{t("labels.keywordsLabel")}</p>
                        <p className="text-sm text-muted-foreground">{keywords || t("labels.any")}</p>
                      </div>
                    </div>
                    {location && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{t("labels.locationLabel")}</p>
                          <p className="text-sm text-muted-foreground">{location}</p>
                        </div>
                      </div>
                    )}
                    <div className="pt-3 border-t text-xs text-muted-foreground">
                      {t("labels.createdDate", { date: formatDate(alert.createdAt) })}
                      {alert.lastTriggered && (
                        <> {t("labels.lastTriggeredDateInline", { date: formatDate(alert.lastTriggered) })}</>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
