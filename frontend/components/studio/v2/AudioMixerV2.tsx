/**
 * AudioMixerV2 — V2-native audio mixer. Operates directly on
 * `CanvasState.audioMix` (master + per-lane gain/mute) and the unified
 * `CanvasState.audioLayers[]` model (#645), with no v1 `VideoScript`
 * projection. Two mixer lanes — Music (every music + sfx layer rides the
 * music lane) and Voiceover (each voiceover layer its own row) — plus a
 * master fader. Every layer also gets a per-layer gain/mute sub-row.
 *
 * Self-gating per the DRY rule:
 *   - Returns null when the state has no audio layers at all (nothing to
 *     mix — silence the trigger surface).
 *   - Mute / unmute toggles read their own state from `audioMix` (lane)
 *     or per-layer `muted`, never from a consumer-derived boolean.
 *
 * Render path: the preview player + v2-native render facade both compose
 * final gain as `master * lane * layer` so the mix the user hears in
 * preview is the mix the export emits.
 */
import { Mic, Music, Sliders, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import {
  DEFAULT_AUDIO_MIX,
  DEFAULT_DUCK_AMOUNT,
  musicLayers,
  voiceoverLayers,
  type CanvasAudioMix,
  type CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";

interface Props {
  state: CanvasState;
  onPatchMix: (patch: Partial<CanvasAudioMix>) => void;
  /** Patch ANY audio layer's per-layer gain / muted by id (music,
   *  voiceover, or sfx — the id is enough to locate it in
   *  `audioLayers`). Named `onPatchVoiceover` for call-site
   *  back-compat; it patches any layer. */
  onPatchVoiceover: (
    layerId: string,
    patch: { gain?: number; muted?: boolean },
  ) => void;
}

export default function AudioMixerV2({
  state,
  onPatchMix,
  onPatchVoiceover,
}: Props) {
  const { t } = useTranslation();
  const music = musicLayers(state);
  const voiceovers = voiceoverLayers(state);
  const sfx = state.audioLayers.filter((l) => l.kind === "sfx");
  const hasMusic = music.length > 0;
  const hasVoiceover = voiceovers.length > 0;
  const mix = state.audioMix ?? DEFAULT_AUDIO_MIX;

  // Self-gate: no audio layers at all, no point rendering the trigger.
  if (state.audioLayers.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-2 text-xs"
        >
          <Sliders className="mr-1.5 h-3.5 w-3.5" />
          {t("studio.audioMixer.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("studio.audioMixer.title")}</DialogTitle>
          <DialogDescription>
            {t("studio.audioMixer.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Master */}
          <LaneRow
            icon={Volume2}
            label={t("studio.audioMixer.lane.master")}
            gain={mix.masterGain}
            muted={false}
            onGain={(masterGain) => onPatchMix({ masterGain })}
          />

          {/* Music lane — the lane fader, then a per-layer sub-row for
              each music AND sfx layer (sfx rides the music lane). */}
          {(hasMusic || sfx.length > 0) && (
            <>
              {hasMusic && (
                <LaneRow
                  icon={Music}
                  label={t("studio.audioMixer.lane.music")}
                  gain={mix.musicGain}
                  muted={mix.musicMuted}
                  onGain={(musicGain) => onPatchMix({ musicGain })}
                  onToggleMute={() =>
                    onPatchMix({ musicMuted: !mix.musicMuted })
                  }
                />
              )}
              <div className="ml-4 flex flex-col gap-3 border-l border-border pl-3">
                {[...music, ...sfx].map((layer) => (
                  <LaneRow
                    key={layer.id}
                    icon={Music}
                    label={layer.label}
                    gain={layer.gain}
                    muted={layer.muted}
                    compact
                    onGain={(gain) => onPatchVoiceover(layer.id, { gain })}
                    onToggleMute={() =>
                      onPatchVoiceover(layer.id, { muted: !layer.muted })
                    }
                  />
                ))}
              </div>
            </>
          )}

          {/* Ducking — only meaningful when both music + voiceover are
              present. Self-gate per DRY: returns null otherwise so the
              user doesn't see a control that can't do anything. The
              slider value is the ducked multiplier; the shared
              `audio-ducking.ts` helper composes it with the music lane
              gain so preview + export match. */}
          {hasMusic && hasVoiceover && (
            <DuckingRow
              enabled={Boolean(mix.duckMusicUnderVoiceover)}
              amount={mix.duckAmount ?? DEFAULT_DUCK_AMOUNT}
              onToggle={(duckMusicUnderVoiceover) =>
                onPatchMix({ duckMusicUnderVoiceover })
              }
              onAmount={(duckAmount) => onPatchMix({ duckAmount })}
            />
          )}

          {/* Voiceover lane — the lane fader plus a row per layer */}
          {hasVoiceover && (
            <>
              <LaneRow
                icon={Mic}
                label={t("studio.audioMixer.lane.voiceover")}
                gain={mix.voiceoverGain}
                muted={mix.voiceoverMuted}
                onGain={(voiceoverGain) => onPatchMix({ voiceoverGain })}
                onToggleMute={() =>
                  onPatchMix({ voiceoverMuted: !mix.voiceoverMuted })
                }
              />
              <div className="ml-4 flex flex-col gap-3 border-l border-border pl-3">
                {voiceovers.map((layer) => (
                  <LaneRow
                    key={layer.id}
                    icon={Mic}
                    label={
                      layer.label ||
                      t("studio.audioMixer.voiceoverFallback")
                    }
                    gain={layer.gain}
                    muted={layer.muted}
                    compact
                    onGain={(gain) => onPatchVoiceover(layer.id, { gain })}
                    onToggleMute={() =>
                      onPatchVoiceover(layer.id, { muted: !layer.muted })
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

function DuckingRow({
  enabled,
  amount,
  onToggle,
  onAmount,
}: {
  enabled: boolean;
  amount: number;
  onToggle: (next: boolean) => void;
  onAmount: (next: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs">
          <Music className="h-3 w-3" />
          {t("studio.audioMixer.duck.label")}
        </Label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={t("studio.audioMixer.duck.toggleAria")}
        />
      </div>
      {enabled && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(amount * 100)}%
          </span>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[amount]}
            onValueChange={([v]) => onAmount(v)}
            className="flex-1"
            aria-label={t("studio.audioMixer.duck.amountAria")}
          />
        </div>
      )}
    </div>
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
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className={compact ? "flex items-center gap-1.5 text-[11px]" : "flex items-center gap-1.5 text-xs"}>
          <Icon className="h-3 w-3" />
          {label}
        </Label>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {muted ? t("studio.audioMixer.mute") : `${Math.round(gain * 100)}%`}
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
            aria-label={
              muted
                ? t("studio.audioMixer.unmute")
                : t("studio.audioMixer.mute")
            }
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
