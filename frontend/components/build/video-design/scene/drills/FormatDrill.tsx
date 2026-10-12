/**
 * Format — the whole video's shape (16:9 · 9:16 · 1:1), the kit's own
 * VideoShapePicker writing `plan.aspect`.
 */
import { useTranslation } from "react-i18next";
import { VideoShapePicker } from "@/components/build/video-design/VideoShapePicker";
import type { SceneDrillProps } from "../types";

export default function FormatDrill({ video }: SceneDrillProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <VideoShapePicker value={video.plan.aspect ?? "16:9"} onChange={video.setAspect} />
      <p className="text-[13px] text-muted-foreground">{t("build.sceneInspector.formatHelp")}</p>
    </div>
  );
}
