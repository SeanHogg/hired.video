/**
 * VolumeControl — shared sound-output widget for the platform's two
 * players (TextNarrator audio + PlaybackControls video).
 *
 * Renders a small mute/volume icon button; clicking opens a popover with
 * a continuous 0–1 slider. Both players consume the same component so
 * the volume affordance reads identically on every surface.
 *
 * Self-gates: the button still renders even when the host disables it
 * (eg. nothing to play); the consumer decides whether to disable.
 */
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export interface VolumeControlProps {
  /** Volume in 0..1. */
  volume: number;
  onVolumeChange: (next: number) => void;
  /** Mute is a separate flag so we can restore the pre-mute volume on
   *  unmute without the consumer juggling it. */
  muted: boolean;
  onToggleMute: () => void;
  disabled?: boolean;
  /** Black-chrome surface inherits white text; light surfaces get the
   *  default foreground. Defaults to `dark`. */
  tone?: "dark" | "light";
  className?: string;
  /** Popover alignment. Defaults to `end`. */
  align?: "start" | "center" | "end";
}

export default function VolumeControl({
  volume,
  onVolumeChange,
  muted,
  onToggleMute,
  disabled,
  tone = "dark",
  className,
  align = "end",
}: VolumeControlProps) {
  const isDark = tone === "dark";
  const effectiveVolume = muted ? 0 : volume;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={muted ? "Unmute / volume" : "Volume"}
          disabled={disabled}
          className={cn(
            "h-8 w-8 shrink-0 rounded-full p-0",
            isDark ? "text-white hover:bg-white/10" : "hover:bg-muted",
            className,
          )}
        >
          {muted || effectiveVolume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-48 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleMute}
              className="text-xs font-medium hover:underline"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(effectiveVolume * 100)}%
            </span>
          </div>
          <Slider
            value={[effectiveVolume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(next) => {
              const v = next[0] ?? 0;
              onVolumeChange(v);
            }}
            aria-label="Volume"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
