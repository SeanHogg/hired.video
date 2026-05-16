/**
 * Source picker reused by both image and video widget Content sections.
 * Uses the standard URL-with-pickers shell so the same row reads the
 * same as every other "type a URL or pick an asset" field in the app:
 *
 *   ┌──────────────────────────────┐ ┌──┐ ┌──┐
 *   │ paste or pick…               │ │🖼│ │🎨│   ← icons: media, banner
 *   └──────────────────────────────┘ └──┘ └──┘
 *
 * MediaIconPicker covers Upload / Stock / AI generation. The
 * paintbrush icon (image widgets only) launches v1's
 * CustomBannerGenerator so users can author a branded banner without
 * leaving v2 (gap #609).
 */
import { lazy, Suspense, useState } from "react";
import { Paintbrush2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { MediaIconPicker } from "@/components/shared/MediaPicker";

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
  const noun = accept === "image" ? "image" : "video";
  const [bannerOpen, setBannerOpen] = useState(false);
  return (
    <>
      <UrlPickerInput
        value={url}
        onChange={(next) => onChange({ kind: "url", url: next })}
        placeholder={`Paste a ${noun} URL or pick one…`}
      >
        <MediaIconPicker
          accept={accept}
          onPick={(picked) => onChange({ kind: "url", url: picked })}
          label={`Upload, pick stock, or AI-generate ${noun === "image" ? "an image" : "a video"}`}
        />
        {accept === "image" && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setBannerOpen(true)}
            aria-label="Create custom banner"
            title="Create custom banner"
          >
            <Paintbrush2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </UrlPickerInput>
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
