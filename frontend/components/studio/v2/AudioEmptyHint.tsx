/**
 * AudioEmptyHint — guidance banner rendered above the canvas when an
 * audio-only project (podcast / voice) has nothing on its audio tracks
 * yet. Tells the user, in plain language, *where* the authoring
 * happens for this kind — because for video the canvas IS the work,
 * but for audio-only kinds the canvas is just a placeholder and the
 * real action is the Voiceover panel.
 *
 * Per the standing DRY rule the component SELF-GATES — returns `null`
 * for video / animation projects OR when the project already has
 * voiceover content. Callers pass the kind + state and never pass a
 * `shouldShowHint` boolean.
 */
import { Mic } from "lucide-react";
import {
  mediaKindHasAudio,
  mediaKindHasVideo,
  MEDIA_KIND_UI,
  type MediaKind,
} from "@shared/media-kinds";
import { voiceoverLayers, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { cn } from "@/lib/utils";

interface AudioEmptyHintProps {
  mediaKind: MediaKind;
  state: CanvasState;
  /** Called when the user clicks the CTA — host flips the left tab to
   *  Actions + opens the Voiceover sheet. The hint just announces the
   *  intent; the host owns the editor's tab/sheet state. */
  onRecordVoiceover: () => void;
  className?: string;
}

export default function AudioEmptyHint({
  mediaKind,
  state,
  onRecordVoiceover,
  className,
}: AudioEmptyHintProps) {
  // Visibility — audio-only kinds with zero voiceover content. Music-bed-
  // only projects still benefit from the hint because the user hasn't
  // recorded their own voice yet.
  const isAudioOnly = mediaKindHasAudio(mediaKind) && !mediaKindHasVideo(mediaKind);
  if (!isAudioOnly) return null;
  if (voiceoverLayers(state).length > 0) return null;

  const kindLabel = MEDIA_KIND_UI[mediaKind].badgeLabel;
  return (
    <div
      className={cn(
        "mx-auto flex max-w-2xl items-center gap-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-foreground shadow-sm",
        className,
      )}
    >
      <Mic className="h-4 w-4 shrink-0 text-sky-500" />
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-tight">
          {kindLabel} project — record your voiceover to start
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-tight">
          The canvas shows your chapter layout, but the actual export comes
          from the audio track. Open the Voiceover panel to record or
          type a script and let TTS generate it.
        </p>
      </div>
      <button
        type="button"
        onClick={onRecordVoiceover}
        className="shrink-0 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500"
      >
        Record voice
      </button>
    </div>
  );
}
