/**
 * MediaSection — the SINGLE home for every "add media to the canvas"
 * affordance in the V2 studio. Mounted from both `WidgetPalette` (Widgets
 * tab) and `ActionsPanel` (Actions tab) so the two surfaces share one
 * source of truth — no parallel set of Image / Video / Webcam / Stock
 * tiles to keep in sync.
 *
 * Replaces the standalone "Media" tab that used to mount `BinPanel`
 * directly: the bin browser is now embedded here, alongside the blank-
 * widget tiles, the unified Stock/AI picker dialog, and the optional
 * AI-Headshot tile.
 *
 * Per the standing DRY rule the component self-gates: tiles that need a
 * browser capability (Screenshot → `getDisplayMedia`) hide themselves,
 * and the AI-Headshot tile renders only when a host wires its open
 * callback — consumers don't gate from the outside.
 */

"use client";

import { useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  MonitorUp,
  Search,
  UserSquare,
  Video as VideoIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import MediaPicker from "@/components/shared/MediaPicker";
import BinPanel from "../nle/BinPanel";
import { useToast } from "@/hooks/use-toast";
import {
  type AudioLayer,
  type AudioLayerKind,
  makeAudioLayer,
} from "@/lib/studio/editor-v2/canvas-state";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import { cn } from "@/lib/utils";

/** What the bin lists on a host with no free audio layers. */
const VISUAL_KINDS = ["image", "video"] as const;

export interface MediaSectionProps {
  open: boolean;
  onToggle: () => void;
  /** Drops a blank Image / Video / Webcam widget onto the active scene. */
  onInsertImage: () => void;
  onInsertVideo: () => void;
  onInsertWebcam: () => void;
  /** Capture-screen-then-place-as-Image flow. The Screenshot tile self-
   *  gates on `getDisplayMedia`, so callers always supply this even when
   *  the browser doesn't expose the capability. */
  onCaptureScreenshot: () => void;
  /** MediaPicker (Upload / Stock / AI) result handlers — image vs video
   *  branch because they place different widget kinds. */
  onAddImageWidget: (url: string) => void;
  onAddVideoWidget: (url: string, durationSeconds: number) => void;
  /** Append an audio layer (music / voiceover / sfx) built from a bin
   *  source. The layer already carries its `kind`, so this is the single
   *  generic add seam for all three audio kinds. Omit it on a host that
   *  can't hold free audio layers — the "Add audio as" control hides and
   *  bin audio is neither added nor draggable as music. */
  onAddAudioLayer?: (layer: AudioLayer) => void;
  activeSceneId: string;
  /** When provided, surfaces the AI-Headshot tile. The Actions-tab host
   *  opens the existing HeadshotGenerator sheet here; the Widgets-tab
   *  host omits it because it has no sheet machinery — the tile self-
   *  hides via the same DRY-gating pattern the other tiles use. */
  onOpenAiHeadshot?: () => void;
}

export default function MediaSection({
  open,
  onToggle,
  onInsertImage,
  onInsertVideo,
  onInsertWebcam,
  onCaptureScreenshot,
  onAddImageWidget,
  onAddVideoWidget,
  onAddAudioLayer,
  activeSceneId,
  onOpenAiHeadshot,
}: MediaSectionProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  // Which audio kind a picked / dragged bin audio source becomes. Drag
  // always adds music (the "drag music in" gesture); click-add uses this.
  const [audioKind, setAudioKind] = useState<AudioLayerKind>("voiceover");

  // Build an audio layer of `kind` from a bin audio source.
  const audioLayerFromSource = (
    kind: AudioLayerKind,
    url: string,
    durationSeconds: number,
    label: string,
  ): AudioLayer =>
    makeAudioLayer({
      kind,
      source: { kind: "custom", url },
      durationSeconds,
      // Voiceover/sfx anchor to the active scene; music plays from
      // composition 0 (no anchor).
      anchorSceneId: kind === "music" ? null : activeSceneId,
      label,
    });

  return (
    <LeftPanelSection title="Media" open={open} onToggle={onToggle}>
      <div className="grid grid-cols-2 gap-2">
        <LeftPanelTile
          label="Image"
          icon={ImageIcon}
          onClick={onInsertImage}
          draggable
          onDragStart={(e) =>
            writeDragPayload(e.dataTransfer, { kind: "widget", data: "image" })
          }
        />
        <LeftPanelTile
          label="Video"
          icon={VideoIcon}
          onClick={onInsertVideo}
          draggable
          onDragStart={(e) =>
            writeDragPayload(e.dataTransfer, { kind: "widget", data: "video" })
          }
        />
        <LeftPanelTile
          label="Webcam"
          icon={Camera}
          onClick={onInsertWebcam}
          draggable
          onDragStart={(e) =>
            writeDragPayload(e.dataTransfer, { kind: "widget", data: "webcam" })
          }
        />
        <ScreenshotTile onCapture={onCaptureScreenshot} />
        <MediaPicker
          accept="image+video"
          title="Add media to canvas"
          onPick={(asset) => {
            if (asset.mediaType === "video") {
              onAddVideoWidget(asset.url, 0);
            } else {
              onAddImageWidget(asset.url);
            }
          }}
          trigger={
            <LeftPanelTile
              label="Stock & AI"
              icon={Search}
              onClick={() => {
                /* MediaPicker opens itself via DialogTrigger asChild. */
              }}
            />
          }
        />
        {onOpenAiHeadshot && (
          <LeftPanelTile
            label="AI Headshot"
            icon={UserSquare}
            onClick={onOpenAiHeadshot}
          />
        )}
      </div>

      {/* Audio-kind selector — governs what a picked / dragged bin AUDIO
          source becomes (a music bed, a voiceover, or a one-shot sound
          effect). Dragging an audio source onto the canvas/timeline
          always adds it as a MUSIC track regardless (the "drag music in"
          gesture); this toggle drives the double-click add. */}
      {onAddAudioLayer && (
        <div className="mt-3 flex items-center gap-1 text-[10px]">
          <span className="text-muted-foreground">{t("studio.media.addAudioAs")}</span>
          <div className="flex overflow-hidden rounded border border-border">
            {(["music", "voiceover", "sfx"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAudioKind(k)}
                className={cn(
                  "px-1.5 py-0.5 transition",
                  audioKind === k
                    ? "bg-brand-primary text-white"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`studio.media.audioKind.${k}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Embedded bin — the former Media tab folded inline. `-mx-3`
          cancels the section's px-3 so the bin spans edge-to-edge; the
          fixed h-80 bounds it inside the scroller while the bin's own
          inner list scrolls independently. */}
      <div className="-mx-3 mt-2 h-80 border-t">
        <BinPanel
          kinds={onAddAudioLayer ? undefined : VISUAL_KINDS}
          onPickSource={(src) => {
            if (src.kind === "image") {
              onAddImageWidget(src.url);
            } else if (src.kind === "video") {
              onAddVideoWidget(src.url, src.durationFrames / src.fps);
            } else if (src.kind === "audio" && onAddAudioLayer) {
              const durationSeconds = src.durationFrames / src.fps;
              onAddAudioLayer(
                audioLayerFromSource(audioKind, src.url, durationSeconds, src.filename),
              );
              toast({
                title: t(`studio.media.addedAs.${audioKind}`),
                description: src.filename,
              });
            }
          }}
          onSourceDragStart={(e, src) => {
            // Dragging a bin audio source onto the canvas/timeline adds a
            // MUSIC layer — encode the custom source for `handleMusicDrop`.
            if (src.kind !== "audio" || !onAddAudioLayer) return;
            writeDragPayload(e.dataTransfer, {
              kind: "music",
              data: JSON.stringify({
                url: src.url,
                label: src.filename,
                durationSeconds: src.durationFrames / src.fps,
              }),
            });
          }}
        />
      </div>
    </LeftPanelSection>
  );
}

/**
 * Screenshot palette tile. Self-gates per the DRY rule: when the
 * browser doesn't expose `getDisplayMedia` (older Safari, WebView, …)
 * the tile returns null instead of forcing every parent to thread a
 * `canCaptureScreenshot` boolean through.
 */
function ScreenshotTile({ onCapture }: { onCapture: () => void }) {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.mediaDevices?.getDisplayMedia !== "function"
  ) {
    return null;
  }
  return (
    <LeftPanelTile
      label="Screenshot"
      icon={MonitorUp}
      onClick={onCapture}
      draggable
      onDragStart={(e) =>
        writeDragPayload(e.dataTransfer, { kind: "screenshot", data: "1" })
      }
      hint="Pick a window, tab, or screen and a snapshot lands on the canvas"
    />
  );
}
