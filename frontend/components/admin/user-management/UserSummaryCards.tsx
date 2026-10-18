import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";

interface UserSummaryCardsProps {
  activeCount: number;
  suspendedCount: number;
  inactiveCount: number;
  adminCount: number;
  referredCount: number;
}

export function UserSummaryCards({
  activeCount,
  suspendedCount,
  inactiveCount,
  adminCount,
  referredCount,
}: UserSummaryCardsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
      {[
        { label: t("status.activeStatus"),    count: activeCount,    color: "text-green-600" },
        { label: t("status.suspendedStatus"), count: suspendedCount, color: "text-red-600"   },
        { label: t("status.inactiveStatus"),  count: inactiveCount,  color: "text-yellow-600"},
        { label: t("labels.admin") + "s",     count: adminCount,     color: "text-primary" },
        { label: t("labels.referred"),        count: referredCount,  color: "text-brand-primary" },
      ].map(({ label, count, color }) => (
        <Card key={label}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
