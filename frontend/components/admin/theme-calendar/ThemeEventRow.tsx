import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ThemeSwatch } from "@/components/video-themes/ThemeSwatch";
import type { DayNumber } from "@shared/theme-calendar/dates";
import type { ThemeEvent } from "@shared/theme-calendar/event";
import { themeCalendarService } from "@/lib/services/theme-calendar-service";
import { describeRule, formatDay, localized, mainDayThisYear } from "@/lib/theme-calendar/describe";

/** One event in the SuperAdmin table: on/off, name, kind, this year's date
 *  and run-up, who it picks, region, theme, and Edit. */
export function ThemeEventRow({
  event,
  today,
  onEdit,
  onChanged,
}: {
  event: ThemeEvent;
  today: DayNumber;
  onEdit: (event: ThemeEvent) => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [busy, setBusy] = useState(false);
  const main = mainDayThisYear(event, today);
  const name = localized(event.name, lang);

  const toggle = async (isActive: boolean) => {
    setBusy(true);
    try {
      await themeCalendarService.setActive(event.id, isActive);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2.5">
        <Switch
          checked={event.isActive}
          disabled={busy}
          onCheckedChange={(v) => void toggle(v)}
          aria-label={t("admin.themeCalendar.toggle", { name })}
        />
      </td>
      <td className="px-3 py-2.5">
        <span className="font-medium text-foreground">{name}</span>
        {!event.isBuiltin && (
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("admin.themeCalendar.custom")}</span>
        )}
        <span className="block text-xs text-muted-foreground">{describeRule(event.rule, t, lang)}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{t(`themeCalendar.kind.${event.kind}`)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
        {main === null ? "—" : formatDay(main, lang)}
        <span className="block text-xs">
          {main === null
            ? t("admin.themeCalendar.runupDays", { count: event.runupDays })
            : `${formatDay(main - event.runupDays, lang)} – ${formatDay(main + event.afterDays, lang)}`}
        </span>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {event.autoPick === "whenFits" && event.kind !== "personal"
          ? event.fits.map((f) => t(`themeCalendar.fit.${f}`)).join(", ")
          : t(`themeCalendar.autoPick.${event.kind === "personal" ? "person" : event.autoPick}`)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
        {event.regions.length === 0
          ? t("themeCalendar.region.everywhere")
          : event.regions.map((r) => t(`themeCalendar.region.${r}`, { defaultValue: r })).join(", ")}
      </td>
      <td className="px-3 py-2.5">
        <ThemeSwatch themeId={event.themeId} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button size="sm" variant="outline" onClick={() => onEdit(event)}>
          {t("actions.edit")}
        </Button>
      </td>
    </tr>
  );
}
