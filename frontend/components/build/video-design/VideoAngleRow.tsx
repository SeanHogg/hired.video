import { Trans, useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwatch } from "@/components/video-themes/ThemeSwatch";
import { VIDEO_AUDIENCES, VIDEO_GOALS, VIDEO_STARTS, type VideoAudience } from "@shared/video-targeting";
import { EVERYDAY_THEME_IDS, VIDEO_THEME_IDS, videoThemeLabelKey, type VideoThemeId } from "@shared/video-themes";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { localized } from "@/lib/theme-calendar/describe";

const CHIP =
  "inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm font-semibold text-foreground hover:bg-muted";

/**
 * The video Design tool's first row (Angle board): "Made for [the hiring
 * manager ▾] with the [Halloween ▾] theme". The theme defaults to the date
 * (or the person's Settings choice); every theme is free. Goal and start add
 * the badge and the What's next line.
 */
export function VideoAngleRow({ video }: { video: BuildVideo }) {
  const { t, i18n } = useTranslation();
  const { plan, defaultTheme, outline } = video;
  const audience: VideoAudience = plan.targeting?.audience ?? "hiringManager";
  const themeId: VideoThemeId = outline?.theme?.id ?? defaultTheme.themeId;
  const picked = Boolean(plan.themeId);
  const inSeason = [...new Set([defaultTheme.themeId, ...defaultTheme.others.map((o) => o.event.themeId)])];
  const rest = VIDEO_THEME_IDS.filter((id) => !inSeason.includes(id));

  return (
    <section aria-label={t("videoDesign.angle.label")} className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
        <Trans
          i18nKey="videoDesign.angle.sentence"
          components={{
            who: (
              <DropdownMenu>
                <DropdownMenuTrigger className={CHIP}>
                  {t(`videoDesign.audience.${audience}`)} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {VIDEO_AUDIENCES.map((a) => (
                    <DropdownMenuItem key={a} onSelect={() => video.setTargeting({ audience: a })}>
                      {t(`videoDesign.audience.${a}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            theme: (
              <DropdownMenu>
                <DropdownMenuTrigger className={CHIP}>
                  <ThemeSwatch themeId={themeId} className="h-5 w-7" />
                  {t(videoThemeLabelKey(themeId))} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[60vh] overflow-y-auto">
                  <DropdownMenuLabel>{t("videoDesign.theme.inSeason")}</DropdownMenuLabel>
                  {inSeason.map((id) => (
                    <DropdownMenuItem key={id} onSelect={() => video.setTheme(id === defaultTheme.themeId ? null : id)} className="gap-2">
                      <ThemeSwatch themeId={id} className="h-5 w-7" />
                      {t(videoThemeLabelKey(id))}
                      {id === defaultTheme.themeId && <span className="ml-auto text-xs text-muted-foreground">{t("videoDesign.theme.forToday")}</span>}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t("videoDesign.theme.every")}</DropdownMenuLabel>
                  {[...EVERYDAY_THEME_IDS.filter((id) => !inSeason.includes(id)), ...rest.filter((id) => !(EVERYDAY_THEME_IDS as readonly string[]).includes(id))].map((id) => (
                    <DropdownMenuItem key={id} onSelect={() => video.setTheme(id)} className="gap-2">
                      <ThemeSwatch themeId={id} className="h-5 w-7" />
                      {t(videoThemeLabelKey(id))}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          }}
        />
      </p>
      {plan.themeId && plan.themeId !== defaultTheme.themeId && !inSeason.includes(plan.themeId) && (
        // A posted video keeps its theme; once that season is over, offer
        // today's theme in one tap (Calendar board).
        <button
          type="button"
          onClick={() => video.setTheme(null)}
          className="inline-flex min-h-[36px] items-center gap-2 self-start rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-muted"
        >
          <ThemeSwatch themeId={defaultTheme.themeId} className="h-5 w-7" />
          {t("videoDesign.theme.retheme", { theme: t(videoThemeLabelKey(defaultTheme.themeId)) })}
        </button>
      )}
      {!picked && defaultTheme.source === "date" && defaultTheme.event && (
        <p className="text-xs text-muted-foreground">
          {t("videoDesign.theme.pickedForToday", { event: localized(defaultTheme.event.event.name, i18n.language) })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("videoDesign.goal.label")}
          <select
            className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={plan.targeting?.goal ?? ""}
            onChange={(e) => video.setTargeting({ goal: (e.target.value || undefined) as (typeof VIDEO_GOALS)[number] | undefined })}
          >
            <option value="">{t("videoDesign.notSaid")}</option>
            {VIDEO_GOALS.map((g) => <option key={g} value={g}>{t(`build.video.badge.goal.${g}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t("videoDesign.start.label")}
          <select
            className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={plan.targeting?.start ?? ""}
            onChange={(e) => video.setTargeting({ start: (e.target.value || undefined) as (typeof VIDEO_STARTS)[number] | undefined })}
          >
            <option value="">{t("videoDesign.notSaid")}</option>
            {VIDEO_STARTS.map((s) => <option key={s} value={s}>{t(`videoDesign.start.${s}`)}</option>)}
          </select>
        </label>
        {plan.targeting?.start === "date" && (
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("videoDesign.start.dateLabel")}
            <input
              type="date"
              className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              value={plan.targeting.startDate ?? ""}
              onChange={(e) => video.setTargeting({ startDate: e.target.value || undefined })}
            />
          </label>
        )}
      </div>
    </section>
  );
}
