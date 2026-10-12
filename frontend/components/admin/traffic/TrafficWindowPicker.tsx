// Look-back window for every card on the Traffic view (7 / 30 / 90 days).

import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TRAFFIC_WINDOW_DAYS, toTrafficWindow, type TrafficWindowDays } from "@shared/usage";

export function TrafficWindowPicker({
  value,
  onChange,
}: {
  value: TrafficWindowDays;
  onChange: (days: TrafficWindowDays) => void;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type="single"
      value={String(value)}
      onValueChange={(v) => v && onChange(toTrafficWindow(v))}
      aria-label={t("admin.traffic.window.label")}
      className="flex-wrap justify-start"
    >
      {TRAFFIC_WINDOW_DAYS.map((d) => (
        <ToggleGroupItem key={d} value={String(d)} className="min-h-9 px-3 text-sm">
          {t("admin.traffic.window.days", { count: d })}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
