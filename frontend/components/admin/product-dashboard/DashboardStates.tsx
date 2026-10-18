import { useTranslation } from "react-i18next";
import { Activity, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DashboardAccessRestricted() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">{t("headings.accessRestricted")}</h2>
          <p className="text-muted-foreground">
            {t("errors.needSuperAdmin")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex items-center space-x-2">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span>{t("status.loadingDashboardData")}</span>
      </div>
    </div>
  );
}

export function DashboardError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">{t("labels.error")}</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("actions.retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
