/**
 * Export — the whole video's download / post settings: resolution (4K is
 * Pro, as in the studio's format catalog), frame rate, and codec (the
 * studio's CodecPicker, which self-gates its Pro codecs). Defaults
 * (1080p · 30 fps · H.264) clear the setting.
 */
import { useTranslation } from "react-i18next";
import { EXPORT_CODECS, EXPORT_FPS, EXPORT_RESOLUTIONS, type ExportResolution, type VideoExport } from "@shared/video-plan";
import CodecPicker from "@/components/studio/shared/CodecPicker";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";
import type { SceneDrillProps } from "../types";

const RESOLUTION_LABEL: Record<ExportResolution, string> = { "720p": "720p", "1080p": "1080p", "4k": "4K" };
const PRO_RESOLUTIONS: ReadonlySet<ExportResolution> = new Set(["4k"]);

interface ChoiceProps<T extends string | number> {
  legend: string;
  options: readonly T[];
  value: T;
  label: (option: T) => string;
  disabled?: (option: T) => boolean;
  badge?: (option: T) => string | null;
  onPick: (option: T) => void;
}

function Choice<T extends string | number>({ legend, options, value, label, disabled, badge, onPick }: ChoiceProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={cn(INSPECTOR_LABEL, "mb-1")}>{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const on = option === value;
          const tag = badge?.(option);
          return (
            <button
              key={String(option)}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled?.(option)}
              onClick={() => onPick(option)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60",
                on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {label(option)}
              {tag && <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{tag}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ExportDrill({ video }: SceneDrillProps) {
  const { t } = useTranslation();
  const { isPro } = useSubscription();
  const settings: VideoExport = video.plan.export ?? {};
  const resolution = settings.resolution ?? "1080p";
  return (
    <div className="flex flex-col gap-5">
      <Choice
        legend={t("build.sceneInspector.resolution")}
        options={EXPORT_RESOLUTIONS}
        value={resolution}
        label={(r) => RESOLUTION_LABEL[r]}
        disabled={(r) => PRO_RESOLUTIONS.has(r) && !isPro && r !== resolution}
        badge={(r) => (PRO_RESOLUTIONS.has(r) ? t("build.sceneInspector.pro") : null)}
        onPick={(r) => video.setExport({ resolution: r === "1080p" ? undefined : r })}
      />
      <Choice
        legend={t("build.sceneInspector.fps")}
        options={EXPORT_FPS}
        value={settings.fps ?? 30}
        label={(fps) => t("build.sceneInspector.fpsValue", { fps })}
        onPick={(fps) => video.setExport({ fps: fps === 30 ? undefined : fps })}
      />
      <CodecPicker
        codecs={EXPORT_CODECS}
        activeCodecId={settings.codec ?? null}
        onSelect={(preset) => video.setExport({ codec: preset.id === "h264" ? undefined : preset.id })}
      />
      <p className="text-[13px] text-muted-foreground">{t("build.sceneInspector.exportHelp")}</p>
    </div>
  );
}
