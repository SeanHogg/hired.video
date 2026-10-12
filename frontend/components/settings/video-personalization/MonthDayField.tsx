import { useTranslation } from "react-i18next";
import type { MonthDay } from "@shared/video-personalization";
import { monthName } from "@/lib/theme-calendar/describe";

const FIELD = "h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground";

/** A month + day (no year — moments recur every year), with Remove. */
export function MonthDayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MonthDay | null;
  onChange: (value: MonthDay | null) => void;
}) {
  const { t, i18n } = useTranslation();
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ month: 1, day: 1 })}
        className="min-h-[40px] rounded-md border border-border px-3 text-sm font-medium text-primary hover:bg-muted"
      >
        {t("personalization.add")}
      </button>
    );
  }
  const days = new Date(Date.UTC(2024, value.month, 0)).getUTCDate();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t("personalization.monthOf", { label })}
        className={FIELD}
        value={value.month}
        onChange={(e) => {
          const month = Number(e.target.value);
          onChange({ month, day: Math.min(value.day, new Date(Date.UTC(2024, month, 0)).getUTCDate()) });
        }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{monthName(m, i18n.language)}</option>
        ))}
      </select>
      <select aria-label={t("personalization.dayOf", { label })} className={FIELD} value={value.day} onChange={(e) => onChange({ ...value, day: Number(e.target.value) })}>
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <button type="button" onClick={() => onChange(null)} className="min-h-[40px] px-2 text-sm text-muted-foreground hover:text-foreground">
        {t("personalization.remove")}
      </button>
    </span>
  );
}
