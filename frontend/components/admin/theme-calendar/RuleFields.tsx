import { useTranslation } from "react-i18next";
import { ASTRONOMICAL_POINTS } from "@shared/theme-calendar/dates";
import { DATE_RULE_TYPES, PERSON_MOMENTS, type DateRule } from "@shared/theme-calendar/event";
import { monthName, weekdayName } from "@/lib/theme-calendar/describe";
import { defaultRule } from "@/lib/theme-calendar/use-theme-event-form";
import { cn } from "@/lib/utils";

const FIELD = "h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground";
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const NTHS = [1, 2, 3, 4, 5, -1] as const;


/** "When it happens": the rule type, then that rule's own fields. Personal
 *  moments are a kind of their own, so "From the person" only shows for them. */
export function RuleFields({ rule, personal, onChange }: { rule: DateRule; personal: boolean; onChange: (rule: DateRule) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const types = DATE_RULE_TYPES.filter((type) => (type === "person") === personal);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-foreground">{t("admin.themeCalendar.when")}</legend>
      <div role="radiogroup" aria-label={t("admin.themeCalendar.when")} className="flex flex-wrap gap-1.5">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={rule.type === type}
            onClick={() => rule.type !== type && onChange(defaultRule(type))}
            className={cn(
              "min-h-[36px] rounded-full border px-3 text-[13px] font-medium",
              rule.type === type ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
            )}
          >
            {t(`admin.themeCalendar.ruleType.${type}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t(`admin.themeCalendar.ruleHelp.${rule.type}`)}</p>

      {rule.type === "fixed" && (
        <div className="flex flex-wrap gap-2">
          <select aria-label={t("admin.themeCalendar.month")} className={FIELD} value={rule.month} onChange={(e) => onChange({ ...rule, month: Number(e.target.value) })}>
            {MONTHS.map((m) => <option key={m} value={m}>{monthName(m, lang)}</option>)}
          </select>
          <input
            type="number"
            min={1}
            max={31}
            aria-label={t("admin.themeCalendar.day")}
            className={cn(FIELD, "w-20")}
            value={rule.day}
            onChange={(e) => onChange({ ...rule, day: Number(e.target.value) || 1 })}
          />
        </div>
      )}

      {rule.type === "nthWeekday" && (
        <div className="flex flex-wrap gap-2">
          <select aria-label={t("admin.themeCalendar.which")} className={FIELD} value={rule.nth} onChange={(e) => onChange({ ...rule, nth: Number(e.target.value) })}>
            {NTHS.map((n) => <option key={n} value={n}>{t(`themeCalendar.ordinal.${n}`)}</option>)}
          </select>
          <select aria-label={t("admin.themeCalendar.weekday")} className={FIELD} value={rule.weekday} onChange={(e) => onChange({ ...rule, weekday: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{weekdayName(d, lang)}</option>)}
          </select>
          <select aria-label={t("admin.themeCalendar.month")} className={FIELD} value={rule.month} onChange={(e) => onChange({ ...rule, month: Number(e.target.value) })}>
            {MONTHS.map((m) => <option key={m} value={m}>{monthName(m, lang)}</option>)}
          </select>
        </div>
      )}

      {rule.type === "computed" && (
        <select aria-label={t("admin.themeCalendar.when")} className={FIELD} value={rule.point} onChange={(e) => onChange({ type: "computed", point: e.target.value as typeof rule.point })}>
          {(["easter", ...ASTRONOMICAL_POINTS] as const).map((p) => <option key={p} value={p}>{t(`themeCalendar.rule.computed.${p}`)}</option>)}
        </select>
      )}

      {rule.type === "person" && (
        <select aria-label={t("admin.themeCalendar.when")} className={FIELD} value={rule.moment} onChange={(e) => onChange({ type: "person", moment: e.target.value as typeof rule.moment })}>
          {PERSON_MOMENTS.map((m) => <option key={m} value={m}>{t(`themeCalendar.rule.person.${m}`)}</option>)}
        </select>
      )}
    </fieldset>
  );
}
