"use client";

/**
 * AudioMixerDialog — gap #129 frontend.
 *
 * Visual multi-lane mixer for music + voiceover lanes. Per-lane gain slider
 * (0..200%), fade-in / fade-out envelope inputs, and master output gain.
 * Edits patch `script.video.audio.mix` so the export pipeline picks them
 * up automatically (see video-exporter.ts buildLane).
 */

import { useState } from "react";
import { Sliders, Volume2, Music, Mic, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { VideoScript, AudioMixConfig, AudioLaneConfig } from "@/types/video-script";

interface Props {
  script: VideoScript | null | undefined;
  onScriptChange?: (s: VideoScript) => void;
}

const DEFAULT_LANE: AudioLaneConfig = { gain: 1, fadeInSec: 0, fadeOutSec: 0, muted: false };

function laneOf(mix: AudioMixConfig | undefined, key: "music" | "voiceover" | "recording"): AudioLaneConfig {
  return { ...DEFAULT_LANE, ...mix?.[key] };
}

export default function AudioMixerDialog({ script, onScriptChange }: Props) {
  const [open, setOpen] = useState(false);
  const disabled = !script || !onScriptChange;

  const audio = script?.video?.audio;
  const mix = audio?.mix;

  function patchMix(patch: Partial<AudioMixConfig>) {
    if (!script || !onScriptChange) return;
    const nextMix = { ...mix, ...patch };
    const nextAudio = { ...(audio ?? { track: "none", label: "None", volume: 0.6 }), mix: nextMix };
    onScriptChange({ ...script, video: { ...script.video, audio: nextAudio } });
  }

  function patchLane(key: "music" | "voiceover" | "recording", patch: Partial<AudioLaneConfig>) {
    const current = laneOf(mix, key);
    patchMix({ [key]: { ...current, ...patch } });
  }

  function reset() {
    if (!script || !onScriptChange) return;
    const nextAudio = { ...(audio ?? { track: "none", label: "None", volume: 0.6 }), mix: undefined };
    onScriptChange({ ...script, video: { ...script.video, audio: nextAudio } });
  }

  const lanes: Array<{ key: "music" | "voiceover"; label: string; icon: typeof Music }> = [
    { key: "music",     label: "Music",     icon: Music },
    { key: "voiceover", label: "Voiceover", icon: Mic },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={disabled} title="Audio mixer">
          <Sliders className="w-3.5 h-3.5 mr-1" /> Mixer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Audio Mixer</DialogTitle>
          <DialogDescription>
            Per-lane gain, fade-in / fade-out envelopes, and master output. Applied at export.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Master */}
          <div className="border-b pb-3">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs flex items-center gap-1.5">
                <Volume2 className="w-3 h-3" /> Master output
              </Label>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                {Math.round((mix?.masterGain ?? 1) * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={2}
              step={0.05}
              value={[mix?.masterGain ?? 1]}
              onValueChange={(v) => patchMix({ masterGain: v[0] })}
            />
          </div>

          {/* Per-lane */}
          {lanes.map(({ key, label, icon: Icon }) => {
            const lane = laneOf(mix, key);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Icon className="w-3 h-3" /> {label}
                  </Label>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => patchLane(key, { muted: !lane.muted })}
                    title={lane.muted ? "Unmute" : "Mute"}
                  >
                    {lane.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={[lane.gain ?? 1]}
                    onValueChange={(v) => patchLane(key, { gain: v[0] })}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-9 text-right">
                    {Math.round((lane.gain ?? 1) * 100)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <label className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-12">Fade in</span>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      step={0.1}
                      value={lane.fadeInSec ?? 0}
                      onChange={(e) => patchLane(key, { fadeInSec: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-[11px] flex-1"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-12">Fade out</span>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      step={0.1}
                      value={lane.fadeOutSec ?? 0}
                      onChange={(e) => patchLane(key, { fadeOutSec: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-[11px] flex-1"
                    />
                  </label>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={reset}>Reset</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
