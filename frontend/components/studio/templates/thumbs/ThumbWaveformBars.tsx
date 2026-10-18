import { cn } from "@/lib/utils";

/**
 * Small inline waveform bar set — used by podcast / voice thumbnails.
 * Self-contained (no caller-passed peaks) so each thumbnail stays a
 * one-line render.
 */
export default function ThumbWaveformBars({
  accent,
  bars,
  chapters,
  height = "h-6",
  inline = false,
}: {
  accent: string;
  bars: number;
  chapters?: number[];
  height?: string;
  inline?: boolean;
}) {
  // Deterministic bar heights — fixed pattern so every render is stable
  // and the visual reads as "envelope" rather than uniform.
  const bar = (i: number) => {
    const wave = Math.sin(i * 0.7) * 0.5 + 0.5;
    return 0.25 + wave * 0.7;
  };
  return (
    <div
      className={cn(
        "mt-1 flex items-end gap-[1px]",
        height,
        inline ? "flex-1" : "w-full",
      )}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const heightPct = `${Math.round(bar(i) * 100)}%`;
        const isChapter = chapters?.some((c) => Math.abs(i / bars - c) < 1 / (bars * 2));
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              height: heightPct,
              backgroundColor: accent,
              opacity: isChapter ? 1 : 0.7,
              boxShadow: isChapter ? `0 0 0 1px ${accent}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
