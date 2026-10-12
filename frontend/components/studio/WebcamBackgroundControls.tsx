/**
 * Recorder background controls (#127 / #1787): none · blur (with strength) ·
 * colour (any colour) · image (a photo from the device).
 *
 * Owns the per-mode settings so switching modes keeps what the user picked
 * (blur strength, colour, the decoded image) and releases a replaced image
 * bitmap. The recorder only receives the resulting `BackgroundReplacement`,
 * which its draw loop reads every frame — no stream rebuild on change.
 *
 * The host hides this for screen-only mode (there is no person to segment).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { BackgroundReplacement } from "@/lib/studio/webcam/background-removal";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BLUR_PX,
  MAX_BLUR_PX,
  MIN_BLUR_PX,
  loadBackgroundBitmap,
  type BackgroundImageError,
} from "@/lib/studio/webcam/background-image";

type BackgroundKind = BackgroundReplacement["kind"];

const KINDS: ReadonlyArray<{ kind: BackgroundKind; labelKey: string }> = [
  { kind: "none", labelKey: "webcamRecorder.backgroundNone" },
  { kind: "blur", labelKey: "webcamRecorder.backgroundBlur" },
  { kind: "color", labelKey: "webcamRecorder.backgroundColor" },
  { kind: "image", labelKey: "webcamRecorder.backgroundImage" },
];

const IMAGE_ERROR_KEYS: Record<BackgroundImageError, string> = {
  not_image: "webcamRecorder.backgroundImageNotImage",
  too_large: "webcamRecorder.backgroundImageTooLarge",
  unreadable: "webcamRecorder.backgroundImageUnreadable",
};

export interface WebcamBackgroundControlsProps {
  value: BackgroundReplacement;
  onChange: (next: BackgroundReplacement) => void;
  /** Locked while recording so the take is consistent. */
  disabled?: boolean;
}

export function WebcamBackgroundControls({ value, onChange, disabled }: WebcamBackgroundControlsProps) {
  const { t } = useTranslation();
  const [blurPx, setBlurPx] = useState(value.kind === "blur" ? value.sigmaPx : DEFAULT_BLUR_PX);
  const [color, setColor] = useState(value.kind === "color" ? value.hex : DEFAULT_BACKGROUND_COLOR);
  const [image, setImage] = useState<{ bitmap: ImageBitmap; name: string } | null>(null);
  const [imageError, setImageError] = useState<BackgroundImageError | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Release the decoded photo when it's replaced or the recorder closes.
  const imageRef = useRef(image);
  imageRef.current = image;
  useEffect(() => () => imageRef.current?.bitmap.close(), []);

  const pickKind = (kind: BackgroundKind) => {
    setImageError(null);
    if (kind === "none") onChange({ kind: "none" });
    else if (kind === "blur") onChange({ kind: "blur", sigmaPx: blurPx });
    else if (kind === "color") onChange({ kind: "color", hex: color });
    else if (image) onChange({ kind: "image", bitmap: image.bitmap });
    else fileInputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setLoadingImage(true);
    setImageError(null);
    const result = await loadBackgroundBitmap(file);
    setLoadingImage(false);
    if ("error" in result) {
      setImageError(result.error);
      return;
    }
    const previous = imageRef.current;
    setImage({ bitmap: result.bitmap, name: file.name });
    onChange({ kind: "image", bitmap: result.bitmap });
    // The draw loop picks up the new bitmap on its next frame; free the old one after.
    if (previous) requestAnimationFrame(() => previous.bitmap.close());
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("webcamRecorder.background")}</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("webcamRecorder.background")}>
          {KINDS.map((opt) => (
            <Button
              key={opt.kind}
              type="button"
              variant={value.kind === opt.kind ? "default" : "outline"}
              size="sm"
              disabled={disabled || (opt.kind === "image" && loadingImage)}
              aria-pressed={value.kind === opt.kind}
              onClick={() => pickKind(opt.kind)}
            >
              {t(opt.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      {value.kind === "blur" && (
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="shrink-0">{t("webcamRecorder.blurStrength")}</span>
          <Slider
            className="max-w-[220px]"
            min={MIN_BLUR_PX}
            max={MAX_BLUR_PX}
            step={1}
            value={[blurPx]}
            disabled={disabled}
            aria-label={t("webcamRecorder.blurStrength")}
            onValueChange={([px]) => {
              if (px === undefined) return;
              setBlurPx(px);
              onChange({ kind: "blur", sigmaPx: px });
            }}
          />
          <span className="w-8 shrink-0 tabular-nums">{blurPx}</span>
        </label>
      )}

      {value.kind === "color" && (
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="shrink-0">{t("webcamRecorder.backgroundColorPick")}</span>
          <input
            type="color"
            value={color}
            disabled={disabled}
            aria-label={t("webcamRecorder.backgroundColorPick")}
            className="h-8 w-12 cursor-pointer rounded border border-input bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => {
              setColor(e.target.value);
              onChange({ kind: "color", hex: e.target.value });
            }}
          />
          <span className="font-mono uppercase">{color}</span>
        </label>
      )}

      {(value.kind === "image" || loadingImage || imageError) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || loadingImage}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {loadingImage
              ? t("webcamRecorder.backgroundImageLoading")
              : image
                ? t("webcamRecorder.backgroundImageChange")
                : t("webcamRecorder.backgroundImageChoose")}
          </Button>
          {image && !loadingImage && <span className="min-w-0 max-w-[180px] truncate">{image.name}</span>}
          {imageError && (
            <span role="alert" className="text-destructive">
              {t(IMAGE_ERROR_KEYS[imageError])}
            </span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
