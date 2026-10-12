import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeSwatch } from "@/components/video-themes/ThemeSwatch";
import {
  AUTO_PICKS,
  KIND_PRIORITY,
  PRIORITY_CHOICES,
  THEME_EVENT_KINDS,
  THEME_FITS,
  THEME_REGIONS,
  type LocalizedText,
  type ThemeEvent,
  type ThemeEventKind,
} from "@shared/theme-calendar/event";
import { THEME_TONES, VIDEO_THEMES, VIDEO_THEME_IDS, videoThemeLabelKey, type VideoThemeId } from "@shared/video-themes";
import { themeCalendarService } from "@/lib/services/theme-calendar-service";
import { useThemeEventForm, defaultRule } from "@/lib/theme-calendar/use-theme-event-form";
import { cn } from "@/lib/utils";
import { RuleFields } from "./RuleFields";

const FIELD = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const LANGS = ["en", "es", "fr-CA"] as const;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-[36px] rounded-full border px-3 text-[13px] font-medium",
        on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** One localized text field per language (English required). */
function LocalizedInputs({ label, value, onChange }: { label: string; value: LocalizedText; onChange: (v: LocalizedText) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium text-foreground">{label}</legend>
      {LANGS.map((lang) => (
        <label key={lang} className="flex items-center gap-2">
          <span className="w-12 flex-none font-mono text-xs text-muted-foreground">{lang}</span>
          <input
            className={FIELD}
            value={value[lang] ?? ""}
            maxLength={160}
            placeholder={lang === "en" ? t("admin.themeCalendar.required") : t("admin.themeCalendar.optional")}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value || (lang === "en" ? "" : undefined) })}
          />
        </label>
      ))}
    </fieldset>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface ThemeEventSheetProps {
  /** The event being edited, or null to add a custom one. */
  event: ThemeEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** SuperAdmin event editor (Admin board): name, kind, when it happens, run-up,
 *  who it picks, regions, priority, theme, tone and opening line. */
export function ThemeEventSheet({ event, open, onOpenChange, onSaved }: ThemeEventSheetProps) {
  const { t } = useTranslation();
  const form = useThemeEventForm(event);
  const { draft, patch } = form;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const isNew = event === null;

  const save = async () => {
    if (!form.valid || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      if (isNew) await themeCalendarService.create(form.value);
      else await themeCalendarService.update(event.id, form.value);
      onSaved();
      onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const setKind = (kind: ThemeEventKind) => {
    const personal = kind === "personal";
    patch({
      kind,
      priority: KIND_PRIORITY[kind],
      ...(personal !== (draft.rule.type === "person") ? { rule: defaultRule(personal ? "person" : "fixed") } : {}),
      ...(personal ? { autoPick: "whenFits", fits: ["person"] } : {}),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border p-5 text-left">
          <SheetTitle>{isNew ? t("admin.themeCalendar.addTitle") : t("admin.themeCalendar.editTitle")}</SheetTitle>
          <SheetDescription>{t("admin.themeCalendar.editHint")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("admin.themeCalendar.slug")}</span>
            <input
              className={cn(FIELD, "font-mono")}
              value={draft.slug}
              disabled={!isNew}
              onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            />
          </label>

          <LocalizedInputs label={t("admin.themeCalendar.name")} value={draft.name} onChange={(name) => patch({ name })} />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("admin.themeCalendar.kind")}</span>
            <select className={FIELD} value={draft.kind} onChange={(e) => setKind(e.target.value as ThemeEventKind)}>
              {THEME_EVENT_KINDS.map((k) => <option key={k} value={k}>{t(`themeCalendar.kind.${k}`)}</option>)}
            </select>
          </label>

          <RuleFields rule={draft.rule} personal={draft.kind === "personal"} onChange={(rule) => patch({ rule })} />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t("admin.themeCalendar.runup")}</span>
              <input type="number" min={0} max={120} className={FIELD} value={draft.runupDays} onChange={(e) => patch({ runupDays: Number(e.target.value) || 0 })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t("admin.themeCalendar.after")}</span>
              <input type="number" min={0} max={180} className={FIELD} value={draft.afterDays} onChange={(e) => patch({ afterDays: Number(e.target.value) || 0 })} />
            </label>
          </div>

          {draft.kind !== "personal" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">{t("admin.themeCalendar.picks")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {AUTO_PICKS.map((a) => (
                  <Chip key={a} on={draft.autoPick === a} onClick={() => patch({ autoPick: a })}>
                    {t(`themeCalendar.autoPick.${a}`)}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {THEME_FITS.filter((f) => f !== "person").map((f) => (
                  <Chip key={f} on={draft.fits.includes(f)} onClick={() => patch({ fits: toggle(draft.fits, f) })}>
                    {t(`themeCalendar.fit.${f}`)}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("admin.themeCalendar.fitHint")}</p>
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("admin.themeCalendar.regions")}</legend>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={draft.regions.length === 0} onClick={() => patch({ regions: [] })}>{t("themeCalendar.region.everywhere")}</Chip>
              {THEME_REGIONS.map((r) => (
                <Chip key={r} on={draft.regions.includes(r)} onClick={() => patch({ regions: toggle(draft.regions, r) })}>
                  {t(`themeCalendar.region.${r}`)}
                </Chip>
              ))}
            </div>
          </fieldset>

          {draft.kind === "custom" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t("admin.themeCalendar.priority")}</span>
              <select className={FIELD} value={draft.priority} onChange={(e) => patch({ priority: Number(e.target.value) })}>
                {PRIORITY_CHOICES.map((p) => <option key={p} value={p}>{t(`themeCalendar.priority.${p}`)}</option>)}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("admin.themeCalendar.theme")}</span>
            <span className="flex items-center gap-2">
              <ThemeSwatch themeId={draft.themeId} />
              <select className={FIELD} value={draft.themeId} onChange={(e) => {
                const themeId = e.target.value as VideoThemeId;
                patch({ themeId, tone: VIDEO_THEMES[themeId].tone });
              }}>
                {VIDEO_THEME_IDS.map((id) => <option key={id} value={id}>{t(videoThemeLabelKey(id))}</option>)}
              </select>
            </span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">{t("admin.themeCalendar.tone")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {THEME_TONES.map((tone) => (
                <Chip key={tone} on={draft.tone === tone} onClick={() => patch({ tone })}>{t(`themeCalendar.tone.${tone}`)}</Chip>
              ))}
            </div>
          </fieldset>

          {draft.tone !== "respectful" && (
            <LocalizedInputs label={t("admin.themeCalendar.line")} value={draft.line ?? { en: "" }} onChange={(line) => patch({ line })} />
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border p-4">
          {form.invalidField && <p className="w-full text-xs text-destructive">{t(`admin.themeCalendar.invalid.${form.invalidField}`, { defaultValue: t("admin.themeCalendar.invalid.form") })}</p>}
          {failed && <p className="w-full text-xs text-destructive">{t("admin.themeCalendar.saveFailed")}</p>}
          <label className="mr-auto flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4" checked={draft.isActive} onChange={(e) => patch({ isActive: e.target.checked })} />
            {t("admin.themeCalendar.live")}
          </label>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("actions.cancel")}</Button>
          <Button onClick={() => void save()} disabled={!form.valid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("actions.save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
