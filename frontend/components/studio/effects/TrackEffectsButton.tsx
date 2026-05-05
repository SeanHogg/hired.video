/**
 * TrackEffectsButton — opens a popover with the audio FX rack for a
 * single audio track. Reuses `EffectStackEditor` (the one panel that
 * drives every effect surface) by passing the audio catalog.
 *
 * Self-gates: returns null for non-audio tracks. Per the standing DRY
 * rule the consumer drops it in unconditionally and the component
 * decides whether it's relevant.
 */

"use client";

import { Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import EffectStackEditor, {
  type StackEntry,
} from "@/components/studio/effects/EffectStackEditor";
import { listAudioEffects } from "@/lib/timeline/effects";
import type { ClipEffect, Track } from "@shared/timeline";

interface Props {
  track: Track;
  onPatch: (patch: Partial<Track>) => void;
}

export default function TrackEffectsButton({ track, onPatch }: Props) {
  if (track.kind !== "audio") return null;
  const count = track.effects?.length ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={count > 0 ? "default" : "ghost"}
          className="h-5 px-1 text-[10px]"
          title={count > 0 ? `${count} audio effect${count === 1 ? "" : "s"}` : "Audio FX"}
        >
          <Sliders className="h-3 w-3" />
          {count > 0 && <span className="ml-0.5 tabular-nums">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <EffectStackEditor
          compact
          catalog={listAudioEffects()}
          effects={(track.effects ?? []) as StackEntry[]}
          onChange={(next) => onPatch({ effects: next as ClipEffect[] })}
        />
      </PopoverContent>
    </Popover>
  );
}
