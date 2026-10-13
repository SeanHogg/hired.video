/**
 * The video timeline rows (Advanced slots its Text track under the scenes
 * and its Captions track at the end): one block per scene, as wide as it plays (lengths
 * come from the canvas — narration can lengthen a scene), and a music row
 * under it. Selecting a block selects that scene (the inspector
 * beside the video edits it) and seeks the player there; the block playing
 * now is marked. The music row opens the Media tab, where the track is chosen.
 * Every row looks the same at both depths: Advanced only APPENDS rows
 * (`afterScenes`; `after` — the music clip's edit lane, Captions) and
 * overlays a length handle on each scene block's edge (`sceneHandle`).
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Music } from "lucide-react";
import type { VideoPlan, VideoSceneId } from "@shared/video-plan";
import { formatClock, type VideoOutline } from "@/lib/build/video-outline";
import type { SceneTime } from "@/lib/build/frame-edits";
import { SCENE_LABEL_KEYS } from "@/lib/build/video-copy";
import { findMusicTrack } from "@/lib/studio/music-catalog";
import { useVoiceSummary } from "@/lib/build/use-voice-summary";
import { sceneColumnTemplate } from "@/lib/build/use-strip-zoom";
import { cn } from "@/lib/utils";

interface VideoTimelineProps {
  outline: VideoOutline;
  /** Start + length of each scene as it plays. */
  times: SceneTime[];
  selected: VideoSceneId;
  playingId: VideoSceneId | null;
  onSelect: (id: VideoSceneId) => void;
  /** Opens the Media tool (music + voice). */
  onOpenMusic: () => void;
  /** The plan, for the Voice row's summary. */
  plan: VideoPlan;
  /** Advanced rows under the scene row (the Text track). */
  afterScenes?: ReactNode;
  /** Advanced rows under the music row (the music edit lane, Captions). */
  after?: ReactNode;
  /** Advanced: a scene block's length handle, overlaid on its right edge. */
  sceneHandle?: (id: VideoSceneId, seconds: number) => ReactNode;
}

export default function VideoTimeline({ outline, times, selected, playingId, onSelect, onOpenMusic, plan, afterScenes, after, sceneHandle }: VideoTimelineProps) {
  const { t } = useTranslation();
  const track = outline.music === "none" ? null : findMusicTrack(outline.music);
  const voice = useVoiceSummary(plan);
  const silent = voice.status.kind === "none";
  // Blocks stay tappable on a phone: the row scrolls rather than squeezing.
  const timeOf = (id: VideoSceneId) => times.find((s) => s.id === id);
  const columns = sceneColumnTemplate(outline.scenes, times);

  return (
    <div className="flex flex-col gap-2 overflow-x-auto pb-1">
      <ol aria-label={t("build.video.scenes")} className="grid gap-1.5" style={{ gridTemplateColumns: columns }}>
        {outline.scenes.map((s) => {
          const isSelected = s.id === selected;
          const isPlaying = s.id === playingId;
          const time = timeOf(s.id);
          const look = s.palette;
          return (
            <li key={s.id} data-scene-block="" className="group relative min-w-0">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={isSelected}
                aria-current={isPlaying ? "step" : undefined}
                className={cn(
                  "flex min-h-[60px] w-full flex-col items-start gap-1 overflow-hidden rounded-[10px] border bg-card px-2.5 py-2 text-left text-foreground transition-colors",
                  isSelected ? "border-2 border-primary" : "border-border hover:border-primary/60",
                )}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn("h-2.5 w-2.5 flex-none rounded-full", isPlaying && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
                    style={{ backgroundImage: `linear-gradient(135deg, ${look.from}, ${look.to})` }}
                  />
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {formatClock(time?.start ?? 0)} ·{" "}
                    {t("build.video.sceneSeconds", { seconds: Math.round(time?.duration ?? s.duration) })}
                  </span>
                </span>
                <strong className="max-w-full truncate text-sm font-semibold">{t(SCENE_LABEL_KEYS[s.id])}</strong>
              </button>
              {sceneHandle?.(s.id, time?.duration ?? s.duration)}
            </li>
          );
        })}
      </ol>
      {afterScenes}
      <button
        type="button"
        onClick={onOpenMusic}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-[10px] border border-dashed bg-card px-3 text-left text-sm text-foreground transition-colors hover:bg-muted",
          silent ? "border-primary/50" : "border-border",
        )}
      >
        <Mic aria-hidden="true" className="h-4 w-4 flex-none text-muted-foreground" />
        <span className="font-semibold">{t("build.voice.title")}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{voice.label}</span>
        {silent && <span className="flex-none text-[13px] font-semibold text-primary">{t("build.voice.add")}</span>}
      </button>
      <button
        type="button"
        onClick={onOpenMusic}
        className="flex min-h-11 w-full items-center gap-2 rounded-[10px] border border-dashed border-border bg-card px-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
      >
        <Music aria-hidden="true" className="h-4 w-4 flex-none text-muted-foreground" />
        <span className="font-semibold">{t("build.media.music")}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {track ? track.label : t("build.media.noMusic")}
        </span>
      </button>
      {after}
    </div>
  );
}
