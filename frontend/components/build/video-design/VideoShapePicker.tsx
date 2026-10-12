import { useTranslation } from "react-i18next";
import { VIDEO_ASPECTS, type VideoAspect } from "@shared/video-targeting";
import { cn } from "@/lib/utils";

/** Tile proportions for each shape (a small outline of the frame). */
const TILE: Record<VideoAspect, string> = { "16:9": "h-5 w-9", "9:16": "h-8 w-[18px]", "1:1": "h-6 w-6" };

/** Shape: 16:9 (YouTube, LinkedIn) · 9:16 (Shorts, TikTok, Reels) · 1:1 (feeds). */
export function VideoShapePicker({ value, onChange }: { value: VideoAspect; onChange: (aspect: VideoAspect) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("videoDesign.shape.label")}</legend>
      <div role="radiogroup" aria-label={t("videoDesign.shape.label")} className="grid grid-cols-3 gap-2">
        {VIDEO_ASPECTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={value === a}
            onClick={() => onChange(a)}
            className={cn(
              "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-lg border text-xs font-medium",
              value === a ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
            )}
          >
            <span aria-hidden="true" className={cn("rounded-sm border-2 border-current", TILE[a])} />
            <span>{a}</span>
            <span className="text-[11px] font-normal text-muted-foreground">{t(`videoDesign.shape.${a === "16:9" ? "wide" : a === "9:16" ? "tall" : "square"}`)}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
