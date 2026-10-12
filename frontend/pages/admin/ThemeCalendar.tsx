// /admin/studio?view=calendar — SuperAdmin theme calendar (gap #2350). It
// sets the default theme for every video, the "in season" labels and the
// home page's seasonal row. Chrome comes from <AdminLayout> at the route.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localToday } from "@shared/theme-calendar/dates";
import { THEME_EVENT_KINDS, type ThemeEvent, type ThemeEventKind } from "@shared/theme-calendar/event";
import { themeCalendarService } from "@/lib/services/theme-calendar-service";
import { THEME_CALENDAR_QUERY_KEY } from "@/hooks/use-theme-calendar";
import { mainDayThisYear } from "@/lib/theme-calendar/describe";
import { ThemeEventRow } from "@/components/admin/theme-calendar/ThemeEventRow";
import { ThemeEventSheet } from "@/components/admin/theme-calendar/ThemeEventSheet";
import { MissingDatesAlert } from "@/components/admin/theme-calendar/MissingDatesAlert";
import { TryDatePanel } from "@/components/admin/theme-calendar/TryDatePanel";

const ADMIN_KEY = ["admin", "theme-calendar"] as const;
const STATUSES = ["live", "off", "all"] as const;
type Status = (typeof STATUSES)[number];
const SOON_DAYS = 90;

export default function ThemeCalendar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ADMIN_KEY, queryFn: () => themeCalendarService.adminCalendar() });
  const [kind, setKind] = useState<ThemeEventKind | "all">("all");
  const [status, setStatus] = useState<Status>("live");
  const [soon, setSoon] = useState(false);
  const [editing, setEditing] = useState<{ event: ThemeEvent | null } | null>(null);
  const today = localToday();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ADMIN_KEY });
    // The picker everywhere reads the public list — refresh it too.
    void qc.invalidateQueries({ queryKey: THEME_CALENDAR_QUERY_KEY });
  };

  const events = q.data?.events ?? [];
  const shown = useMemo(
    () =>
      events
        .filter((e) => kind === "all" || e.kind === kind)
        .filter((e) => status === "all" || (status === "live") === e.isActive)
        .filter((e) => {
          if (!soon) return true;
          const main = mainDayThisYear(e, today);
          return main !== null && main + e.afterDays >= today && main - e.runupDays <= today + SOON_DAYS;
        })
        .sort((a, b) => (mainDayThisYear(a, today) ?? Infinity) - (mainDayThisYear(b, today) ?? Infinity)),
    [events, kind, status, soon, today],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("admin.themeCalendar.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("admin.themeCalendar.subtitle")}</p>
        </div>
        <Button onClick={() => setEditing({ event: null })}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("admin.themeCalendar.add")}
        </Button>
      </header>

      {q.data && <MissingDatesAlert calendar={q.data} onSaved={refresh} />}
      {q.data && <TryDatePanel events={events} />}

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("admin.themeCalendar.kind")}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={kind}
          onChange={(e) => setKind(e.target.value as ThemeEventKind | "all")}
        >
          <option value="all">{t("admin.themeCalendar.allKinds")}</option>
          {THEME_EVENT_KINDS.map((k) => <option key={k} value={k}>{t(`themeCalendar.kind.${k}`)}</option>)}
        </select>
        <select
          aria-label={t("admin.themeCalendar.status")}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{t(`admin.themeCalendar.statusOpt.${s}`)}</option>)}
        </select>
        <label className="flex min-h-[40px] items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="h-4 w-4" checked={soon} onChange={(e) => setSoon(e.target.checked)} />
          {t("admin.themeCalendar.soon", { days: SOON_DAYS })}
        </label>
        <span className="ml-auto text-sm text-muted-foreground">{t("admin.themeCalendar.count", { count: shown.length })}</span>
      </div>

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("admin.themeCalendar.loading")}
        </p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">{t("admin.themeCalendar.loadFailed")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["on", "event", "kind", "date", "picks", "region", "theme"].map((c) => (
                  <th key={c} scope="col" className="px-3 py-2.5 font-medium">{t(`admin.themeCalendar.col.${c}`)}</th>
                ))}
                <th scope="col" className="px-3 py-2.5"><span className="sr-only">{t("actions.edit")}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <ThemeEventRow key={e.id} event={e} today={today} onEdit={(event) => setEditing({ event })} onChanged={refresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ThemeEventSheet
          key={editing.event?.id ?? "new"}
          event={editing.event}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
