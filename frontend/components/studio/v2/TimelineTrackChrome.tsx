/**
 * TimelineTrackChrome — presentational pieces of the v2 timeline, split
 * out of AdvancedTimeline.tsx (which owns the drag / trim / split logic)
 * so styling can evolve without growing that file.
 *
 *   - TRACK_HEIGHT / TRACK_LABEL_WIDTH: geometry shared with the ruler +
 *     playhead math in AdvancedTimeline (label column width INCLUDES the
 *     gutter, so the % math stays exact).
 *   - KIND_ACCENT: per-audio-kind tint (voiceover = accent, music =
 *     brand-green/10, sfx = muted) — tokens only, dark-mode safe.
 *   - TrackRow: mono-caps label column + relative track lane.
 *   - CollapsedAudioSummary: collapsed view — one full-width tinted bar
 *     per audio layer, labelled by lane (VOICEOVER / MUSIC / SFX).
 */
import type { AudioLayer } from "@/lib/studio/editor-v2/canvas-state";
import { cn } from "@/lib/utils";

export const TRACK_HEIGHT = 28;
export const TRACK_LABEL_WIDTH = 96;

/** Per-track accent classes keyed by audio layer kind. */
export const KIND_ACCENT: Record<AudioLayer["kind"], string> = {
  music:
    "border-brand-green/40 bg-brand-green/10 text-brand-green-text hover:border-brand-green",
  voiceover:
    "border-primary/25 bg-accent text-accent-foreground hover:border-primary",
  sfx: "border-input bg-muted text-foreground/80 hover:border-foreground/40",
};

export function TrackRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex" style={{ minHeight: TRACK_HEIGHT }}>
      <div
        className="flex shrink-0 items-center truncate pr-2.5 font-mono text-[10px] uppercase text-muted-foreground"
        style={{ width: TRACK_LABEL_WIDTH }}
      >
        {label}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

/** Collapsed audio summary — one lane-labelled, full-width tinted bar per
 *  layer so the user sees their audio at a glance without the full
 *  multi-row (draggable) view. */
export function CollapsedAudioSummary({
  layers,
  kindLabel,
  laneLabel,
}: {
  layers: AudioLayer[];
  kindLabel: (layer: AudioLayer, index: number) => string;
  laneLabel: (kind: AudioLayer["kind"]) => string;
}) {
  if (layers.length === 0) return null;
  const kindCounts: Record<AudioLayer["kind"], number> = { music: 0, voiceover: 0, sfx: 0 };
  return (
    <>
      {layers.map((layer) => {
        kindCounts[layer.kind] += 1;
        return (
          <TrackRow key={layer.id} label={laneLabel(layer.kind)}>
            <span
              className={cn(
                "absolute inset-y-0.5 inset-x-0 flex items-center rounded-[5px] border px-2 text-[11px]",
                KIND_ACCENT[layer.kind],
              )}
            >
              <span className="truncate">{kindLabel(layer, kindCounts[layer.kind])}</span>
            </span>
          </TrackRow>
        );
      })}
    </>
  );
}
