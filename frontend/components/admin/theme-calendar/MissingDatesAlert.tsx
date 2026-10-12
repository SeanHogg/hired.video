import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ThemeEvent } from "@shared/theme-calendar/event";
import { themeCalendarService, type AdminThemeCalendar } from "@/lib/services/theme-calendar-service";
import { localized } from "@/lib/theme-calendar/describe";

/** "N yearly dates need entering" — lunar, religious and sports dates whose
 *  run-up starts within 120 days, each with an inline date to set. */
export function MissingDatesAlert({
  calendar,
  onSaved,
}: {
  calendar: AdminThemeCalendar;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  if (calendar.missingDates.length === 0) return null;
  const byId = new Map<string, ThemeEvent>(calendar.events.map((e) => [e.id, e]));

  const save = async (eventId: string, year: number) => {
    const key = `${eventId}:${year}`;
    const date = values[key];
    if (!date?.startsWith(`${year}-`)) return;
    setSaving(key);
    try {
      await themeCalendarService.setDate(eventId, { year, date });
      onSaved();
    } finally {
      setSaving(null);
    }
  };

  return (
    <section role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 flex-none text-destructive" aria-hidden="true" />
        {t("admin.themeCalendar.missingTitle", { count: calendar.missingDates.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {calendar.missingDates.map(({ eventId, year }) => {
          const key = `${eventId}:${year}`;
          const event = byId.get(eventId);
          return (
            <li key={key} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              <span className="min-w-[12rem] flex-1">{event ? localized(event.name, i18n.language) : eventId} · {year}</span>
              <input
                type="date"
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                aria-label={t("admin.themeCalendar.dateFor", { year })}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                value={values[key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
              <Button size="sm" disabled={!values[key] || saving === key} onClick={() => void save(eventId, year)}>
                {t("actions.save")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
