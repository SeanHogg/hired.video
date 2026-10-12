import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isoOf, localToday, parseIsoDay } from "@shared/theme-calendar/dates";
import { THEME_FITS, THEME_REGIONS, type ThemeEvent, type ThemeFit } from "@shared/theme-calendar/event";
import { pickThemeEvent } from "@shared/theme-calendar/pick";
import { ThemeSwatch } from "@/components/video-themes/ThemeSwatch";
import { formatDay, localized } from "@/lib/theme-calendar/describe";
import { cn } from "@/lib/utils";

/** "Try a date": the default theme a person would get on a day, with the
 *  same picker every video uses — so an admin sees an edit's effect. */
export function TryDatePanel({ events }: { events: readonly ThemeEvent[] }) {
  const { t, i18n } = useTranslation();
  const [iso, setIso] = useState(() => isoOf(localToday()));
  const [region, setRegion] = useState<string>("US-MW");
  const [fits, setFits] = useState<ReadonlySet<ThemeFit>>(new Set());
  const day = parseIsoDay(iso) ?? localToday();
  const { winner, others } = pickThemeEvent(events, day, { region, fits, moments: {} });

  const toggleFit = (f: ThemeFit) =>
    setFits((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <section aria-labelledby="try-date-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 id="try-date-title" className="text-base font-semibold text-foreground">{t("admin.themeCalendar.tryTitle")}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label={t("admin.themeCalendar.tryDate")}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={iso}
          onChange={(e) => setIso(e.target.value)}
        />
        <select
          aria-label={t("admin.themeCalendar.regions")}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {THEME_REGIONS.map((r) => <option key={r} value={r}>{t(`themeCalendar.region.${r}`)}</option>)}
        </select>
        {THEME_FITS.filter((f) => f !== "person").map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={fits.has(f)}
            onClick={() => toggleFit(f)}
            className={cn(
              "min-h-[36px] rounded-full border px-3 text-[13px] font-medium",
              fits.has(f) ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
            )}
          >
            {t(`themeCalendar.fit.${f}`)}
          </button>
        ))}
      </div>
      {winner ? (
        <div className="flex items-center gap-3">
          <ThemeSwatch themeId={winner.event.themeId} className="h-12 w-20" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{localized(winner.event.name, i18n.language)}</p>
            <p className="text-sm text-muted-foreground">
              {t("admin.themeCalendar.tryWhy", {
                start: formatDay(winner.start, i18n.language),
                end: formatDay(winner.end, i18n.language),
              })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("admin.themeCalendar.tryNone")}</p>
      )}
      {others.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("admin.themeCalendar.tryAlso", { list: others.map((o) => localized(o.event.name, i18n.language)).join(" · ") })}
        </p>
      )}
    </section>
  );
}
