/**
 * Story — beside the résumé page: every video scene, the résumé section it is
 * built from, its length, and whether it is in the video. The page and the
 * video are one project; this is where you see how they line up.
 *
 * Clicking a scene opens it in the Video view; clicking its source opens that
 * section's editor (the same editor as the page's pencil). The switch takes a
 * scene in or out of the video (the last scene can't be switched off).
 */
import { useTranslation } from "react-i18next";
import { isLastSceneOn, VIDEO_SCENE_IDS, type VideoPlan, type VideoSceneId } from "@shared/video-plan";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SCENE_SECONDS, SCENE_SOURCE_SECTION } from "@/lib/build/video-outline";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import { resolveScenePalette } from "@/lib/build/scene-palette";
import type { VideoThemeId } from "@shared/video-themes";
import { sectionLabelKey } from "@/lib/build/editable-sections";
import { cn } from "@/lib/utils";

interface StoryPanelProps {
  plan: VideoPlan;
  /** The video's theme (scenes without their own look wear it). */
  themeId: VideoThemeId | null;
  onToggle: (id: VideoSceneId, on: boolean) => void;
  onOpenScene: (id: VideoSceneId) => void;
  onEditSource: (sectionKey: string) => void;
}

export default function StoryPanel({ plan, themeId, onToggle, onOpenScene, onEditSource }: StoryPanelProps) {
  const { t } = useTranslation();
  const rows = VIDEO_SCENE_IDS.map((id) => {
    const p = plan.scenes?.[id] ?? {};
    return {
      id,
      on: !p.off,
      seconds: p.duration ?? DEFAULT_SCENE_SECONDS[id],
      look: resolveScenePalette(plan, id, themeId),
    };
  });
  const total = rows.reduce((sum, r) => sum + (r.on ? r.seconds : 0), 0);
  const count = rows.filter((r) => r.on).length;

  return (
    <section aria-labelledby="build-story-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="build-story-title" className="text-[15px] font-semibold">
          {t("build.story.title")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("build.story.summary", { count, seconds: total })}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{t("build.story.help")}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const label = t(SCENE_LABEL_KEYS[row.id]);
          const source = SCENE_SOURCE_SECTION[row.id];
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card p-2.5",
                !row.on && "opacity-70",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenScene(row.id)}
                aria-label={t("build.story.openScene", { scene: label })}
                className="h-9 w-16 flex-none rounded-md"
                style={{ backgroundImage: `linear-gradient(135deg, ${row.look.from}, ${row.look.to})` }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  onClick={() => onOpenScene(row.id)}
                  className="truncate text-left text-sm font-semibold text-foreground hover:underline"
                >
                  {label}
                </button>
                <span className="truncate text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => onEditSource(source)}
                    className="underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {t(sectionLabelKey(source))}
                  </button>
                  {" · "}
                  {row.on ? t("build.video.sceneSeconds", { seconds: row.seconds }) : t("build.story.notInVideo")}
                </span>
              </div>
              <Switch
                checked={row.on}
                disabled={row.on && isLastSceneOn(plan, row.id)}
                onCheckedChange={(on) => onToggle(row.id, on)}
                aria-label={t("build.story.inVideo", { scene: label })}
              />
            </li>
          );
        })}
      </ul>
      <p className="rounded-[10px] bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground/80">
        {t("build.story.merged")}
      </p>
    </section>
  );
}
