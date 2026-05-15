/**
 * AudioMixerV2 — V2-native audio mixer. Operates directly on
 * `CanvasState.audioMix` + `CanvasState.voiceovers[].gain/muted`, with
 * no v1 `VideoScript` projection (#645). Two lanes — Music (sourced
 * from `state.musicSource`) and Voiceover (each clip in `voiceovers[]`
 * gets its own row) — plus a master fader.
 *
 * Self-gating per the DRY rule:
 *   - Returns null when the state has no music AND no voiceovers (no
 *     audio to mix — silence the trigger surface).
 *   - Mute / unmute toggles read their own state from `audioMix` (or
 *     per-clip `muted`), never from a consumer-derived boolean.
 *
 * Render path: the preview player + future v2-native render facade
 * both compose final gain as `master * lane * clip` so the mix the
 * user hears in preview is the mix the export emits.
 */
import { useMemo } from "react";
import {
  Loader2,
  Mic,
  Music,
  Sliders,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { resolveMusic } from "@/lib/studio/music-catalog";
import {
  DEFAULT_AUDIO_MIX,
  type CanvasAudioMix,
  type CanvasState,
  type VoiceoverClip,
} from "@/lib/studio/editor-v2/canvas-state";

interface Props {
  state: CanvasState;
  onPatchMix: (patch: Partial<CanvasAudioMix>) => void;
  onPatchVoiceover: (
    clipId: string,
    patch: Partial<Pick<VoiceoverClip, "gain" | "muted">>,
  ) => void;
}

export default function AudioMixerV2({
  state,
  onPatchMix,
  onPatchVoiceover,
}: Props) {
  const music = useMemo(() => resolveMusic(state.musicSource), [state.musicSource]);
  const hasMusic = music !== null;
  const hasVoiceover = state.voiceovers.length > 0;
  const hasAnyAudio = hasMusic || hasVoiceover;
  const mix = state.audioMix ?? DEFAULT_AUDIO_MIX;

  // Self-gate: nothing to mix, no point rendering the trigger.
  if (!hasAnyAudio) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-2 text-xs"
        >
          <Sliders className="mr-1.5 h-3.5 w-3.5" />
          Audio mixer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Audio mixer</DialogTitle>
          <DialogDescription>
            Master, music, and voiceover gains. Preview + export both
            compose final gain as <code>master × lane × clip</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Master */}
          <LaneRow
            icon={Volume2}
            label="Master"
            gain={mix.masterGain}
            muted={false}
            onGain={(masterGain) => onPatchMix({ masterGain })}
          />

          {/* Music lane */}
          {hasMusic && (
            <LaneRow
              icon={Music}
              label={`Music — ${music?.label ?? "selected"}`}
              gain={mix.musicGain}
              muted={mix.musicMuted}
              onGain={(musicGain) => onPatchMix({ musicGain })}
              onToggleMute={() => onPatchMix({ musicMuted: !mix.musicMuted })}
            />
          )}

          {/* Voiceover lane — master plus a row per clip */}
          {hasVoiceover && (
            <>
              <LaneRow
                icon={Mic}
                label="Voiceover (lane)"
                gain={mix.voiceoverGain}
                muted={mix.voiceoverMuted}
                onGain={(voiceoverGain) => onPatchMix({ voiceoverGain })}
                onToggleMute={() =>
                  onPatchMix({ voiceoverMuted: !mix.voiceoverMuted })
                }
              />
              <div className="ml-4 flex flex-col gap-3 border-l border-border pl-3">
                {state.voiceovers.map((clip) => (
                  <LaneRow
                    key={clip.id}
                    icon={Mic}
                    label={clip.label || "Voiceover"}
                    gain={clip.gain ?? 1}
                    muted={Boolean(clip.muted)}
                    compact
                    onGain={(gain) => onPatchVoiceover(clip.id, { gain })}
                    onToggleMute={() =>
                      onPatchVoiceover(clip.id, { muted: !clip.muted })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LaneRow({
  icon: Icon,
  label,
  gain,
  muted,
  onGain,
  onToggleMute,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gain: number;
  muted: boolean;
  onGain: (next: number) => void;
  onToggleMute?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className={compact ? "flex items-center gap-1.5 text-[11px]" : "flex items-center gap-1.5 text-xs"}>
          <Icon className="h-3 w-3" />
          {label}
        </Label>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {muted ? "muted" : `${Math.round(gain * 100)}%`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onToggleMute && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Volume2 className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        )}
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[muted ? 0 : gain]}
          disabled={muted}
          onValueChange={([v]) => onGain(v)}
          className="flex-1"
        />
      </div>
    </div>
  );
}
