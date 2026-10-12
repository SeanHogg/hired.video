/**
 * VideoDesignPanel — a kit's Design tool on the video page (Angle board):
 * first who it's made for and the theme (by date, every theme free), then
 * the shape, then a colour look for every scene (a scene can still take its
 * own look in its inspector), and "Make it more you".
 */
import { useTranslation } from "react-i18next";
import { VIDEO_SCENE_IDS, type VideoLookId, type VideoPlan } from "@shared/video-plan";
import { DEFAULT_SCENE_LOOKS } from "@/lib/build/scene-palette";
import type { BuildVideo } from "@/lib/build/use-build-video";
import LookSwatches from "./LookSwatches";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";
import { VideoAngleRow } from "./video-design/VideoAngleRow";
import { VideoShapePicker } from "./video-design/VideoShapePicker";
import { MakeItYouCard } from "./video-design/MakeItYouCard";

/** The look every scene shares, or null when they differ (or follow the theme). */
function sharedLook(plan: VideoPlan): VideoLookId | null {
  if (VIDEO_SCENE_IDS.every((id) => !plan.scenes?.[id]?.look)) return null;
  const looks = new Set(VIDEO_SCENE_IDS.map((id) => plan.scenes?.[id]?.look ?? DEFAULT_SCENE_LOOKS[id]));
  return looks.size === 1 ? [...looks][0] : null;
}

export default function VideoDesignPanel({ video }: { video: BuildVideo }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-5">
      <VideoAngleRow video={video} />
      <VideoShapePicker value={video.plan.aspect ?? "16:9"} onChange={video.setAspect} />
      <div className="flex flex-col gap-2">
        <LookSwatches
          legend={t("workspace.design.videoColours")}
          legendClassName={INSPECTOR_LABEL}
          value={sharedLook(video.plan)}
          onPick={video.setLookAll}
        />
        <p className="text-xs text-muted-foreground">{t("workspace.design.videoColoursHint")}</p>
      </div>
      <MakeItYouCard />
    </section>
  );
}
