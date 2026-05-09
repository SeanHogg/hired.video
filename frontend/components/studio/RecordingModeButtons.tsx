// RecordingModeButtons — single chooser used by both the
// Recording & Audio section header (large buttons, opens the panel
// armed in the picked mode) AND the in-panel mode picker (small
// chips, swap source mid-session).
//
// The mode list lives on `RECORDING_MODES` in WebcamRecorder.tsx —
// importing here so the labels + ordering never drift. Icons are
// resolved here so callers don't have to.

import { Video, Monitor, MonitorPlay, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECORDING_MODES, type RecordingMode } from "@/components/studio/WebcamRecorder";

const ICONS: Record<typeof RECORDING_MODES[number]["iconName"], LucideIcon> = {
  "video": Video,
  "monitor": Monitor,
  "monitor-play": MonitorPlay,
};

interface Props {
  /** Currently active mode (from parent state). When null, no button
   *  shows the active treatment — used by the section row when the
   *  panel is closed. */
  current: RecordingMode | null;
  /** Called when the user picks a mode. Parent decides what that
   *  means (section row opens the panel armed; in-panel picker just
   *  switches the source). */
  onPick: (mode: RecordingMode) => void;
  /** Visual size — `lg` for the section quick-launch row, `sm` for
   *  the in-panel mid-session swap. */
  size?: "sm" | "lg";
}

export function RecordingModeButtons({ current, onPick, size = "lg" }: Props) {
  return (
    <>
      {RECORDING_MODES.map((m) => {
        const Icon = ICONS[m.iconName];
        const active = current === m.id;
        if (size === "sm") {
          return (
            <button
              key={m.id}
              type="button"
              title={m.description}
              onClick={() => onPick(m.id)}
              className={cn(
                "px-2 h-6 rounded border text-[11px] flex items-center gap-1",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-accent",
              )}
            >
              <Icon className="h-3 w-3" /> {m.label}
            </button>
          );
        }
        return (
          <button
            key={m.id}
            type="button"
            title={m.description}
            onClick={() => onPick(m.id)}
            className={cn(
              "px-3 h-8 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {m.label}
          </button>
        );
      })}
    </>
  );
}
