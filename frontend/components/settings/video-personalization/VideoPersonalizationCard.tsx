import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useVideoPersonalization } from "@/hooks/use-video-personalization";
import { useDefaultVideoTheme } from "@/hooks/use-default-video-theme";
import { ThemeSwatch } from "@/components/video-themes/ThemeSwatch";
import {
  INTEREST_IDS,
  INTERESTS_MAX,
  INTEREST_MAX_LENGTH,
  OWN_WORDS_MAX,
  type VideoPersonalization,
} from "@shared/video-personalization";
import { EVERYDAY_THEME_IDS, videoThemeLabelKey, type VideoThemeId } from "@shared/video-themes";
import { cn } from "@/lib/utils";
import { isExplicitContentError } from "@/lib/moderation/explicit-content-error";
import { MonthDayField } from "./MonthDayField";

/** One moment row: a label, a hint, and its control. */
function Moment({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Settings › Video personalization (Moments board): set once, used by every
 * video — the person's own words, up to three interests, moments that pick
 * the theme, and whether the theme follows the date. Nothing is invented.
 */
export function VideoPersonalizationCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { personalization, canSave, isLoading, save, isSaving } = useVideoPersonalization();
  const [draft, setDraft] = useState<VideoPersonalization>(personalization);
  const [own, setOwn] = useState("");
  const today = useDefaultVideoTheme({ personalization: { ...draft, theme: { mode: "byDate" } } });
  useEffect(() => setDraft(personalization), [personalization]);
  if (!canSave) return null;

  const patch = (p: Partial<VideoPersonalization>) => setDraft((d) => ({ ...d, ...p }));
  const toggleInterest = (value: string) =>
    patch({
      interests: draft.interests.includes(value)
        ? draft.interests.filter((i) => i !== value)
        : draft.interests.length < INTERESTS_MAX ? [...draft.interests, value] : draft.interests,
    });
  const addOwn = () => {
    const v = own.trim().slice(0, INTEREST_MAX_LENGTH);
    if (v && !draft.interests.includes(v) && draft.interests.length < INTERESTS_MAX) patch({ interests: [...draft.interests, v] });
    setOwn("");
  };
  const custom = draft.interests.filter((i) => !(INTEREST_IDS as readonly string[]).includes(i));

  const onSave = async () => {
    try {
      await save(draft);
      toast({ title: t("personalization.saved") });
    } catch (err) {
      // An explicit-content block gets its own localized notice
      // (GlobalExplicitContentNotice) naming the category — don't stack a
      // generic "save failed" on top of it.
      if (isExplicitContentError(err)) return;
      toast({ title: t("personalization.saveFailed"), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("personalization.title")}</CardTitle>
        <CardDescription>{t("personalization.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("personalization.loading")}
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{t("personalization.ownWords")}</span>
              <textarea
                className="min-h-[72px] rounded-md border border-input bg-background p-3 text-sm text-foreground"
                maxLength={OWN_WORDS_MAX}
                placeholder={t("personalization.ownWordsPlaceholder")}
                value={draft.ownWords}
                onChange={(e) => patch({ ownWords: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">{t("personalization.ownWordsHint")}</span>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">{t("personalization.interests", { max: INTERESTS_MAX })}</legend>
              <div className="flex flex-wrap gap-1.5">
                {[...INTEREST_IDS, ...custom].map((id) => {
                  const on = draft.interests.includes(id);
                  const label = (INTEREST_IDS as readonly string[]).includes(id) ? t(`personalization.interest.${id}`) : id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && draft.interests.length >= INTERESTS_MAX}
                      onClick={() => toggleInterest(id)}
                      className={cn(
                        "min-h-[36px] rounded-full border px-3 text-[13px] font-medium disabled:opacity-50",
                        on ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="flex flex-wrap items-center gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  maxLength={INTEREST_MAX_LENGTH}
                  placeholder={t("personalization.yourOwn")}
                  aria-label={t("personalization.yourOwn")}
                  value={own}
                  onChange={(e) => setOwn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOwn())}
                />
                <Button type="button" variant="outline" size="sm" onClick={addOwn} disabled={!own.trim() || draft.interests.length >= INTERESTS_MAX}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t("personalization.addInterest")}
                </Button>
              </span>
            </fieldset>

            <section aria-labelledby="moments-title">
              <h3 id="moments-title" className="mb-1 text-sm font-semibold text-foreground">{t("personalization.moments")}</h3>
              <Moment title={t("personalization.workAnniversary")} hint={t("personalization.fromResume")}>
                <Switch checked={draft.useWorkAnniversary} onCheckedChange={(v) => patch({ useWorkAnniversary: v })} aria-label={t("personalization.workAnniversary")} />
              </Moment>
              <Moment title={t("personalization.graduation")} hint={t("personalization.graduationHint")}>
                <Switch checked={draft.useGraduation} onCheckedChange={(v) => patch({ useGraduation: v })} aria-label={t("personalization.graduation")} />
              </Moment>
              <Moment title={t("personalization.birthday")} hint={t("personalization.birthdayHint")}>
                <MonthDayField label={t("personalization.birthday")} value={draft.birthday} onChange={(birthday) => patch({ birthday })} />
              </Moment>
              <Moment title={t("personalization.wedding")} hint={t("personalization.weddingHint")}>
                <MonthDayField label={t("personalization.wedding")} value={draft.wedding} onChange={(wedding) => patch({ wedding })} />
              </Moment>
              <Moment title={t("personalization.parent")} hint={t("personalization.parentHint")}>
                <Switch checked={draft.isParent} onCheckedChange={(v) => patch({ isParent: v })} aria-label={t("personalization.parent")} />
              </Moment>
              <Moment title={t("personalization.inMemory")} hint={t("personalization.inMemoryHint")}>
                <MonthDayField label={t("personalization.inMemory")} value={draft.inMemory} onChange={(inMemory) => patch({ inMemory })} />
              </Moment>
            </section>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-foreground">{t("personalization.theme")}</legend>
              <label className="flex min-h-[44px] items-center gap-3 text-sm text-foreground">
                <input type="radio" name="theme-mode" className="h-4 w-4" checked={draft.theme.mode === "byDate"} onChange={() => patch({ theme: { mode: "byDate" } })} />
                <ThemeSwatch themeId={today.themeId} />
                <span>
                  {t("personalization.byDate")}
                  <span className="block text-xs text-muted-foreground">{t("personalization.byDateHint", { theme: t(videoThemeLabelKey(today.themeId)) })}</span>
                </span>
              </label>
              <label className="flex min-h-[44px] flex-wrap items-center gap-3 text-sm text-foreground">
                <input
                  type="radio"
                  name="theme-mode"
                  className="h-4 w-4"
                  checked={draft.theme.mode === "fixed"}
                  onChange={() => patch({ theme: { mode: "fixed", themeId: "standard" } })}
                />
                <span>{t("personalization.alwaysUse")}</span>
                <select
                  aria-label={t("personalization.alwaysUse")}
                  disabled={draft.theme.mode !== "fixed"}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50"
                  value={draft.theme.mode === "fixed" ? draft.theme.themeId : "standard"}
                  onChange={(e) => patch({ theme: { mode: "fixed", themeId: e.target.value as VideoThemeId } })}
                >
                  {EVERYDAY_THEME_IDS.map((id) => <option key={id} value={id}>{t(videoThemeLabelKey(id))}</option>)}
                </select>
              </label>
            </fieldset>

            <p className="text-xs text-muted-foreground">{t("personalization.promise")}</p>
            <div>
              <Button onClick={() => void onSave()} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("actions.save")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
