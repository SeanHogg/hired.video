/**
 * WaveformThumbnail — renders a stylised audio waveform inside a 16:9
 * frame. Used as the audio-only fallback for `VideoProjectThumbnail`
 * (#914) and (eventually) the chapter editor's preview pane (#907).
 *
 * The peaks come from `syntheticPeaks(seed, …)` so every card paints
 * deterministically from the project id — no decode cost, no I/O, and
 * the same project always renders the same shape. A future iteration
 * (alongside the chapter editor in #907) can swap in real peaks
 * decoded from the project's mixed-down audio.
 *
 * Per the DRY rule, this is the ONE component that turns a peaks array
 * into a thumbnail. Adding a new surface = `<WaveformThumbnail seed={…}/>`.
 */
import { useMemo } from "react";
import { syntheticPeaks } from "@/lib/audio/peaks";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";
import { cn } from "@/lib/utils";

interface WaveformThumbnailProps {
  /** Stable seed (typically the project id) — same seed → same waveform. */
  seed: string;
  /** Kind drives the background palette so a podcast waveform reads
   *  visually distinct from a voice clip. */
  mediaKind: MediaKind;
  className?: string;
}

const KIND_PALETTE: Record<MediaKind, { bg: string; bar: string; label: string }> = {
  // Kinds that produce visible frames (video / animation / game / comic)
  // should never reach this component — their thumbnail surfaces have
  // their own kind-aware renderers in `VideoProjectThumbnail`. We still
  // define a palette so the Record<MediaKind,…> stays exhaustive and
  // typecheck doesn't break when new kinds land.
  video:     { bg: "from-slate-800 to-slate-900",       bar: "#94a3b8", label: "#cbd5e1" },
  podcast:   { bg: "from-violet-900 to-slate-900",      bar: "#a78bfa", label: "#ddd6fe" },
  voice:     { bg: "from-amber-700/40 to-slate-900",    bar: "#fbbf24", label: "#fde68a" },
  animation: { bg: "from-emerald-700/40 to-slate-900",  bar: "#34d399", label: "#a7f3d0" },
  game:      { bg: "from-fuchsia-700/40 to-slate-900",  bar: "#e879f9", label: "#f5d0fe" },
  comic:     { bg: "from-sky-700/40 to-slate-900",      bar: "#38bdf8", label: "#bae6fd" },
  image:     { bg: "from-rose-700/40 to-slate-900",     bar: "#fb7185", label: "#fecdd3" },
};

const BAR_COUNT = 56;

export default function WaveformThumbnail({
  seed,
  mediaKind,
  className,
}: WaveformThumbnailProps) {
  const peaks = useMemo(() => syntheticPeaks(seed, BAR_COUNT), [seed]);
  const palette = KIND_PALETTE[mediaKind];
  const label = MEDIA_KIND_UI[mediaKind].badgeLabel;
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br",
        palette.bg,
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${BAR_COUNT * 4} 80`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full px-4"
        aria-hidden="true"
      >
        {peaks.map((p, i) => {
          const h = Math.max(2, p * 70);
          const y = (80 - h) / 2;
          return (
            <rect
              key={i}
              x={i * 4 + 1}
              y={y}
              width={2}
              height={h}
              rx={1}
              fill={palette.bar}
              opacity={0.85}
            />
          );
        })}
      </svg>
      <span
        className="relative z-10 rounded-full bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest backdrop-blur"
        style={{ color: palette.label }}
      >
        {label}
      </span>
    </div>
  );
}
