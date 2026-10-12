/**
 * VideoStrip — a kit's 150px strip on the video page.
 *
 *   Simple    play · scrub · time · sound; the scene row + the Voice and
 *             Music rows (VideoTimeline).
 *   Advanced  only APPENDS — Simple's rows look the same at both depths (zoom
 *             1 is Simple's width): the Text track under the scenes, the
 *             music clip's edit lane (move · trim · fades · remove;
 *             MusicTrack) under the Music row, the Captions track, a length
 *             handle overlaid on each scene block's edge, and the clipboard ·
 *             Layers · zoom tools in the header (one ⋯ menu on phones) —
 *             ONE track list (Scenes, Text, Voice, Music, Captions); the
 *             rows scroll, and Expand lifts them into a taller overlay. The
 *             clipboard is the page's only one: its keys answer from the
 *             frame too (useStripClipboard `active`).
 *
 * Every edit lands in the kit's ONE history (frame editor / plan), so Undo,
 * autosave and Post cover it. Zoom is the viewer's, never saved.
 */
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { VideoSceneId } from "@shared/video-plan";
import { totalDurationSeconds } from "@/lib/studio/editor-v2/canvas-state";
import { formatClock } from "@/lib/build/video-outline";
import { canvasSceneId } from "@/lib/build/scene-voiceover";
import { captionStyle, sceneCaptions, setCaptionEdit, setCaptionsOn, setCaptionStyle, type CaptionChunk } from "@/lib/build/captions";
import { retimeTextBlock, type TextBlock } from "@/lib/build/text-track";
import { sceneColumnTemplate, STRIP_ZOOM_FIT, stripTrackWidth, useStripZoom } from "@/lib/build/use-strip-zoom";
import { useStripClipboard } from "@/lib/build/use-strip-clipboard";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import type { KitPlayback } from "@/lib/workspace/use-kit-playback";
import VideoTimeline from "@/components/build/VideoTimeline";
import WorkspaceStrip from "../../WorkspaceStrip";
import StripPlaybackControls from "../../StripPlaybackControls";
import StripToolbar from "./StripToolbar";
import TextTrack from "./TextTrack";
import CaptionsTrack from "./CaptionsTrack";
import MusicTrack from "./MusicTrack";
import SceneLengthHandle from "./SceneLengthHandle";

type Ready = NonNullable<KitWorkspace["ready"]>;

interface VideoStripProps {
  kit: KitWorkspace;
  ready: Ready;
  clock: KitPlayback;
  advanced: boolean;
}

const ICON = "flex h-11 w-11 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40";
/** Where in a text block the player lands, so the words are on screen. */
const TEXT_SEEK_INTO = 0.7;

export default function VideoStrip({ kit, ready, clock, advanced }: VideoStripProps) {
  const { t } = useTranslation();
  const { editor, video, panel } = kit;
  const { frame, audio } = editor;
  const { playback, times, playingId } = clock;
  const { plan, updatePlan } = video;
  const canvas = ready.canvas;
  const total = playback.duration || totalDurationSeconds(canvas) || 1;
  const zoom = useStripZoom();
  const clipboard = useStripClipboard({
    plan,
    canvas,
    selection: frame.selection,
    scene: video.selected,
    updatePlan,
    onSelectScene: video.select,
    pasteWidget: frame.paste,
    removeWidget: frame.remove,
    active: advanced,
  });

  const columns = sceneColumnTemplate(ready.outline.scenes, times);
  const captions = useMemo(() => sceneCaptions(plan, canvas), [plan, canvas]);
  const style = captionStyle(plan);
  const startOf = useCallback((id: VideoSceneId) => times.find((s) => s.id === id)?.start ?? 0, [times]);
  // After a scene change the clock seeks to the scene's start; land after it.
  const seekLater = useCallback((seconds: number) => window.requestAnimationFrame(() => playback.seek(seconds)), [playback]);

  const editText = (sceneId: VideoSceneId, block: TextBlock) => {
    frame.editText(canvasSceneId(sceneId), block.members[0].widgetId);
    seekLater(startOf(sceneId) + Math.min(block.from + TEXT_SEEK_INTO, Math.max(block.from, block.to - 0.05)));
  };
  const retimeText = (_sceneId: VideoSceneId, block: TextBlock, from: number, to: number) =>
    updatePlan(retimeTextBlock(plan, block, from, to), `video:window:${block.key}`);
  const pickCaption = (sceneId: VideoSceneId, chunk: CaptionChunk) => {
    if (sceneId !== video.selected) video.select(sceneId);
    seekLater(startOf(sceneId) + chunk.start + 0.05);
  };

  return (
    <WorkspaceStrip
      label={t("workspace.strip.timeline", { time: formatClock(total) })}
      ariaLabel={t("build.frame.timeline")}
      expandable={advanced}
      controls={
        <>
          <StripPlaybackControls playback={playback} total={total} />
          <button
            type="button"
            onClick={playback.toggleMute}
            aria-pressed={!playback.muted}
            aria-label={playback.muted ? t("build.video.unmute") : t("build.video.mute")}
            className={ICON}
          >
            {playback.muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </button>
          {advanced && <StripToolbar clipboard={clipboard} zoom={zoom} onLayers={() => panel.show("layers")} />}
          {advanced && audio.hasMusic && (
            <label className="hidden items-center gap-1.5 xl:inline-flex">
              <span className="sr-only">{t("build.frame.musicVolume")}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(audio.volume * 100)}
                onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
                aria-valuetext={`${Math.round(audio.volume * 100)}%`}
                className="h-1.5 w-20 cursor-pointer accent-primary"
              />
            </label>
          )}
          {advanced && frame.hasHandEdits && (
            <button
              type="button"
              onClick={frame.resetHandEdits}
              className="hidden min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-foreground hover:bg-muted sm:inline-flex"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("build.frame.resetHandEdits")}
            </button>
          )}
        </>
      }
    >
      {/* Focusable so the clipboard keys and Ctrl/⌘ + wheel act on the strip. */}
      <div
        ref={advanced ? zoom.wheelRef : undefined}
        tabIndex={advanced ? 0 : undefined}
        onKeyDown={advanced ? clipboard.onKeyDown : undefined}
        aria-label={advanced ? t("workspace.strip.tracks") : undefined}
        role={advanced ? "group" : undefined}
        className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Zoomed in, the tracks widen and scroll; at fit they are Simple's width. */}
        <div style={advanced && zoom.zoom > STRIP_ZOOM_FIT ? stripTrackWidth(zoom.zoom, ready.outline.scenes.length) : undefined}>
          <VideoTimeline
            outline={ready.outline}
            times={times}
            selected={video.selected}
            playingId={playingId}
            onSelect={video.select}
            onOpenMusic={() => panel.show("media")}
            plan={plan}
            afterScenes={
              advanced && (
                <TextTrack
                  scenes={ready.outline.scenes}
                  times={times}
                  canvas={canvas}
                  columns={columns}
                  selectedWidgetId={frame.selection.kind === "widget" ? frame.selection.widgetId : null}
                  onEdit={editText}
                  onRetime={retimeText}
                />
              )
            }
            after={
              advanced && (
                <>
                  {/* The Music row above stays as Simple shows it; this lane edits its clip. */}
                  {audio.clip && <MusicTrack clip={audio.clip} totalSeconds={total} onTiming={audio.setTiming} onRemove={audio.remove} />}
                  <CaptionsTrack
                    scenes={ready.outline.scenes}
                    times={times}
                    captions={captions}
                    columns={columns}
                    on={plan.captions?.on === true}
                    position={style.position}
                    size={style.size}
                    onToggle={(on) => updatePlan(setCaptionsOn(plan, on))}
                    onStyle={(patch) => updatePlan(setCaptionStyle(plan, patch))}
                    onPick={pickCaption}
                    onReword={(sceneId, from, text) => updatePlan(setCaptionEdit(plan, sceneId, from, text))}
                  />
                </>
              )
            }
            sceneHandle={
              advanced
                ? (sceneId, seconds) => (
                    <SceneLengthHandle sceneId={sceneId} seconds={seconds} onLength={(id, next, group) => video.patchScene(id, { duration: next }, group)} />
                  )
                : undefined
            }
          />
        </div>
      </div>
    </WorkspaceStrip>
  );
}
