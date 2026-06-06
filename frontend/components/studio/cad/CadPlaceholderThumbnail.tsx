/**
 * CadPlaceholderThumbnail — project-tile preview for `mediaKind: "cad"` and
 * `"cad_3d"`. Renders a drafting-paper grid with a mock part + dimension chip
 * so the tile reads as a technical drawing — sharing the blueprint aesthetic
 * of the CAD template cards (`TemplateThumb`'s CadThumb). Replaces the audio
 * waveform the CAD kinds fell through to before this existed.
 *
 * Representative (not yet a faithful render of `CadState.shapes` — that's a
 * follow-on, logged in the gap register). The `variant` switches the accent +
 * label so a 2D drawing tile and a 3D model tile stay visually distinct.
 */
import { cn } from "@/lib/utils";

interface CadPlaceholderThumbnailProps {
  variant?: "2d" | "3d";
  /** Sheet dimensions surfaced as a chip when known. */
  widthMm?: number | null;
  heightMm?: number | null;
  unit?: string;
  className?: string;
}

export default function CadPlaceholderThumbnail({
  variant = "2d",
  widthMm,
  heightMm,
  unit = "mm",
  className,
}: CadPlaceholderThumbnailProps) {
  const is3d = variant === "3d";
  const paper = is3d ? "#1e3a8a" : "#f8fafc";
  const grid = is3d ? "#3b82f6" : "#cbd5e1";
  const ink = is3d ? "#dbeafe" : "#0f172a";
  const chip = is3d
    ? "bg-indigo-300 text-indigo-950"
    : "bg-cyan-600 text-white";
  const gridId = is3d ? "cad-thumb-grid-3d" : "cad-thumb-grid-2d";

  return (
    <div
      className={cn("relative h-full w-full", className)}
      style={{ backgroundColor: paper }}
    >
      <svg
        viewBox="0 0 100 56"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <pattern id={gridId} width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke={grid} strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100" height="56" fill={`url(#${gridId})`} />
        {is3d ? (
          // Isometric cube — telegraphs "3D model".
          <>
            <polygon points="50,12 74,24 74,44 50,56 26,44 26,24" fill="none" stroke={ink} strokeWidth="1.2" />
            <polyline points="26,24 50,36 74,24" fill="none" stroke={ink} strokeWidth="1" />
            <line x1="50" y1="36" x2="50" y2="56" stroke={ink} strokeWidth="1" />
          </>
        ) : (
          // A dimensioned part with two holes.
          <>
            <rect x="20" y="14" width="60" height="26" rx="3" fill="none" stroke={ink} strokeWidth="1.5" />
            <circle cx="35" cy="27" r="3" fill="none" stroke={ink} strokeWidth="1" />
            <circle cx="65" cy="27" r="3" fill="none" stroke={ink} strokeWidth="1" />
            <line x1="20" y1="47" x2="80" y2="47" stroke={ink} strokeWidth="0.5" />
          </>
        )}
      </svg>
      {widthMm && heightMm ? (
        <div className={cn("absolute bottom-1 right-1 rounded-sm px-1.5 py-0.5 text-[7px] font-bold", chip)}>
          {widthMm}×{heightMm}{unit}
        </div>
      ) : null}
    </div>
  );
}
