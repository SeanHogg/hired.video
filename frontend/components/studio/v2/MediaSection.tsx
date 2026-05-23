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

import {
  Camera,
  Image as ImageIcon,
  MonitorUp,
  Search,
  UserSquare,
  Video as VideoIcon,
} from "lucide-react";
import { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import MediaPicker from "@/components/shared/MediaPicker";
import BinPanel from "../nle/BinPanel";
import { useToast } from "@/hooks/use-toast";
import type { VoiceoverClip } from "@/lib/studio/editor-v2/canvas-state";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";

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
  /** Audio source from the embedded bin → voiceover on the active scene. */
  onAddVoiceover: (clip: VoiceoverClip) => void;
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
  onAddVoiceover,
  activeSceneId,
  onOpenAiHeadshot,
}: MediaSectionProps) {
  const { toast } = useToast();

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

      {/* Embedded bin — the former Media tab folded inline. `-mx-3`
          cancels the section's px-3 so the bin spans edge-to-edge; the
          fixed h-80 bounds it inside the scroller while the bin's own
          inner list scrolls independently. */}
      <div className="-mx-3 mt-3 h-80 border-t">
        <BinPanel
          onPickSource={(src) => {
            if (src.kind === "image") {
              onAddImageWidget(src.url);
            } else if (src.kind === "video") {
              onAddVideoWidget(src.url, src.durationFrames / src.fps);
            } else if (src.kind === "audio") {
              onAddVoiceover({
                id:
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `vo_${Date.now()}`,
                url: src.url,
                durationSeconds: src.durationFrames / src.fps,
                anchorSceneId: activeSceneId,
                label: src.filename,
                gain: 1,
                muted: false,
              });
              toast({
                title: "Added as voiceover",
                description: src.filename,
              });
            }
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
