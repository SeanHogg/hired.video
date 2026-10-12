/**
 * LookSwatches — the video's colour looks as swatches (one scene's look, or
 * the whole video's). `value` null = no single look is in use.
 */
import { useTranslation } from "react-i18next";
import { VIDEO_LOOK_IDS, type VideoLookId } from "@shared/video-plan";
import { SCENE_LOOKS } from "@/lib/build/scene-palette";
import { cn } from "@/lib/utils";

interface LookSwatchesProps {
  legend: string;
  legendClassName?: string;
  value: VideoLookId | null;
  onPick: (look: VideoLookId) => void;
}

export default function LookSwatches({ legend, legendClassName, value, onPick }: LookSwatchesProps) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={cn(legendClassName, "mb-2")}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {VIDEO_LOOK_IDS.map((look) => {
          const swatch = SCENE_LOOKS[look];
          const active = value === look;
          return (
            <button
              key={look}
              type="button"
              aria-pressed={active}
              aria-label={t(`build.scene.lookName.${look}`)}
              title={t(`build.scene.lookName.${look}`)}
              onClick={() => onPick(look)}
              className={cn(
                "h-10 w-10 rounded-lg border-2 transition-transform hover:scale-105",
                active ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundImage: `linear-gradient(135deg, ${swatch.from}, ${swatch.to})` }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
