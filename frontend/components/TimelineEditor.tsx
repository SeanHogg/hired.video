// TimelineEditor.tsx — proportional scene blocks + playhead.

import type { VideoScript } from "@/types/video-script";

interface Props {
  script: VideoScript;
  currentTime: number;
  onSeek: (time: number) => void;
  focusedSceneId?: string;
  onSceneFocus?: (id: string) => void;
}

const TRACK_HEIGHT = 48;
const PX_PER_SEC   = 20;

const SCENE_COLOURS: Record<string, string> = {
  intro:       "bg-violet-500/40 border-violet-500",
  achievement: "bg-blue-500/40 border-blue-500",
  skills:      "bg-emerald-500/40 border-emerald-500",
  closing:     "bg-amber-500/40 border-amber-500",
};

export default function TimelineEditor({ script, currentTime, onSeek, focusedSceneId, onSceneFocus }: Props) {
  const totalDuration = script.video.duration || 1;
  const trackWidth = totalDuration * PX_PER_SEC;

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * totalDuration;
    onSeek(Math.max(0, Math.min(totalDuration, t)));
  }

  return (
    <div className="p-5 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground font-medium">Timeline</p>
      <div
        className="relative overflow-x-auto"
        style={{ height: TRACK_HEIGHT + 20 }}
      >
        {/* Track */}
        <div
          className="relative cursor-pointer"
          style={{ width: trackWidth, height: TRACK_HEIGHT }}
          onClick={handleTrackClick}
        >
          {/* Scene blocks */}
          {script.scenes.map((scene) => {
            const left  = scene.start * PX_PER_SEC;
            const width = scene.duration * PX_PER_SEC - 2;
            const focusClass = focusedSceneId === scene.id ? "ring-2 ring-white/60" : "";
            return (
              <div
                key={scene.id}
                className={`absolute top-0 rounded border text-[10px] text-white flex items-center justify-center overflow-hidden select-none ${SCENE_COLOURS[scene.type] ?? "bg-muted"} ${focusClass}`}
                style={{ left, width, height: TRACK_HEIGHT }}
                onClick={(e) => { e.stopPropagation(); onSceneFocus?.(scene.id); }}
                title={`${scene.type}: ${scene.title ?? ""} (${scene.duration}s)`}
              >
                <span className="truncate px-1">{scene.title ?? scene.type}</span>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
            style={{ left: currentTime * PX_PER_SEC }}
          />
        </div>

        {/* Time ruler */}
        <div
          className="relative mt-1"
          style={{ width: trackWidth, height: 16 }}
        >
          {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
            <span
              key={i}
              className="absolute text-[9px] text-muted-foreground"
              style={{ left: i * PX_PER_SEC - (i > 0 ? 4 : 0) }}
            >
              {i}s
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
