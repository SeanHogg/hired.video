/** Dayparting panel (#1770) — reads/writes `AdSetTargeting.dayparting`.
 *  No day / hour selected = always on. */

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DayOfWeek, DaypartingTargeting } from "@shared/ad-targeting";

const DAYS: readonly DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
const HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);

interface Props {
  value: DaypartingTargeting | undefined;
  onChange: (next: DaypartingTargeting | undefined) => void;
}

/** Drop empty keys so an "always on" daypart stores nothing. */
function compact(next: DaypartingTargeting): DaypartingTargeting | undefined {
  const out: DaypartingTargeting = {};
  if (next.daysOfWeek?.length) out.daysOfWeek = next.daysOfWeek;
  if (next.hoursOfDay?.length) out.hoursOfDay = next.hoursOfDay;
  if (next.timezone) out.timezone = next.timezone;
  return Object.keys(out).length ? out : undefined;
}

export default function DaypartTargetingSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  const days = (value?.daysOfWeek ?? []).map(String);
  const hours = (value?.hoursOfDay ?? []).map(String);
  const set = (patch: Partial<DaypartingTargeting>) => onChange(compact({ ...value, ...patch }));

  return (
    <section className="space-y-3" aria-labelledby="ad-targeting-daypart">
      <h3 id="ad-targeting-daypart" className="text-sm font-medium">{t("adTargeting.daypart.title")}</h3>

      <div className="space-y-1">
        <Label className="text-xs">{t("adTargeting.daypart.days")}</Label>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          className="flex-wrap justify-start"
          value={days}
          onValueChange={(next: string[]) =>
            set({ daysOfWeek: DAYS.filter((d) => next.includes(String(d))) })
          }
        >
          {DAYS.map((d) => (
            <ToggleGroupItem key={d} value={String(d)} aria-label={t(`adTargeting.daypart.day.${d}`)}>
              {t(`adTargeting.daypart.dayShort.${d}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("adTargeting.daypart.hours")}</Label>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          className="grid grid-cols-6 gap-1 sm:grid-cols-8"
          value={hours}
          onValueChange={(next: string[]) =>
            set({ hoursOfDay: HOURS.filter((h) => next.includes(String(h))) })
          }
        >
          {HOURS.map((h) => (
            <ToggleGroupItem
              key={h}
              value={String(h)}
              className="h-8 px-0 text-xs tabular-nums"
              aria-label={t("adTargeting.daypart.hourLabel", { hour: h })}
            >
              {String(h).padStart(2, "0")}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ad-targeting-timezone" className="text-xs">{t("adTargeting.daypart.timezone")}</Label>
        <Input
          id="ad-targeting-timezone"
          value={value?.timezone ?? ""}
          placeholder={t("adTargeting.daypart.timezonePlaceholder")}
          onChange={(e) => set({ timezone: e.target.value.trim() || undefined })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {days.length || hours.length ? t("adTargeting.daypart.selectedHint") : t("adTargeting.daypart.alwaysHint")}
      </p>
    </section>
  );
}
