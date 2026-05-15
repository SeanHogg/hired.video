/**
 * Source picker reused by both image and video widget Content sections.
 * MediaPicker covers Upload / Stock (Unsplash / Pexels / Pixabay) / AI
 * generation behind one trigger. Image widgets additionally surface
 * v1's CustomBannerGenerator launcher so users can author a branded
 * banner without leaving v2 (gap #609).
 *
 * Per the DRY rule: this is the SINGLE source for "image / video
 * source picker" in the v2 inspector — image and video Content sections
 * used to duplicate the picker block.
 */
import { lazy, Suspense, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MediaPicker from "@/components/shared/MediaPicker";

// Lazy-load the banner generator so the canvas drawing + theme
// presets don't ship in the initial editor bundle.
const CustomBannerGenerator = lazy(() =>
  import("@/components/studio/CustomBannerGenerator").then((m) => ({
    default: m.CustomBannerGenerator,
  })),
);

export interface SourceEditorProps {
  accept: "image" | "video";
  source: { kind: "sourceId"; id: string } | { kind: "url"; url: string };
  onChange: (source: { kind: "url"; url: string }) => void;
  /** Box aspect (width/height) of the widget — used to pre-size the
   *  custom banner to the widget's frame when launching. Optional. */
  widgetAspect?: number;
}

export default function SourceEditor({
  accept,
  source,
  onChange,
  widgetAspect,
}: SourceEditorProps) {
  const url = source.kind === "url" ? source.url : "";
  const hasUrl = source.kind === "url" && source.url.length > 0;
  const noun = accept === "image" ? "image" : "video";
  const [bannerOpen, setBannerOpen] = useState(false);
  return (
    <>
      <MediaPicker
        accept={accept}
        title={`Replace ${noun}`}
        triggerLabel={hasUrl ? `Replace ${noun}` : `Choose ${noun}`}
        onPick={(asset) => onChange({ kind: "url", url: asset.url })}
      />
      {accept === "image" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBannerOpen(true)}
          className="mt-2 w-full justify-center gap-2"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Create custom banner
        </Button>
      )}
      <Input
        value={url}
        placeholder="…or paste a URL"
        className="mt-2"
        onChange={(e) => onChange({ kind: "url", url: e.target.value })}
      />
      {accept === "image" && bannerOpen && (
        <Suspense fallback={null}>
          <CustomBannerGenerator
            open={bannerOpen}
            onOpenChange={setBannerOpen}
            onGenerated={(dataUrl) => {
              onChange({ kind: "url", url: dataUrl });
              setBannerOpen(false);
            }}
            sceneBoxAspect={widgetAspect}
          />
        </Suspense>
      )}
    </>
  );
}
