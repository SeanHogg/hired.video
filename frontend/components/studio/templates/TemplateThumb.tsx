// Mock "slide preview" rendered inside each /studio template card. One
// map entry per `template.id` so each template gets a unique visual identity
// (background, accent shape, title treatment) — modelled on PowerPoint /
// Canva template grids. Pure CSS + inline SVG, no image assets needed.

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import type { ContentTemplate, TemplateDef } from "@/lib/studio/templates/catalog";
import { COMIC_GENRES, type ComicGenreId } from "@shared/comic-genres";
import { DRAWING_TEMPLATE_PRESETS } from "@/lib/studio/drawing/drawing-template-presets";
import DrawingPlaceholderThumbnail from "@/components/studio/drawing/DrawingPlaceholderThumbnail";
import { getAnimationTemplatePreset } from "@/lib/studio/animation/animation-seeds";
import { getCadTemplatePreset } from "@/lib/studio/cad/cad-seeds";
import { AnimationThumb, CadThumb, ComicThumb } from "./thumbs/kind-thumbs";
import { PITCH_TEMPLATE_THUMBS } from "./thumbs/pitch-thumbs";
import { MEDIA_TEMPLATE_THUMBS } from "./thumbs/media-thumbs";
import type { TemplateThumbMap } from "./thumbs/types";

/** Every static (non-derived) template thumbnail, keyed by template id. */
const STATIC_TEMPLATE_THUMBS: TemplateThumbMap = {
  ...PITCH_TEMPLATE_THUMBS,
  ...MEDIA_TEMPLATE_THUMBS,
};

interface TemplateThumbProps {
  template: TemplateDef;
  className?: string;
}

export default function TemplateThumb({ template, className }: TemplateThumbProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-md",
        className,
      )}
    >
      {renderThumb(template.id, t)}
    </div>
  );
}

function renderThumb(id: ContentTemplate, t: TFunction) {
  // Comic genre cards — one branch covers all 12 ids. Palette is read
  // from the SSoT (`COMIC_GENRES`) so adding a 13th genre needs ZERO
  // changes here — the per-id thumb shape is genre-derived. Per the
  // DRY rule: one branch in this switch, one inline `<ComicThumb>` body,
  // no per-genre case proliferation.
  if (id.startsWith("comic_")) {
    const genreId = id.slice("comic_".length) as ComicGenreId;
    const genre = COMIC_GENRES.find((g) => g.id === genreId) ?? COMIC_GENRES[0];
    return <ComicThumb genre={genre} />;
  }
  // Drawing-template thumbnails (#932 / #945). One derived branch
  // covers every drawing_* template — palette + dimensions come from
  // the single SSoT (`DRAWING_TEMPLATE_PRESETS`), so adding a new
  // drawing template needs ZERO changes here. Per DRY: one branch,
  // one inline `<DrawingThumb>` body, no per-template case
  // proliferation.
  if (id.startsWith("drawing_")) {
    const preset = DRAWING_TEMPLATE_PRESETS[id];
    if (preset) {
      return (
        <DrawingPlaceholderThumbnail
          width={preset.width}
          height={preset.height}
          accent={preset.accent}
          dimensionLabel={preset.dimensionLabel}
        />
      );
    }
  }
  // Animation-template thumbnails (#1003). Same derived-branch pattern
  // as comic + drawing — single SSoT (`ANIMATION_TEMPLATE_PRESETS` in
  // animation-seeds.ts) drives the visual (frame strip mini-preview at
  // the seed's starter frame count + fps badge), so adding a 5th
  // animation template needs ZERO changes here.
  if (id.startsWith("animation-")) {
    const preset = getAnimationTemplatePreset(id);
    if (preset) {
      return <AnimationThumb id={id} preset={preset} />;
    }
  }
  // CAD-template thumbnails (#930). Single SSoT
  // (`CAD_TEMPLATE_PRESETS` in cad-seeds.ts) drives the visual — a
  // technical-drawing-shaped grid + dimension callout + scale chip.
  // Adding a 5th CAD template needs ZERO changes here.
  if (id.startsWith("cad-")) {
    const preset = getCadTemplatePreset(id);
    if (preset) {
      return <CadThumb id={id} preset={preset} />;
    }
  }
  return STATIC_TEMPLATE_THUMBS[id]?.(t);
}
