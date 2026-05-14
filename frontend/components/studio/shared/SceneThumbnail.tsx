/**
 * SceneThumbnail — small visual preview of one CanvasState scene.
 *
 * Single source of truth for "how does a v2 scene look at thumbnail
 * size" — used by:
 *   - StudioLanding "My videos" tiles
 *   - ScenesRail in the v2 editor's left rail
 *   - AdvancedTimeline scene blocks (when we eventually add inline
 *     previews)
 *
 * Per the DRY rule: don't reimplement widget positioning math anywhere
 * else. If you need a scene preview, mount this.
 */
import type { Scene, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { cn } from "@/lib/utils";

export interface SceneThumbnailProps {
  scene: Scene;
  className?: string;
}

export default function SceneThumbnail({ scene, className }: SceneThumbnailProps) {
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{ backgroundColor: scene.backgroundColor }}
    >
      {scene.widgets.map((widget) => (
        <WidgetGlyph key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

/** Per-widget rendering. We deliberately don't render full text — at
 *  thumbnail scale a coloured bar reads better than 8pt copy. Headings
 *  show as solid filled bars, body text as faint translucent ones. */
function WidgetGlyph({ widget }: { widget: Widget }) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: `${widget.position.x * 100}%`,
    top: `${widget.position.y * 100}%`,
    width: `${widget.position.width * 100}%`,
    height: `${widget.position.height * 100}%`,
  };
  const p = widget.params;
  switch (p.kind) {
    case "heading":
    case "text":
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor:
              p.kind === "heading" ? p.data.color : "rgba(255,255,255,0.35)",
            opacity: p.kind === "heading" ? 0.95 : 0.7,
            borderRadius: 2,
          }}
        />
      );
    case "image": {
      const url = p.data.source.kind === "url" ? p.data.source.url : "";
      return (
        <div
          style={{
            ...baseStyle,
            backgroundImage: url ? `url(${url})` : undefined,
            backgroundColor: url ? undefined : "rgba(255,255,255,0.15)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            borderRadius: 2,
          }}
        />
      );
    }
    case "video": {
      // Video previews use a poster-like solid block — playing the
      // <video> at thumbnail scale is wasteful.
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: "rgba(15,23,42,0.6)",
            borderRadius: 2,
          }}
        />
      );
    }
    case "shape-rect":
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: p.data.fill,
            borderRadius: Math.min(p.data.cornerRadius * 0.5, 4),
          }}
        />
      );
    case "shape-circle":
      return (
        <div
          style={{ ...baseStyle, backgroundColor: p.data.fill, borderRadius: "50%" }}
        />
      );
    case "divider":
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: p.data.color,
            opacity: 0.7,
          }}
        />
      );
  }
}
