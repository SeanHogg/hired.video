/**
 * SceneLengthHandle — a scene block's right edge on the strip's scene row
 * (Advanced): drag it (or ← / → on it) to set how long the scene plays, in
 * the whole seconds the plan accepts (clampSceneSeconds). One gesture = one
 * undo step (its own group).
 */
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { SCENE_SECONDS_MAX, type VideoSceneId } from "@shared/video-plan";
import { clampSceneSeconds } from "@/lib/build/frame-edits";
import { SCENE_BLOCK_SELECTOR, secondsPerPxOf } from "@/lib/build/strip-geometry";
import TimeHandle from "./TimeHandle";

interface SceneLengthHandleProps {
  sceneId: VideoSceneId;
  /** How long the scene plays now. */
  seconds: number;
  onLength: (sceneId: VideoSceneId, seconds: number, group: string) => void;
}

export default function SceneLengthHandle({ sceneId, seconds, onLength }: SceneLengthHandleProps) {
  const { t } = useTranslation();
  const start = useRef({ seconds, group: "" });
  const gestures = useRef(0);
  return (
    <TimeHandle
      label={t("workspace.strip.sceneLength")}
      value={seconds}
      max={SCENE_SECONDS_MAX}
      secondsPerPx={secondsPerPxOf(SCENE_BLOCK_SELECTOR, seconds)}
      onBegin={() => {
        gestures.current += 1;
        start.current = { seconds, group: `video:duration:${sceneId}:${gestures.current}` };
      }}
      onDelta={(d) => {
        const next = clampSceneSeconds(start.current.seconds + d);
        if (next !== seconds) onLength(sceneId, next, start.current.group);
      }}
      keyStep={1}
      keyStepLarge={2}
      className="right-0 translate-x-1/2"
    />
  );
}
