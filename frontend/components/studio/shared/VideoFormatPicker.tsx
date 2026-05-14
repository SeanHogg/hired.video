/**
 * VideoFormatPicker — grouped grid of format presets (Landscape / Portrait /
 * Square / Classic, each in 720p / 1080p / 4K) shared between v1's
 * StudioSettings and v2's DesignPanel.
 *
 * Per the standing DRY rule: every "pick a video format" surface mounts
 * THIS component. Adding a preset is one entry in
 * `lib/studio/video-formats.ts` and the picker shows it everywhere.
 * Self-gates the Pro badge — no prop-drilled `canExport4K` boolean.
 */
import {
  VIDEO_FORMATS,
  groupFormatsByAspect,
  type VideoFormat,
} from "@/lib/studio/video-formats";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { cn } from "@/lib/utils";

export interface VideoFormatPickerProps {
  /** Currently-applied format id. Optional — falls through to "no
   *  selection" highlighting. */
  activeFormatId?: string | null;
  /** Emits the picked format. Parent decides what to do with it (v1
   *  writes { aspectRatio, resolution } enums; v2 writes { width,
   *  height, fps } pixels). */
  onSelect: (format: VideoFormat) => void;
  className?: string;
}

export default function VideoFormatPicker({
  activeFormatId,
  onSelect,
  className,
}: VideoFormatPickerProps) {
  const { isPro } = useSubscription();
  const groups = groupFormatsByAspect();
  void VIDEO_FORMATS; // re-export reference for tests that assert catalog size

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {groups.map(({ aspect, label, formats }) => (
        <div key={aspect}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
            <span className="ml-1 font-normal text-muted-foreground/70">
              {aspect}
            </span>
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {formats.map((format) => {
              const active = format.id === activeFormatId;
              const locked = format.proOnly && !isPro;
              return (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => onSelect(format)}
                  title={`${format.width}×${format.height} · ${format.hint}${
                    locked ? " · Pro" : ""
                  }`}
                  className={cn(
                    "group flex flex-col items-stretch gap-1 rounded-md border bg-card px-1.5 py-1.5 text-left transition hover:border-brand-purple",
                    active
                      ? "border-brand-purple ring-2 ring-brand-purple/30"
                      : "border-border",
                    locked && "opacity-60",
                  )}
                >
                  <AspectGlyph format={format} />
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-[10px] font-medium">
                      {format.resolution.toUpperCase()}
                    </span>
                    {locked && (
                      <span className="text-[9px] uppercase tracking-wide text-amber-500">
                        Pro
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tiny representation of the aspect ratio — drawn as a centred outlined
 *  rectangle sized in proportion to the format's width/height. Gives the
 *  user a quick at-a-glance sense of "is this landscape or portrait?". */
function AspectGlyph({ format }: { format: VideoFormat }) {
  const max = Math.max(format.width, format.height);
  const wPct = (format.width / max) * 100;
  const hPct = (format.height / max) * 100;
  return (
    <div className="flex h-9 w-full items-center justify-center">
      <div
        className="rounded-sm border border-muted-foreground/40 bg-muted/50"
        style={{
          width: `${wPct}%`,
          height: `${hPct}%`,
          maxHeight: "100%",
        }}
      />
    </div>
  );
}
